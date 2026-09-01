# -*- coding: utf-8 -*-
"""SistemaGreace — Control de Cartas (Flask + MySQL + import Excel)."""
import gzip
import hashlib
import json
import logging
import os
import queue
import re
import threading
import time
from datetime import date, timedelta
from pathlib import Path

import pymysql
from flask import Flask, g, jsonify, request, send_file, send_from_directory, session
from pymysql.cursors import DictCursor

from backfill_cartas import backfill_cartas
from import_excel import import_excel_to_db
from plazos_respuesta import plazos_respuesta_config, set_plazos_config
from plazos import build_whatsapp_message, classify_cartas, plazos_config, set_sla_config
from normalizers import normalize_especialidad, normalize_estado, normalize_referencias_antecedentes, refresh_normalized_fields, carta_matches_especialidad, catalogo_payload
from clasificacion import (
    ACTORES,
    build_pendientes,
    build_saldos,
    build_status_supervision,
    build_whatsapp_debo_message,
    classify_carta,
    public_pendientes,
)
from whatsapp_notify import send_whatsapp, whatsapp_config
try:
    from generador_word import generar_carta_docx
except ImportError:
    generar_carta_docx = None
from hilos import (
    HILO_OPERATIVO_MAX_DIAS,
    assign_carta_hilo,
    build_whatsapp_hilos_urgentes,
    list_hilos_api,
    persist_hilos,
    rebuild_hilos_fast,
    set_hilo_plazo_config,
    try_close_referenced_cartas,
)
from auth import (
    AUTH_REQUIRED,
    VALID_ROLES,
    admin_set_password,
    change_own_password,
    create_usuario,
    ensure_usuarios_table,
    filter_cartas_for_user,
    list_usuarios_public,
    load_session_user,
    login_user,
    logout_user,
    public_user,
    require_auth,
    require_perm,
    seed_usuarios,
    update_usuario,
    verify_login,
)

BASE = Path(__file__).resolve().parent

MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3307"))
MYSQL_DATABASE = os.environ.get("MYSQL_DATABASE", "sistemagreace")
MYSQL_USER = os.environ.get("MYSQL_USER", "greace")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "greace_pass_change_me")
MYSQL_WAIT_SECONDS = int(os.environ.get("MYSQL_WAIT_SECONDS", "60"))
MYSQL_SSL = os.environ.get("MYSQL_SSL", "0") in ("1", "true", "True", "yes", "REQUIRED")

APP_HOST = os.environ.get("APP_HOST", "0.0.0.0")
APP_PORT = int(os.environ.get("PORT") or os.environ.get("APP_PORT", "5000"))
FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "0") in ("1", "true", "True", "yes")
NOTIFY_SECRET = (os.environ.get("NOTIFY_SECRET") or "").strip()
AUTO_IMPORT_EXCEL = os.environ.get("AUTO_IMPORT_EXCEL", "1") in ("1", "true", "True", "yes")
WHATSAPP_DIGEST_MODE = (os.environ.get("WHATSAPP_DIGEST_MODE") or "debo").strip().lower()
WHATSAPP_DEBO_TOP = int(os.environ.get("WHATSAPP_DEBO_TOP", "10"))
WHATSAPP_DEBO_ESP = int(os.environ.get("WHATSAPP_DEBO_ESP", "5"))
SECRET_KEY = os.environ.get("SECRET_KEY") or "sistemagreace-dev-change-me-in-prod"

CARTA_FIELDS = [
    "bandeja",
    "sentido",
    "n_orden",
    "fecha",
    "n_documento",
    "tipo_documento",
    "asunto",
    "especialidad",
    "estado",
    "referencias",
    "referencia",
    "folios",
    "cd",
    "dirigido_a",
    "receptor",
    "cargo",
    "observacion",
    "area",
    "empresa",
    "caducidad",
    "fecha_respuesta",
    "carta_respuesta",
    "link_drive",
]

CARTA_SELECT_COLS = (
    "id, bandeja, sentido, n_orden, fecha, n_documento, tipo_documento, asunto, "
    "especialidad, especialidad_norm, estado, estado_norm, referencias, referencia, "
    "folios, cd, dirigido_a, receptor, cargo, observacion, area, empresa, caducidad, "
    "fecha_respuesta, carta_respuesta, hilo_id, link_drive"
)

CONFIG_SELECT_COLS = (
    "id, nombre_sistema, subtitulo_proyecto, logo_url, favicon_url, logo_membrete_word, "
    "dias_vencida, dias_por_vencer, dias_hilo, plazo_sup_dias, plazo_entidad_dias, "
    "plazo_muni_dias, plazo_jrd_dias, plazo_ro_dias, actualizado_en"
)

CONFIG_PLAZOS_COLS = (
    "id, dias_vencida, dias_por_vencer, dias_hilo, plazo_sup_dias, "
    "plazo_entidad_dias, plazo_muni_dias, plazo_jrd_dias, plazo_ro_dias"
)

BANDEJAS = {
    "residente": "1. Emitidas Residente",
    "rl": "2. Emitidas RL",
    "recibida_sup": "3. Recibidas Supervisión",
    "recibida_pronis": "5. Recibidas PRONIS",
    "recibida_mpsc": "6. Recibidas MPSC",
    "recibida_otros": "4. Recibidas Otros",
}

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # Límite de 32 MB para evitar ataques de DoS por payloads gigantes


@app.after_request
def _set_security_headers(response):
    """Cabeceras de seguridad HTTP globales para blindar navegación y APIs."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=()"
    if "Content-Security-Policy" not in response.headers:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval' "
            "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com; "
            "frame-ancestors 'self';"
        )
    return response


def current_user():
    return load_session_user(get_db())


app.config["GET_CURRENT_USER"] = current_user


AUTH_OPEN_PATHS = {
    "/api/health",
    "/health",
    "/api/config",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/change-password",
}


@app.before_request
def _gate_password_rotation():
    path = request.path or ""
    if not path.startswith("/api/"):
        return None
    if path in AUTH_OPEN_PATHS or path.startswith("/api/auth/login"):
        return None
    if not AUTH_REQUIRED:
        return None
    # Evitar tocar DB en rutas públicas ya cubiertas
    try:
        u = current_user()
    except Exception:
        return None
    if u and u.get("must_change_password"):
        return (
            jsonify(
                {
                    "error": "Debes cambiar tu contraseña antes de continuar",
                    "code": "password_change_required",
                }
            ),
            403,
        )
    return None


_RAW_CARTAS_CACHE = None
_CACHE_VERSION = int(time.time() * 1000)


def invalidate_cartas_cache():
    global _RAW_CARTAS_CACHE, _CACHE_VERSION
    _RAW_CARTAS_CACHE = None
    _CACHE_VERSION = int(time.time() * 1000)


def scoped_cartas(db=None):
    db = db or get_db()
    rows = _load_cartas(db)
    return filter_cartas_for_user(rows, current_user())


class MySQLConnectionPool:
    """Pool de conexiones MySQL thread-safe, auto-reciclable y de alta disponibilidad."""

    def __init__(self, max_size=10, timeout=10.0):
        self.max_size = max(2, max_size)
        self.timeout = timeout
        self._pool = queue.Queue(maxsize=self.max_size)
        self._created_count = 0
        self._lock = threading.Lock()

    def _create_raw_connection(self):
        kwargs = {
            "host": MYSQL_HOST,
            "port": MYSQL_PORT,
            "user": MYSQL_USER,
            "password": MYSQL_PASSWORD,
            "database": MYSQL_DATABASE,
            "charset": "utf8mb4",
            "cursorclass": DictCursor,
            "autocommit": False,
            "connect_timeout": 5,
        }
        if MYSQL_SSL:
            kwargs["ssl"] = {"check_hostname": False}
        return pymysql.connect(**kwargs)

    def get_connection(self):
        """Obtiene una conexión viva del pool o crea una nueva si no se ha alcanzado el límite."""
        conn = None
        try:
            conn = self._pool.get_nowait()
        except queue.Empty:
            with self._lock:
                if self._created_count < self.max_size:
                    self._created_count += 1
                    try:
                        conn = self._create_raw_connection()
                    except Exception:
                        self._created_count -= 1
                        raise

        if conn is None:
            try:
                conn = self._pool.get(timeout=self.timeout)
            except queue.Empty:
                logging.warning("[db-pool] Pool saturado (%d conexiones), creando conexión de respaldo", self.max_size)
                return self._create_raw_connection()

        try:
            conn.ping()
        except Exception:
            try:
                conn.close()
            except Exception:
                pass
            conn = self._create_raw_connection()

        return conn

    def release_connection(self, conn):
        """Devuelve la conexión al pool tras hacer rollback preventivo de transacciones."""
        if conn is None:
            return
        try:
            if getattr(conn, "open", False):
                conn.rollback()
                self._pool.put_nowait(conn)
            else:
                with self._lock:
                    self._created_count = max(0, self._created_count - 1)
        except (queue.Full, Exception):
            try:
                conn.close()
            except Exception:
                pass
            with self._lock:
                self._created_count = max(0, self._created_count - 1)

    def close_all(self):
        """Cierra todas las conexiones del pool."""
        while not self._pool.empty():
            try:
                conn = self._pool.get_nowait()
                conn.close()
            except Exception:
                pass
        with self._lock:
            self._created_count = 0


DB_POOL = MySQLConnectionPool(max_size=int(os.environ.get("MYSQL_POOL_SIZE", "12")))


def connect_raw_mysql():
    """Crea una conexión dedicada no administrada por el pool (para workers largos o scripts)."""
    return DB_POOL._create_raw_connection()


def connect_mysql():
    """Obtiene una conexión del pool compartido."""
    return DB_POOL.get_connection()


def wait_for_mysql():
    deadline = time.time() + MYSQL_WAIT_SECONDS
    last_err = None
    while time.time() < deadline:
        try:
            conn = connect_raw_mysql()
            conn.close()
            return
        except pymysql.MySQLError as exc:
            last_err = exc
            time.sleep(2)
    raise RuntimeError(f"MySQL no disponible: {last_err}")


def get_db():
    if "db" not in g:
        g.db = DB_POOL.get_connection()
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        try:
            DB_POOL.release_connection(db)
        except Exception:
            pass


def init_db(conn=None):
    own = conn is None
    if own:
        conn = connect_mysql()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS cartas (
                    id INT NOT NULL AUTO_INCREMENT,
                    bandeja VARCHAR(40) NOT NULL,
                    sentido VARCHAR(20) NOT NULL DEFAULT 'emitida',
                    n_orden INT NULL,
                    fecha DATE NULL,
                    n_documento VARCHAR(255) NOT NULL,
                    asunto TEXT NULL,
                    especialidad VARCHAR(255) NULL,
                    especialidad_norm VARCHAR(120) NULL,
                    estado VARCHAR(120) NULL,
                    estado_norm VARCHAR(120) NULL,
                    referencias TEXT NULL,
                    referencia VARCHAR(255) NULL,
                    folios VARCHAR(50) NULL,
                    cd VARCHAR(20) NULL,
                    dirigido_a VARCHAR(255) NULL,
                    receptor VARCHAR(255) NULL,
                    cargo VARCHAR(255) NULL,
                    observacion TEXT NULL,
                    area VARCHAR(255) NULL,
                    empresa VARCHAR(255) NULL,
                    caducidad VARCHAR(20) NULL,
                    fecha_respuesta DATE NULL,
                    carta_respuesta VARCHAR(255) NULL,
                    link_drive TEXT NULL,
                    hilo_id INT NULL,
                    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_cartas_bandeja (bandeja),
                    KEY idx_cartas_estado (estado_norm),
                    KEY idx_cartas_esp (especialidad_norm),
                    KEY idx_cartas_fecha (fecha),
                    KEY idx_cartas_doc (n_documento),
                    KEY idx_cartas_hilo (hilo_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            # Migración: bases ya creadas sin hilo_id
            cur.execute("SHOW COLUMNS FROM cartas LIKE 'hilo_id'")
            if not cur.fetchone():
                cur.execute(
                    "ALTER TABLE cartas ADD COLUMN hilo_id INT NULL, "
                    "ADD KEY idx_cartas_hilo (hilo_id)"
                )
            cur.execute("SHOW COLUMNS FROM cartas LIKE 'link_drive'")
            if not cur.fetchone():
                cur.execute(
                    "ALTER TABLE cartas ADD COLUMN link_drive TEXT NULL "
                    "AFTER carta_respuesta"
                )
            cur.execute("SHOW COLUMNS FROM cartas LIKE 'tipo_documento'")
            if not cur.fetchone():
                cur.execute(
                    "ALTER TABLE cartas ADD COLUMN tipo_documento VARCHAR(80) NULL "
                    "AFTER n_documento"
                )
            cur.execute("SHOW COLUMNS FROM cartas LIKE 'referencia'")
            if not cur.fetchone():
                cur.execute(
                    "ALTER TABLE cartas ADD COLUMN referencia VARCHAR(255) NULL "
                    "AFTER referencias"
                )
                cur.execute(
                    "ALTER TABLE cartas ADD KEY idx_cartas_referencia (referencia(80))"
                )
            # Migración: índices compuestos para acelerar filtros y consultas
            cur.execute("SHOW INDEX FROM cartas")
            existing_idx = {r.get("Key_name") for r in cur.fetchall() if isinstance(r, dict)}
            idx_defs = [
                ("idx_cartas_bandeja_fecha", "ADD KEY idx_cartas_bandeja_fecha (bandeja, fecha)"),
                ("idx_cartas_estado_fecha", "ADD KEY idx_cartas_estado_fecha (estado_norm, fecha)"),
                ("idx_cartas_esp_fecha", "ADD KEY idx_cartas_esp_fecha (especialidad_norm, fecha)"),
                ("idx_cartas_sentido_fecha", "ADD KEY idx_cartas_sentido_fecha (sentido, fecha)"),
                ("ft_cartas_search", "ADD FULLTEXT KEY ft_cartas_search (n_documento, asunto, referencias, observacion, especialidad)")
            ]
            for iname, isql in idx_defs:
                if iname not in existing_idx:
                    try:
                        cur.execute(f"ALTER TABLE cartas {isql}")
                    except Exception as e:
                        logging.warning("No se pudo crear indice %s: %s", iname, e)
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS whatsapp_alert_log (
                    id INT NOT NULL AUTO_INCREMENT,
                    alert_date DATE NOT NULL,
                    kind VARCHAR(40) NOT NULL,
                    payload_hash VARCHAR(64) NOT NULL,
                    message_preview VARCHAR(500) NULL,
                    provider_response TEXT NULL,
                    ok TINYINT(1) NOT NULL DEFAULT 0,
                    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_wa_day_kind_hash (alert_date, kind, payload_hash)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS hilos (
                    id INT NOT NULL AUTO_INCREMENT,
                    clave VARCHAR(255) NOT NULL,
                    titulo VARCHAR(255) NULL,
                    especialidad_norm VARCHAR(120) NULL,
                    estado VARCHAR(40) NOT NULL DEFAULT 'abierto',
                    fecha_inicio DATE NULL,
                    fecha_cierre DATE NULL,
                    dias_congelados INT NULL,
                    n_cartas INT NOT NULL DEFAULT 0,
                    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_hilos_clave (clave),
                    KEY idx_hilos_estado (estado)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS configuracion_sistema (
                    id INT NOT NULL PRIMARY KEY DEFAULT 1,
                    nombre_sistema VARCHAR(120) NOT NULL DEFAULT 'SistemaGreace',
                    subtitulo_proyecto VARCHAR(200) NOT NULL DEFAULT 'Hospital Leoncio Prado (PRONIS/MINSA)',
                    logo_url MEDIUMTEXT NULL,
                    favicon_url MEDIUMTEXT NULL,
                    logo_membrete_word MEDIUMTEXT NULL,
                    dias_vencida INT NOT NULL DEFAULT 15,
                    dias_por_vencer INT NOT NULL DEFAULT 10,
                    dias_hilo INT NOT NULL DEFAULT 5,
                    plazo_sup_dias INT NOT NULL DEFAULT 5,
                    plazo_entidad_dias INT NOT NULL DEFAULT 15,
                    plazo_muni_dias INT NOT NULL DEFAULT 15,
                    plazo_jrd_dias INT NOT NULL DEFAULT 15,
                    plazo_ro_dias INT NOT NULL DEFAULT 5,
                    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """
            )
            for col, ddl in (
                ("plazo_sup_dias", "ADD COLUMN plazo_sup_dias INT NOT NULL DEFAULT 5"),
                ("plazo_entidad_dias", "ADD COLUMN plazo_entidad_dias INT NOT NULL DEFAULT 15"),
                ("plazo_muni_dias", "ADD COLUMN plazo_muni_dias INT NOT NULL DEFAULT 15"),
                ("plazo_jrd_dias", "ADD COLUMN plazo_jrd_dias INT NOT NULL DEFAULT 15"),
                ("plazo_ro_dias", "ADD COLUMN plazo_ro_dias INT NOT NULL DEFAULT 5"),
                ("logo_membrete_word", "ADD COLUMN logo_membrete_word MEDIUMTEXT NULL"),
            ):
                cur.execute(f"SHOW COLUMNS FROM configuracion_sistema LIKE '{col}'")
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE configuracion_sistema {ddl}")
            cur.execute("SELECT id FROM configuracion_sistema WHERE id=1")
            if not cur.fetchone():
                cur.execute(
                    """
                    INSERT INTO configuracion_sistema (
                        id, nombre_sistema, subtitulo_proyecto,
                        dias_vencida, dias_por_vencer, dias_hilo,
                        plazo_sup_dias, plazo_entidad_dias, plazo_muni_dias, plazo_jrd_dias, plazo_ro_dias
                    )
                    VALUES (1, 'SistemaGreace', 'Hospital Leoncio Prado (PRONIS/MINSA)', 15, 10, 5, 5, 15, 15, 15, 5)
                    """
                )
            ensure_usuarios_table(cur)
        conn.commit()
        seed_usuarios(conn)
    finally:
        if own:
            conn.close()


def _rebuild_hilos(conn) -> dict:
    return rebuild_hilos_fast(conn)


def row_to_dict(r, exclude=("creado_en", "actualizado_en"), with_class=True):
    if r is None:
        return None
    out = {}
    for k in r.keys():
        if k in exclude:
            continue
        v = r[k]
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    if with_class:
        out["clasificacion"] = classify_carta(out)
    return out


def _prepare_carta_payload(d: dict) -> dict:
    data = {k: d.get(k) for k in CARTA_FIELDS}
    if not data.get("sentido"):
        ban = data.get("bandeja") or ""
        data["sentido"] = "recibida" if str(ban).startswith("recibida") else "emitida"
    data["estado_norm"] = normalize_estado(data.get("estado"))
    data["especialidad_norm"] = normalize_especialidad(data.get("especialidad"))
    if data.get("referencias") not in (None, ""):
        data["referencias"] = normalize_referencias_antecedentes(data.get("referencias"))
    if data.get("fecha") == "":
        data["fecha"] = None
    if data.get("fecha_respuesta") == "":
        data["fecha_respuesta"] = None
    if data.get("n_orden") in ("", None):
        data["n_orden"] = None
    elif data.get("n_orden") is not None:
        try:
            data["n_orden"] = int(data["n_orden"])
        except (TypeError, ValueError):
            data["n_orden"] = None
    return data


def _validate_carta_payload(d: dict) -> tuple[dict, str | None]:
    if not isinstance(d, dict):
        return {}, "Cuerpo de datos inválido"
    doc = str(d.get("n_documento") or "").strip()
    ban = str(d.get("bandeja") or "").strip()
    if not doc:
        return {}, "El N° de Documento es obligatorio"
    if len(doc) > 250:
        return {}, "El N° de Documento no puede superar los 250 caracteres"
    if not ban:
        return {}, "La bandeja es obligatoria"
    if len(ban) > 80:
        return {}, "La bandeja supera la longitud máxima permitida"

    fecha = d.get("fecha")
    if fecha not in (None, ""):
        f_str = str(fecha).strip().split("T")[0]
        try:
            parts = [int(p) for p in f_str.split("-")]
            if len(parts) != 3 or parts[0] < 1990 or parts[0] > 2099:
                return {}, "La fecha debe estar entre los años 1990 y 2099"
            date(parts[0], parts[1], parts[2])
            d["fecha"] = f_str
        except Exception:
            return {}, "Formato de fecha inválido. Usa el formato AAAA-MM-DD"

    field_limits = [
        ("n_documento", 255, "El N° de documento"),
        ("tipo_documento", 80, "El tipo de documento"),
        ("asunto", 20000, "El asunto"),
        ("especialidad", 150, "La especialidad"),
        ("estado", 80, "El estado"),
        ("referencias", 20000, "Las referencias"),
        ("referencia", 255, "La referencia"),
        ("folios", 100, "El campo folios"),
        ("cd", 150, "El campo anexos / CD"),
        ("dirigido_a", 250, "El destinatario"),
        ("receptor", 150, "El receptor"),
        ("cargo", 150, "El cargo"),
        ("observacion", 20000, "Las observaciones"),
    ]
    for field, max_len, label in field_limits:
        val = d.get(field)
        if val is not None and len(str(val)) > max_len:
            return {}, f"{label} no puede superar los {max_len} caracteres"

    area = str(d.get("area") or "").strip()
    if len(area) > 150:
        return {}, "El especialista responsable no puede superar los 150 caracteres"
    esp_raw = str(d.get("especialidad") or "").strip()
    if not esp_raw:
        return {}, (
            "La especialidad técnica es obligatoria. Seleccione el tema del documento "
            "(p. ej. Estructuras, Arquitectura, Inst. Sanitarias)."
        )
    esp_norm = normalize_especialidad(esp_raw)
    if esp_norm in ("SIN ESPECIALIDAD", "MIXTA", ""):
        return {}, "Seleccione una especialidad válida del catálogo (no puede quedar sin especialidad)."
    if str(ban).startswith("recibida") and not area:
        d["area"] = "RESIDENTE"

    return _prepare_carta_payload(d), None


@app.after_request
def compress_and_cache_headers(response):
    if response.direct_passthrough:
        return response
    accept_encoding = request.headers.get("Accept-Encoding", "")
    if (
        "gzip" in accept_encoding
        and response.status_code == 200
        and response.mimetype in ("application/json", "text/html", "text/css", "application/javascript")
        and len(response.data) > 500
        and "Content-Encoding" not in response.headers
    ):
        compressed_data = gzip.compress(response.data, compresslevel=6)
        response.set_data(compressed_data)
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Length"] = len(compressed_data)
    return response


@app.route("/api/health")
def api_health():
    try:
        db = get_db()
        with db.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM cartas")
            c = cur.fetchone()["c"]
        return jsonify(
            {
                "ok": True,
                "db": "mysql",
                "cartas": c,
                "auth_required": AUTH_REQUIRED,
            }
        )
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503


@app.route("/api/auth/me", methods=["GET"])
def api_auth_me():
    u = current_user()
    return jsonify(
        {
            "ok": True,
            "auth_required": AUTH_REQUIRED,
            "user": public_user(u),
            "authenticated": bool(u),
            "roles": list(VALID_ROLES),
        }
    )


@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username:
        return jsonify({"error": "Ingresa tu nombre de usuario"}), 400
    if len(username) > 60:
        return jsonify({"error": "El nombre de usuario no puede superar los 60 caracteres"}), 400
    if not password:
        return jsonify({"error": "Ingresa tu contraseña"}), 400
    if len(password) > 128:
        return jsonify({"error": "La contraseña no puede superar los 128 caracteres"}), 400

    user, err = verify_login(get_db(), username, password)
    if err:
        return jsonify({"error": err}), 401
    login_user(user)
    return jsonify({"ok": True, "user": public_user(user)})


@app.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    logout_user()
    return jsonify({"ok": True})


@app.route("/api/auth/change-password", methods=["POST"])
@require_auth
def api_auth_change_password():
    body = request.get_json(silent=True) or {}
    u = current_user()
    if not u:
        return jsonify({"error": "No autenticado"}), 401
    ok, err = change_own_password(
        get_db(),
        u["id"],
        body.get("current_password") or "",
        body.get("new_password") or "",
    )
    if not ok:
        return jsonify({"error": err or "No se pudo cambiar"}), 400
    # refrescar sesión con flags actualizados
    fresh = load_session_user(get_db())
    # load_session may be cached; force reload
    g._auth_checked = False
    g._auth_user = None
    fresh = current_user()
    return jsonify({"ok": True, "user": public_user(fresh)})


@app.route("/api/auth/users", methods=["GET"])
@require_perm("can_manage_users")
def api_auth_users():
    return jsonify(
        {
            "ok": True,
            "users": list_usuarios_public(get_db()),
            "roles": list(VALID_ROLES),
            "catalogo": catalogo_payload(),
        }
    )


@app.route("/api/auth/users", methods=["POST"])
@require_perm("can_manage_users")
def api_auth_users_create():
    body = request.get_json(silent=True) or {}
    esps = body.get("especialidades") or []
    if isinstance(esps, str):
        esps = [p.strip() for p in esps.split(",") if p.strip()]
    user, err = create_usuario(
        get_db(),
        username=body.get("username") or "",
        password=body.get("password") or "",
        nombre=body.get("nombre") or "",
        rol=body.get("rol") or "ingeniero",
        especialidades=esps,
        must_change_password=bool(body.get("must_change_password", True)),
    )
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"ok": True, "user": user}), 201


@app.route("/api/auth/users/<int:uid>", methods=["PUT"])
@require_perm("can_manage_users")
def api_auth_users_update(uid):
    body = request.get_json(silent=True) or {}
    esps = body.get("especialidades")
    if isinstance(esps, str):
        esps = [p.strip() for p in esps.split(",") if p.strip()]
    user, err = update_usuario(
        get_db(),
        uid,
        nombre=body.get("nombre"),
        rol=body.get("rol"),
        especialidades=esps,
        activo=body.get("activo") if "activo" in body else None,
    )
    if err:
        return jsonify({"error": err}), 400
    return jsonify({"ok": True, "user": user})


@app.route("/api/auth/users/<int:uid>/password", methods=["POST"])
@require_perm("can_manage_users")
def api_auth_users_set_password(uid):
    body = request.get_json(silent=True) or {}
    ok, err = admin_set_password(
        get_db(),
        uid,
        body.get("password") or body.get("new_password") or "",
        must_change=bool(body.get("must_change_password", True)),
    )
    if not ok:
        return jsonify({"error": err or "No se pudo actualizar"}), 400
    return jsonify({"ok": True, "must_change_password": bool(body.get("must_change_password", True))})


def _get_system_config(conn=None) -> dict:
    c = conn or get_db()
    with c.cursor() as cur:
        cur.execute(f"SELECT {CONFIG_SELECT_COLS} FROM configuracion_sistema WHERE id=1")
        row = cur.fetchone()
    if not row:
        return {
            "dias_vencida": 15,
            "dias_por_vencer": 10,
            "dias_hilo": 5,
            "plazo_sup_dias": 5,
            "plazo_entidad_dias": 15,
            "plazo_muni_dias": 15,
            "plazo_jrd_dias": 15,
            "plazo_ro_dias": 5,
        }
    return row


def _sync_config_plazos(body: dict) -> dict:
    """Unifica plazos contractuales, hilos FK y semáforos (una sola fuente de verdad)."""
    ro = int(body.get("plazo_ro_dias", 5))
    sup = int(body.get("plazo_sup_dias", 5))
    ent = int(body.get("plazo_entidad_dias", 15))
    muni = int(body.get("plazo_muni_dias", 15))
    jrd = int(body.get("plazo_jrd_dias", 15))
    body["plazo_ro_dias"] = ro
    body["plazo_sup_dias"] = sup
    body["plazo_entidad_dias"] = ent
    body["plazo_muni_dias"] = muni
    body["plazo_jrd_dias"] = jrd
    # Hilos (Outlook FK) = mismo plazo que «Yo debo responder»
    body["dias_hilo"] = ro
    sync_sem = body.get("sync_semaforos", True)
    if sync_sem is None or sync_sem is True or str(sync_sem).lower() in ("1", "true", "yes"):
        max_cal = max(ent, muni, jrd)
        max_hab = max(ro, sup)
        body["dias_vencida"] = max(max_cal, max_hab)
        body["dias_por_vencer"] = max(1, min(ro, sup) - 2)
    return body


def _apply_plazos_from_config(cfg: dict | None = None) -> dict:
    cfg = cfg or _get_system_config()
    if cfg.get("dias_hilo") != cfg.get("plazo_ro_dias") and cfg.get("plazo_ro_dias") is not None:
        cfg = {**cfg, "dias_hilo": cfg.get("plazo_ro_dias")}
    set_plazos_config(cfg)
    set_sla_config(cfg)
    set_hilo_plazo_config(cfg)
    return cfg


@app.route("/api/config", methods=["GET"])
def api_get_config():
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT * FROM configuracion_sistema WHERE id=1")
        row = cur.fetchone()
        if not row:
            row = {
                "id": 1,
                "nombre_sistema": "SistemaGreace",
                "subtitulo_proyecto": "Hospital Leoncio Prado (PRONIS/MINSA)",
                "logo_url": None,
                "favicon_url": None,
                "dias_vencida": 15,
                "dias_por_vencer": 10,
                "dias_hilo": 5,
                "plazo_sup_dias": 5,
                "plazo_entidad_dias": 15,
                "plazo_muni_dias": 15,
                "plazo_jrd_dias": 15,
                "plazo_ro_dias": 5,
            }
    return jsonify({"ok": True, "config": row})


@app.route("/api/config", methods=["PUT"])
@require_perm("can_manage_users")
def api_update_config():
    body = request.get_json(silent=True) or {}
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT * FROM configuracion_sistema WHERE id=1")
        existing_cfg = cur.fetchone() or {}

    if "nombre_sistema" in body:
        nombre_raw = body.get("nombre_sistema")
        if not nombre_raw or not str(nombre_raw).strip():
            return jsonify({"error": "El nombre del sistema es obligatorio"}), 400
        nombre = str(nombre_raw).strip()
        if len(nombre) > 100:
            return jsonify({"error": "El nombre del sistema no puede superar los 100 caracteres"}), 400
    else:
        nombre = existing_cfg.get("nombre_sistema") or "SistemaGreace"

    if "subtitulo_proyecto" in body:
        subtitulo_raw = body.get("subtitulo_proyecto")
        if not subtitulo_raw or not str(subtitulo_raw).strip():
            return jsonify({"error": "El subtítulo del proyecto es obligatorio"}), 400
        subtitulo = str(subtitulo_raw).strip()
        if len(subtitulo) > 180:
            return jsonify({"error": "El subtítulo del proyecto no puede superar los 180 caracteres"}), 400
    else:
        subtitulo = existing_cfg.get("subtitulo_proyecto") or "Hospital Leoncio Prado (PRONIS/MINSA)"

    # Preservar imágenes existentes si no fueron enviadas en el payload (actualizaciones parciales / scripts)
    if "logo_url" in body:
        logo_url = body.get("logo_url") or None
    else:
        logo_url = existing_cfg.get("logo_url")

    if "favicon_url" in body:
        favicon_url = body.get("favicon_url") or None
    else:
        favicon_url = existing_cfg.get("favicon_url")

    if "logo_membrete_word" in body:
        logo_membrete_word = body.get("logo_membrete_word") or None
    else:
        logo_membrete_word = existing_cfg.get("logo_membrete_word")

    # Validaciones estrictas de tamaño de payload de imágenes si vienen nuevas
    if logo_url and len(str(logo_url)) > 2500000:
        return jsonify({"error": "El logo excede el tamaño máximo permitido (1.5 MB)"}), 400
    if favicon_url and len(str(favicon_url)) > 600000:
        return jsonify({"error": "El favicon excede el tamaño máximo permitido (256 KB)"}), 400

    if logo_membrete_word:
        str_banner = str(logo_membrete_word).strip()
        if len(str_banner) > 4000000:
            return jsonify({"error": "El membrete Word excede el tamaño máximo permitido (2.5 MB)"}), 400
        if str_banner.startswith("data:"):
            if not any(str_banner.startswith(f"data:image/{fmt}") for fmt in ("png", "jpeg", "jpg", "webp")):
                return jsonify({"error": "Formato de imagen de membrete no permitido. Solo se admiten archivos PNG, JPG o WEBP."}), 400

    try:
        plazo_sup_dias = int(body.get("plazo_sup_dias", existing_cfg.get("plazo_sup_dias", 5)))
        plazo_entidad_dias = int(body.get("plazo_entidad_dias", existing_cfg.get("plazo_entidad_dias", 15)))
        plazo_muni_dias = int(body.get("plazo_muni_dias", existing_cfg.get("plazo_muni_dias", 15)))
        plazo_jrd_dias = int(body.get("plazo_jrd_dias", existing_cfg.get("plazo_jrd_dias", 15)))
        plazo_ro_dias = int(body.get("plazo_ro_dias", existing_cfg.get("plazo_ro_dias", 5)))
        for name, val in (
            ("Supervisión", plazo_sup_dias),
            ("Entidad (PRONIS)", plazo_entidad_dias),
            ("Municipalidad", plazo_muni_dias),
            ("Junta de Disputas", plazo_jrd_dias),
            ("Residente (Yo debo)", plazo_ro_dias),
        ):
            if val < 1 or val > 99999:
                return jsonify({"error": f"Plazo de {name}: ingrese un entero entre 1 y 99.999 días"}), 400
        body["plazo_sup_dias"] = plazo_sup_dias
        body["plazo_entidad_dias"] = plazo_entidad_dias
        body["plazo_muni_dias"] = plazo_muni_dias
        body["plazo_jrd_dias"] = plazo_jrd_dias
        body["plazo_ro_dias"] = plazo_ro_dias
        body = _sync_config_plazos(body)
        dias_vencida = int(body["dias_vencida"])
        dias_por_vencer = int(body["dias_por_vencer"])
        dias_hilo = int(body["dias_hilo"])
        if dias_vencida < 1:
            return jsonify({"error": "Los días para carta vencida deben ser mayores o iguales a 1"}), 400
        if dias_por_vencer < 1:
            return jsonify({"error": "Los días de alerta preventiva (por vencer) deben ser mayores o iguales a 1"}), 400
        if dias_hilo < 1:
            return jsonify({"error": "El plazo para hilos de respuesta debe ser mayor o igual a 1"}), 400
        if dias_vencida > 99999 or dias_por_vencer > 99999 or dias_hilo > 99999:
            return jsonify({"error": "El valor de días no puede superar el límite de 99,999 días"}), 400
        if dias_por_vencer >= dias_vencida:
            return jsonify({"error": "Los días de alerta preventiva (por vencer) deben ser menores a los días de carta vencida"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Parámetros de días inválidos. Ingresa números válidos."}), 400
    try:
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO configuracion_sistema
                    (id, nombre_sistema, subtitulo_proyecto, logo_url, favicon_url, logo_membrete_word,
                     dias_vencida, dias_por_vencer, dias_hilo,
                     plazo_sup_dias, plazo_entidad_dias, plazo_muni_dias, plazo_jrd_dias, plazo_ro_dias)
                VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    nombre_sistema=VALUES(nombre_sistema),
                    subtitulo_proyecto=VALUES(subtitulo_proyecto),
                    logo_url=VALUES(logo_url),
                    favicon_url=VALUES(favicon_url),
                    logo_membrete_word=VALUES(logo_membrete_word),
                    dias_vencida=VALUES(dias_vencida),
                    dias_por_vencer=VALUES(dias_por_vencer),
                    dias_hilo=VALUES(dias_hilo),
                    plazo_sup_dias=VALUES(plazo_sup_dias),
                    plazo_entidad_dias=VALUES(plazo_entidad_dias),
                    plazo_muni_dias=VALUES(plazo_muni_dias),
                    plazo_jrd_dias=VALUES(plazo_jrd_dias),
                    plazo_ro_dias=VALUES(plazo_ro_dias)
                """,
                (
                    nombre,
                    subtitulo,
                    logo_url,
                    favicon_url,
                    logo_membrete_word,
                    dias_vencida,
                    dias_por_vencer,
                    dias_hilo,
                    body["plazo_sup_dias"],
                    body["plazo_entidad_dias"],
                    body["plazo_muni_dias"],
                    body["plazo_jrd_dias"],
                    body["plazo_ro_dias"],
                ),
            )
        db.commit()
    except pymysql.err.DataError:
        return jsonify({"error": "El valor de días supera el rango permitido de la base de datos (Máx. 99,999 días)"}), 400
    invalidate_cartas_cache()

    with db.cursor() as cur:
        cur.execute("SELECT * FROM configuracion_sistema WHERE id=1")
        fresh = cur.fetchone()

    _apply_plazos_from_config(dict(fresh) if fresh else None)
    return jsonify({"ok": True, "config": fresh, "message": "Configuración guardada correctamente"})


@app.route("/api/meta/bandejas")
@require_auth
def api_bandejas():
    return jsonify(
        {
            "bandejas": [{"id": k, "label": v} for k, v in BANDEJAS.items()],
        }
    )


@app.route("/api/cartas", methods=["GET"])
@require_auth
def api_cartas_list():
    u = current_user()
    uid = u.get("id") if u else 0
    bandeja = request.args.get("bandeja")
    estado = request.args.get("estado")
    esp = request.args.get("especialidad")
    qtext = request.args.get("q")
    deuda = request.args.get("deuda")
    contraparte = request.args.get("contraparte")
    naturaleza = request.args.get("naturaleza")
    actor = request.args.get("actor")

    has_filters = any(
        x and x != "all" for x in (bandeja, estado, esp, qtext, deuda, contraparte, naturaleza, actor)
    )
    if not has_filters:
        etag = f'W/"cartas_{_CACHE_VERSION}_{uid}"'
        if request.headers.get("If-None-Match") == etag:
            return ("", 304, {"ETag": etag, "Cache-Control": "no-cache"})
        rows = scoped_cartas()
        resp = jsonify(rows)
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    db = get_db()
    sql = f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE 1=1"
    params = []
    if bandeja and bandeja != "all":
        sql += " AND bandeja=%s"
        params.append(bandeja)
    if estado and estado != "all":
        sql += " AND estado_norm=%s"
        params.append(estado)
    if esp and esp != "all":
        sql += " AND (especialidad LIKE %s OR especialidad_norm LIKE %s OR especialidad_norm = 'MIXTA')"
        like = f"%{esp}%"
        params.extend([like, like])
    if qtext:
        words = [w.strip() for w in re.split(r'\s+', qtext) if w.strip()]
        like = f"%{qtext}%"
        if len(qtext) >= 3 and any(len(w) >= 3 for w in words):
            ft_query = " ".join(f"+{w}*" if not w.startswith(("+", "-", "*", "~", '"')) else w for w in words)
            sql += (
                " AND (MATCH(n_documento, asunto, referencias, observacion, especialidad) AGAINST(%s IN BOOLEAN MODE) "
                " OR n_documento LIKE %s OR asunto LIKE %s OR referencias LIKE %s OR referencia LIKE %s OR especialidad LIKE %s)"
            )
            params.extend([ft_query, like, like, like, like, like])
        else:
            sql += " AND (n_documento LIKE %s OR asunto LIKE %s OR referencias LIKE %s OR referencia LIKE %s OR especialidad LIKE %s)"
            params.extend([like, like, like, like, like])
    sql += " ORDER BY fecha IS NULL, fecha DESC, id DESC"
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = [row_to_dict(r) for r in cur.fetchall()]
    rows = filter_cartas_for_user(rows, u)
    if esp and esp != "all":
        rows = [r for r in rows if carta_matches_especialidad(r, esp)]

    def match_class(c):
        cl = c.get("clasificacion") or {}
        if deuda and deuda != "all" and cl.get("deuda") != deuda:
            return False
        if contraparte and contraparte != "all" and cl.get("contraparte") != contraparte:
            return False
        if naturaleza and naturaleza != "all" and cl.get("naturaleza") != naturaleza:
            return False
        if actor and actor != "all" and cl.get("actor") != actor:
            return False
        return True

    if any(x and x != "all" for x in (deuda, contraparte, naturaleza, actor)):
        rows = [r for r in rows if match_class(r)]
    return jsonify(rows)


@app.route("/api/pendientes", methods=["GET"])
@require_auth
def api_pendientes():
    u = current_user()
    uid = u.get("id") if u else 0
    etag = f'W/"pendientes_{_CACHE_VERSION}_{uid}"'
    if request.headers.get("If-None-Match") == etag:
        return ("", 304, {"ETag": etag, "Cache-Control": "no-cache"})
    rows = scoped_cartas()
    _apply_plazos_from_config()
    resp = jsonify(public_pendientes(rows))
    resp.headers["ETag"] = etag
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/api/hilos", methods=["GET"])
@require_auth
def api_hilos():
    solo = request.args.get("solo_abiertos", "1") not in ("0", "false", "False", "no")
    deuda = request.args.get("deuda") or None
    if deuda in ("", "all", "comunicacion"):
        deuda = None
    excluir_legado = request.args.get("excluir_legado", "0") in ("1", "true", "True", "yes")
    solo_urgentes = request.args.get("solo_urgentes", "0") in ("1", "true", "True", "yes")
    max_dias = request.args.get("max_dias")
    max_dias_i = None
    if max_dias not in (None, ""):
        try:
            max_dias_i = int(max_dias)
        except ValueError:
            max_dias_i = None
    foco = (request.args.get("foco") or "").strip().lower()
    if foco == "operativo":
        excluir_legado = True
    elif foco == "15d":
        excluir_legado = True
        max_dias_i = HILO_OPERATIVO_MAX_DIAS if max_dias_i is None else max_dias_i
    elif foco == "urgentes":
        excluir_legado = True
    u = current_user()
    uid = u.get("id") if u else 0
    etag = f'W/"hilos_{_CACHE_VERSION}_{uid}_{solo}_{deuda}_{excluir_legado}_{solo_urgentes}_{max_dias_i}"'
    if request.headers.get("If-None-Match") == etag:
        return ("", 304, {"ETag": etag, "Cache-Control": "no-cache"})

    rows = scoped_cartas()
    _apply_plazos_from_config()
    payload = list_hilos_api(
        rows,
        solo_abiertos=solo,
        deuda_filter=deuda,
        excluir_legado=excluir_legado,
        max_dias=max_dias_i,
        solo_urgentes=solo_urgentes,
    )
    payload["vista_parcial"] = bool(u and u.get("vista_parcial"))
    payload["scope"] = {
        "rol": (u or {}).get("rol"),
        "especialidades": (u or {}).get("especialidades") or [],
    }
    resp = jsonify(payload)
    resp.headers["ETag"] = etag
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/api/hilos/rebuild", methods=["POST"])
@require_perm("can_import")
def api_hilos_rebuild():
    if NOTIFY_SECRET:
        body = request.get_json(silent=True) or {}
        if request.headers.get("X-Notify-Secret") != NOTIFY_SECRET and body.get("secret") != NOTIFY_SECRET:
            return jsonify({"error": "No autorizado"}), 401
    db = get_db()
    result = _rebuild_hilos(db)
    return jsonify(result)


@app.route("/api/saldos", methods=["GET"])
@require_auth
def api_saldos():
    u = current_user()
    uid = u.get("id") if u else 0
    etag = f'W/"saldos_{_CACHE_VERSION}_{uid}"'
    if request.headers.get("If-None-Match") == etag:
        return ("", 304, {"ETag": etag, "Cache-Control": "no-cache"})
    rows = scoped_cartas()
    payload = build_saldos(rows)
    if u and u.get("vista_parcial"):
        payload["vista_parcial"] = True
        payload["excel_paridad_aplica"] = False
        payload["nota"] = (
            "Vista parcial por especialidad: los totales no deben compararse "
            "con la paridad Excel global (175/228)."
        )
    resp = jsonify(payload)
    resp.headers["ETag"] = etag
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.route("/api/status/supervision", methods=["GET"])
@require_auth
def api_status_supervision():
    rows = scoped_cartas()
    return jsonify(build_status_supervision(rows))


@app.route("/api/cartas/<int:cid>", methods=["GET"])
@require_auth
def api_cartas_get(cid):
    db = get_db()
    with db.cursor() as cur:
        cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (cid,))
        r = cur.fetchone()
    if not r:
        return jsonify({"error": "Carta no encontrada"}), 404
    c = row_to_dict(r)
    if not filter_cartas_for_user([c], current_user()):
        return jsonify({"error": "Sin acceso a esta carta"}), 403
    return jsonify(c)


@app.route("/api/cartas/generar-borrador-docx", methods=["POST"])
@require_auth
def api_cartas_generar_docx():
    if generar_carta_docx is None:
        return jsonify({"error": "El generador de Word no está disponible en este entorno"}), 500

    import re
    d = request.get_json(silent=True) or {}
    db = get_db()

    with db.cursor() as cur:
        cur.execute("SELECT id, nombre_sistema, subtitulo_proyecto, logo_membrete_word FROM configuracion_sistema WHERE id=1")
        cfg_row = cur.fetchone() or {}

    config_dict = {
        "empresa_nombre": "CHINA GEZHOUBA GROUP COMPANY LIMITED SUCURSAL PERÚ",
        "project_title": cfg_row.get("subtitulo_proyecto") or cfg_row.get("project_title") or "Hospital Leoncio Prado de Huamachuco",
        "brand_name": cfg_row.get("nombre_sistema") or cfg_row.get("brand_name") or "SistemaGreace",
        "logo_membrete_word": cfg_row.get("logo_membrete_word") or None,
        "anio_oficial": "Año del Bicentenario, de la consolidación de nuestra Independencia"
    }

    cid = d.get("carta_id") or d.get("padre_id")
    if cid:
        with db.cursor() as cur:
            cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (int(cid),))
            p_row = cur.fetchone()
            if p_row:
                p_carta = row_to_dict(p_row)
                if not d.get("referencia"):
                    d["referencia"] = p_carta.get("n_documento")
                if not d.get("especialidad"):
                    d["especialidad"] = p_carta.get("especialidad") or p_carta.get("especialidad_norm")
                if not d.get("asunto"):
                    d["asunto"] = f"Respuesta técnica a {p_carta.get('n_documento', '')} - {p_carta.get('asunto', '')}"

    emisor = str(d.get("emisor") or d.get("receptor") or "RO").upper()
    sigla = "RL" if ("RL" in emisor or "LEGAL" in emisor) else "RO"
    anio_actual = date.today().year

    if not d.get("n_documento") or "[" in str(d.get("n_documento")):
        with db.cursor() as cur:
            bandeja = "rl" if sigla == "RL" else "residente"
            cur.execute(
                "SELECT n_documento FROM cartas WHERE bandeja=%s AND (fecha >= %s OR fecha IS NULL) ORDER BY id DESC LIMIT 50",
                (bandeja, f"{anio_actual}-01-01")
            )
            rows_corr = cur.fetchall()
            max_num = 0
            for rc in rows_corr:
                doc_str = str(rc.get("n_documento") or "")
                m = re.search(r"N[°º.]?\s*(\d+)", doc_str, re.I)
                if m:
                    try:
                        max_num = max(max_num, int(m.group(1)))
                    except ValueError:
                        pass
            next_num = max_num + 1 if max_num > 0 else 1
            if sigla == "RL":
                d["n_documento"] = f"CARTA N° {next_num:03d}-{anio_actual}-RL-CGGCNEGOCIOS"
            else:
                d["n_documento"] = f"CARTA N° {next_num:03d}-{anio_actual}-CGGC-HLP-RO"

    buffer = generar_carta_docx(d, config_dict)
    clean_doc = re.sub(r"[^\w\-.]", "_", str(d.get("n_documento", "Carta")).strip())
    filename = f"Borrador_{clean_doc}.docx"

    return send_file(
        buffer,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@app.route("/api/cartas", methods=["POST"])
@require_perm("can_create_cartas")
def api_cartas_add():
    d = request.get_json(silent=True) or {}
    data, err = _validate_carta_payload(d)
    if err:
        return jsonify({"error": err}), 400

    u = current_user()
    if u and u.get("vista_parcial"):
        probe = {**data, "clasificacion": classify_carta(data)}
        if not filter_cartas_for_user([probe], u):
            return jsonify(
                {
                    "error": "Solo puedes registrar cartas de tu especialidad",
                    "especialidades": u.get("especialidades"),
                }
            ), 403

    db = get_db()
    cerrar_refs = d.get("cerrar_referenciadas", True)
    cols = list(data.keys())
    ph = ", ".join(["%s"] * len(cols))
    sql = f"INSERT INTO cartas ({', '.join(cols)}) VALUES ({ph})"
    try:
        with db.cursor() as cur:
            cur.execute(sql, [data[k] for k in cols])
            new_id = cur.lastrowid
            cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (new_id,))
            r = cur.fetchone()
        db.commit()
    except pymysql.err.DataError:
        return jsonify({"error": "Uno de los campos supera la capacidad de almacenamiento permitida"}), 400

    invalidate_cartas_cache()
    full = row_to_dict(r)
    hilo_link = assign_carta_hilo(db, new_id, full)
    with db.cursor() as cur:
        cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (new_id,))
        r = cur.fetchone()
    full = row_to_dict(r)
    close_info = try_close_referenced_cartas(db, full, cerrar=bool(cerrar_refs))
    hilos_info = _rebuild_hilos(db)
    invalidate_cartas_cache()
    out = row_to_dict(r)
    out["_cierre_referencias"] = close_info
    out["_hilo_vinculo"] = hilo_link
    out["_hilos"] = hilos_info
    return jsonify(out), 201


@app.route("/api/cartas/<int:cid>", methods=["PUT"])
@require_perm("can_edit_cartas")
def api_cartas_edit(cid):
    db = get_db()
    d = request.get_json(silent=True) or {}
    with db.cursor() as cur:
        cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (cid,))
        r = cur.fetchone()
        if not r and d.get("n_documento"):
            cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE n_documento=%s LIMIT 1", (d.get("n_documento"),))
            r = cur.fetchone()
            if r:
                cid = r["id"]
        if not r:
            return jsonify({"error": "Carta no encontrada"}), 404
        existing = row_to_dict(r)
        if not filter_cartas_for_user([existing], current_user()):
            return jsonify({"error": "Sin acceso a esta carta"}), 403

    u = current_user()
    # Solo administrador puede editar cartas (ingeniero: solo lectura; residente: crea, no edita).
    merged = {**existing, **d}

    data, err = _validate_carta_payload(merged)
    if err:
        return jsonify({"error": err}), 400

    if u and u.get("vista_parcial"):
        probe = {**data}
        if not filter_cartas_for_user([probe], u):
            return jsonify({"error": "No puedes mover la carta fuera de tu especialidad"}), 403

    cerrar_refs = d.get("cerrar_referenciadas", True)
    sets = [f"{k}=%s" for k in data.keys()]
    vals = list(data.values()) + [cid]
    try:
        with db.cursor() as cur:
            cur.execute(
                f"UPDATE cartas SET {', '.join(sets)}, actualizado_en=NOW() WHERE id=%s",
                vals,
            )
            cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (cid,))
            r2 = cur.fetchone()
        db.commit()
    except pymysql.err.DataError:
        return jsonify({"error": "Uno de los campos supera la capacidad de almacenamiento permitida"}), 400

    full = row_to_dict(r2)
    hilo_link = assign_carta_hilo(db, cid, full)
    with db.cursor() as cur:
        cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (cid,))
        r2 = cur.fetchone()
    full = row_to_dict(r2)
    close_info = try_close_referenced_cartas(db, full, cerrar=bool(cerrar_refs))
    hilos_info = _rebuild_hilos(db)
    invalidate_cartas_cache()
    out = row_to_dict(r2)
    out["_cierre_referencias"] = close_info
    out["_hilo_vinculo"] = hilo_link
    out["_hilos"] = hilos_info
    return jsonify(out)


@app.route("/api/cartas/<int:cid>", methods=["DELETE"])
@require_perm("can_delete_cartas")
def api_cartas_del(cid):
    db = get_db()
    with db.cursor() as cur:
        cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas WHERE id=%s", (cid,))
        r = cur.fetchone()
        if not r:
            return jsonify({"error": "Carta no encontrada"}), 404
        if not filter_cartas_for_user([row_to_dict(r)], current_user()):
            return jsonify({"error": "Sin acceso a esta carta"}), 403
        cur.execute("DELETE FROM cartas WHERE id=%s", (cid,))
    db.commit()
    invalidate_cartas_cache()
    _rebuild_hilos(db)
    return jsonify({"ok": True, "id": cid})


@app.route("/api/stats", methods=["GET"])
@require_auth
def api_stats():
    u = current_user()
    uid = u.get("id") if u else 0
    etag = f'W/"stats_{_CACHE_VERSION}_{uid}"'
    if request.headers.get("If-None-Match") == etag:
        return ("", 304, {"ETag": etag, "Cache-Control": "no-cache"})

    rows = scoped_cartas()
    u = current_user()

    by_bandeja = {}
    by_estado = {}
    by_esp = {}
    by_month = {}
    for c in rows:
        b = c.get("bandeja") or "—"
        by_bandeja[b] = by_bandeja.get(b, 0) + 1
        e = c.get("estado_norm") or "SIN ESTADO"
        by_estado[e] = by_estado.get(e, 0) + 1
        esp = c.get("especialidad_norm") or "SIN ESPECIALIDAD"
        by_esp[esp] = by_esp.get(esp, 0) + 1
        f = c.get("fecha") or ""
        if f:
            by_month[f[:7]] = by_month.get(f[:7], 0) + 1

    db = get_db()
    cfg_row = _get_system_config(db)
    _apply_plazos_from_config(cfg_row)
    v_dias = cfg_row.get("dias_vencida") or 15
    pv_dias = cfg_row.get("dias_por_vencer") or 10

    classified = classify_cartas(rows, vencida_dias=v_dias, por_vencer_dias=pv_dias)
    pendientes = public_pendientes(rows)
    return jsonify(
        {
            "total": len(rows),
            "by_bandeja": by_bandeja,
            "by_estado": by_estado,
            "by_especialidad": by_esp,
            "by_month": by_month,
            "bandejas_meta": BANDEJAS,
            "actores_meta": ACTORES,
            "alertas": classified["counts"],
            "plazos": plazos_config(v_dias, pv_dias),
            "plazos_respuesta": plazos_respuesta_config(cfg_row),
            "plazos_contractuales": {
                "plazo_sup_dias": cfg_row.get("plazo_sup_dias") or 5,
                "plazo_entidad_dias": cfg_row.get("plazo_entidad_dias") or 15,
                "plazo_muni_dias": cfg_row.get("plazo_muni_dias") or 15,
                "plazo_jrd_dias": cfg_row.get("plazo_jrd_dias") or 15,
                "plazo_ro_dias": cfg_row.get("plazo_ro_dias") or 5,
            },
            "pendientes": {
                "counts": pendientes["counts"],
                "debo_by_actor": pendientes["debo"]["by_actor"],
                "me_deben_by_actor": pendientes["me_deben"]["by_actor"],
                "debo_by_especialidad": pendientes["debo"]["by_especialidad"],
                "me_deben_by_especialidad": pendientes["me_deben"]["by_especialidad"],
            },
            "vista_parcial": bool(u and u.get("vista_parcial")),
            "user": public_user(u),
            "catalogo": catalogo_payload(),
        }
    )


@app.route("/api/import/excel", methods=["POST"])
@require_perm("can_import")
def api_import_excel():
    if NOTIFY_SECRET:
        body = request.get_json(silent=True) or {}
        if request.headers.get("X-Notify-Secret") != NOTIFY_SECRET and body.get("secret") != NOTIFY_SECRET:
            return jsonify({"error": "No autorizado"}), 401

    uploaded_file = request.files.get("file")
    temp_path = None
    try:
        excel_target = None
        if uploaded_file and uploaded_file.filename:
            ext = os.path.splitext(uploaded_file.filename)[1].lower()
            if ext not in (".xlsx", ".xlsm", ".xltx", ".xltm", ".xls"):
                return jsonify({"error": "Solo se permiten archivos Excel (.xlsx, .xlsm, .xls)"}), 400
            import tempfile
            fd, temp_path = tempfile.mkstemp(suffix=ext)
            os.close(fd)
            uploaded_file.save(temp_path)
            excel_target = Path(temp_path)

        force = True if uploaded_file else bool((request.get_json(silent=True) or {}).get("force", True))
        db = get_db()
        result = import_excel_to_db(db, excel_path=excel_target, force=force)
        if result.get("ok") and not result.get("skipped"):
            try:
                result["hilos"] = _rebuild_hilos(db)
            except Exception as exc:
                logging.exception("Error construyendo hilos tras import: %s", exc)
                result["hilos_error"] = str(exc)
            invalidate_cartas_cache()
        code = 200 if result.get("ok") else 400
        return jsonify(result), code
    except Exception as exc:
        logging.exception("Error inesperado en importación Excel: %s", exc)
        return jsonify({"ok": False, "error": f"Error en el procesamiento del archivo: {exc}"}), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


@app.route("/api/backup/excel", methods=["GET"])
@require_perm("can_export")
def api_backup_excel():
    from datetime import datetime
    from export_excel import export_full_backup_excel
    db = get_db()
    excel_stream = export_full_backup_excel(db)
    filename = f"Backup_Control_Cartas_HLP_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    return send_file(
        excel_stream,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/backfill/cartas", methods=["POST"])
@require_perm("can_import")
def api_backfill_cartas():
    if NOTIFY_SECRET:
        body = request.get_json(silent=True) or {}
        if request.headers.get("X-Notify-Secret") != NOTIFY_SECRET and body.get("secret") != NOTIFY_SECRET:
            return jsonify({"error": "No autorizado"}), 401
    body = request.get_json(silent=True) or {}
    dry_run = bool(body.get("dry_run"))
    fill_missing = body.get("fill_missing", True)
    fix_areas = body.get("fix_areas", True)
    db = get_db()
    result = backfill_cartas(
        db,
        dry_run=dry_run,
        fill_missing=bool(fill_missing),
        fix_areas=bool(fix_areas),
    )
    if result.get("ok") and not dry_run:
        norms = refresh_normalized_fields(db)
        result["normalize"] = norms
        invalidate_cartas_cache()
    return jsonify(result)


@app.route("/api/normalize", methods=["POST"])
@require_perm("can_import")
def api_normalize():
    if NOTIFY_SECRET:
        body = request.get_json(silent=True) or {}
        if request.headers.get("X-Notify-Secret") != NOTIFY_SECRET and body.get("secret") != NOTIFY_SECRET:
            return jsonify({"error": "No autorizado"}), 401
    db = get_db()
    result = refresh_normalized_fields(db)
    try:
        result["hilos"] = _rebuild_hilos(db)
    except Exception as exc:
        result["hilos_error"] = str(exc)
    return jsonify(result)


def _load_cartas(db=None):
    global _RAW_CARTAS_CACHE
    if _RAW_CARTAS_CACHE is not None:
        return _RAW_CARTAS_CACHE
    db = db or get_db()
    with db.cursor() as cur:
        cur.execute(f"SELECT {CARTA_SELECT_COLS} FROM cartas ORDER BY fecha IS NULL, fecha DESC, id DESC")
        rows = [row_to_dict(r) for r in cur.fetchall()]
        _RAW_CARTAS_CACHE = rows
        return rows


def _already_sent_today(db, kind: str, payload_hash: str) -> bool:
    with db.cursor() as cur:
        cur.execute(
            """
            SELECT id FROM whatsapp_alert_log
            WHERE alert_date=%s AND kind=%s AND payload_hash=%s AND ok=1
            LIMIT 1
            """,
            (date.today().isoformat(), kind, payload_hash),
        )
        return cur.fetchone() is not None


def _log_alert(db, kind: str, payload_hash: str, preview: str, result: dict):
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO whatsapp_alert_log
                (alert_date, kind, payload_hash, message_preview, provider_response, ok)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                message_preview=VALUES(message_preview),
                provider_response=VALUES(provider_response),
                ok=VALUES(ok),
                sent_at=CURRENT_TIMESTAMP
            """,
            (
                date.today().isoformat(),
                kind,
                payload_hash,
                (preview or "")[:500],
                json.dumps(result, ensure_ascii=False)[:4000],
                1 if result.get("ok") else 0,
            ),
        )
    db.commit()


def _compose_notify_message(rows: list[dict], mode: str | None = None) -> tuple[str | None, dict]:
    """mode: debo | plazos | both | hilos. Default desde WHATSAPP_DIGEST_MODE."""
    mode = (mode or WHATSAPP_DIGEST_MODE or "debo").strip().lower()
    if mode not in ("debo", "plazos", "both", "hilos"):
        mode = "debo"

    classified = classify_cartas(rows)
    pend = build_pendientes(rows)
    meta = {
        "mode": mode,
        "plazos_counts": classified["counts"],
        "pendientes_counts": pend["counts"],
        "today": classified["today"],
    }

    parts = []
    if mode in ("debo", "both", "hilos"):
        # Prioridad: urgencias de hilo (ámbar/rojo, no legado). Evita spam de backlog Excel.
        urg = build_whatsapp_hilos_urgentes(
            rows, deuda="debo", max_items=WHATSAPP_DEBO_TOP
        )
        if urg:
            parts.append(urg)
        if mode != "hilos":
            # Resumen compacto de totales (sin listar las 10 más antiguas del legado)
            msg = build_whatsapp_debo_message(
                rows,
                max_especialidades=WHATSAPP_DEBO_ESP,
                max_items=0,
                include_me_deben_summary=True,
            )
            if msg:
                parts.append(msg)
    if mode in ("plazos", "both"):
        if mode == "plazos":
            msg = build_whatsapp_message(classified)
            if msg:
                parts.append(msg)
        elif classified["counts"].get("por_vencer", 0) > 0:
            slim = {
                **classified,
                "vencidas": [],
                "counts": {
                    **classified["counts"],
                    "vencidas": 0,
                    "total_alerta": classified["counts"]["por_vencer"],
                },
            }
            msg = build_whatsapp_message(slim, max_items=5)
            if msg:
                parts.append(msg)

    if not parts:
        return None, meta
    return "\n\n———\n\n".join(parts), meta


def run_plazos_notification(force: bool = False, mode: str | None = None) -> dict:
    cfg = whatsapp_config()
    db = connect_mysql()
    try:
        rows = _load_cartas(db)
        message, meta = _compose_notify_message(rows, mode=mode)
        kind = f"digest_{meta['mode']}"
        summary = {
            **meta,
            "config": {
                "enabled": cfg["enabled"],
                "provider": cfg["provider"],
                "to": cfg["to"] or None,
                "digest_mode": meta["mode"],
                "has_apikey": bool(cfg["callmebot_apikey"])
                if cfg["provider"] == "callmebot"
                else bool(cfg["meta_token"] and cfg["meta_phone_id"]),
            },
        }
        if not message:
            return {**summary, "ok": True, "sent": False, "reason": "sin_alertas"}
        payload_hash = hashlib.sha256(message.encode("utf-8")).hexdigest()
        if not force and _already_sent_today(db, kind, payload_hash):
            return {
                **summary,
                "ok": True,
                "sent": False,
                "reason": "ya_enviado_hoy_mismo_contenido",
                "preview": message[:500],
            }
        result = send_whatsapp(message, cfg)
        _log_alert(db, kind, payload_hash, message, result)
        return {
            **summary,
            "ok": bool(result.get("ok")),
            "sent": bool(result.get("ok")),
            "provider_result": result,
            "preview": message,
            "forced": force,
        }
    finally:
        db.close()


def _notify_authorized() -> bool:
    if not NOTIFY_SECRET:
        return True
    header = request.headers.get("X-Notify-Secret", "")
    body = request.get_json(silent=True) or {}
    return header == NOTIFY_SECRET or body.get("secret") == NOTIFY_SECRET


@app.route("/api/notify/plazos/preview", methods=["GET"])
@app.route("/api/notify/preview", methods=["GET"])
@require_perm("can_notify")
def api_notify_preview():
    rows = _load_cartas(get_db())
    mode = request.args.get("mode") or WHATSAPP_DIGEST_MODE
    message, meta = _compose_notify_message(rows, mode=mode)
    cfg = whatsapp_config()
    return jsonify(
        {
            **meta,
            "preview": message,
            "config": {
                "enabled": cfg["enabled"],
                "provider": cfg["provider"],
                "to": cfg["to"] or None,
                "digest_mode": meta["mode"],
                "ready": bool(
                    cfg["enabled"]
                    and cfg["to"]
                    and (
                        (cfg["provider"] == "callmebot" and cfg["callmebot_apikey"])
                        or (
                            cfg["provider"] == "meta"
                            and cfg["meta_token"]
                            and cfg["meta_phone_id"]
                        )
                    )
                ),
            },
        }
    )


@app.route("/api/notify/plazos", methods=["POST"])
@app.route("/api/notify/send", methods=["POST"])
@require_perm("can_notify")
def api_notify_send():
    if not _notify_authorized():
        return jsonify({"error": "No autorizado"}), 401
    body = request.get_json(silent=True) or {}
    mode = body.get("mode") or WHATSAPP_DIGEST_MODE
    result = run_plazos_notification(force=bool(body.get("force")), mode=mode)
    code = 200
    if result.get("provider_result") and not result["provider_result"].get("ok"):
        if not result["provider_result"].get("skipped"):
            code = 502
    return jsonify(result), code


def start_whatsapp_scheduler():
    cfg = whatsapp_config()
    if not cfg.get("enabled"):
        return
    interval = max(15, cfg.get("interval_minutes", 180)) * 60

    def loop():
        if cfg.get("notify_on_start"):
            time.sleep(25)
            try:
                run_plazos_notification(force=False)
            except Exception as exc:
                print(f"[whatsapp] error arranque: {exc}")
        while True:
            time.sleep(interval)
            try:
                run_plazos_notification(force=False)
            except Exception as exc:
                print(f"[whatsapp] error scheduler: {exc}")

    threading.Thread(target=loop, name="whatsapp-plazos", daemon=True).start()
    print(
        f"[whatsapp] scheduler cada {cfg.get('interval_minutes', 180)} min "
        f"(enabled={cfg.get('enabled')}, to={cfg.get('to') or '—'})"
    )


@app.route("/")
@app.route("/login")
@app.route("/dashboard.html")
def index():
    return send_from_directory(BASE, "dashboard.html")


@app.route("/cggc_banner.png")
def banner():
    return send_from_directory(BASE, "cggc_banner.png")


@app.route("/health")
def health_alias():
    return api_health()


def _auto_import_background():
    """Import en hilo aparte: Flask responde mientras openpyxl trabaja."""
    try:
        conn = connect_mysql()
        try:
            print("[import] iniciando…", flush=True)
            result = import_excel_to_db(conn, force=False)
            print("[import]", result, flush=True)
            if result.get("ok") and not result.get("skipped"):
                norms = refresh_normalized_fields(conn)
                print("[normalize]", norms, flush=True)
                hilos = _rebuild_hilos(conn)
                print("[hilos]", hilos, flush=True)
            elif result.get("ok") and result.get("skipped"):
                # Base ya cargada: solo enlazar hilos si existen cartas sin hilo
                with conn.cursor() as cur:
                    cur.execute("SELECT COUNT(*) c FROM cartas WHERE hilo_id IS NULL")
                    missing = cur.fetchone().get("c", 0)
                if missing > 0:
                    hilos = _rebuild_hilos(conn)
                    print("[hilos] hilos enlazados:", hilos, flush=True)
        finally:
            conn.close()
    except Exception as exc:
        print(f"[import] error: {exc}", flush=True)


_APP_STARTED = False
_APP_START_LOCK = threading.Lock()


def ensure_startup_tasks():
    global _APP_STARTED
    if _APP_STARTED:
        return
    with _APP_START_LOCK:
        if _APP_STARTED:
            return
        _APP_STARTED = True
        try:
            wait_for_mysql()
            init_db()
            if AUTO_IMPORT_EXCEL:
                threading.Thread(
                    target=_auto_import_background,
                    name="excel-import",
                    daemon=True,
                ).start()
            start_whatsapp_scheduler()
        except Exception as exc:
            print(f"[startup] Error inicializando base de datos / tareas: {exc}", flush=True)


ensure_startup_tasks()


if __name__ == "__main__":
    app.run(host=APP_HOST, port=APP_PORT, debug=FLASK_DEBUG)

