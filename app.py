# -*- coding: utf-8 -*-
"""SistemaGreace — Control de Cartas (Flask + MySQL + import Excel)."""
import hashlib
import json
import os
import threading
import time
from datetime import date, timedelta
from pathlib import Path

import pymysql
from flask import Flask, g, jsonify, request, send_from_directory, session
from pymysql.cursors import DictCursor

from import_excel import import_excel_to_db
from plazos import build_whatsapp_message, classify_cartas, plazos_config
from normalizers import normalize_especialidad, normalize_estado, refresh_normalized_fields
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
from hilos import (
    HILO_OPERATIVO_MAX_DIAS,
    build_whatsapp_hilos_urgentes,
    list_hilos_api,
    persist_hilos,
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

APP_HOST = os.environ.get("APP_HOST", "0.0.0.0")
APP_PORT = int(os.environ.get("APP_PORT", "5000"))
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
    "asunto",
    "especialidad",
    "estado",
    "referencias",
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
]

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


def current_user():
    return load_session_user(get_db())


app.config["GET_CURRENT_USER"] = current_user


AUTH_OPEN_PATHS = {
    "/api/health",
    "/health",
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


def scoped_cartas(db=None):
    db = db or get_db()
    rows = _load_cartas(db)
    return filter_cartas_for_user(rows, current_user())


def connect_mysql():
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


def wait_for_mysql():
    deadline = time.time() + MYSQL_WAIT_SECONDS
    last_err = None
    while time.time() < deadline:
        try:
            conn = connect_mysql()
            conn.close()
            return
        except pymysql.MySQLError as exc:
            last_err = exc
            time.sleep(2)
    raise RuntimeError(f"MySQL no disponible: {last_err}")


def get_db():
    if "db" not in g:
        g.db = connect_mysql()
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


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
            ensure_usuarios_table(cur)
        conn.commit()
        seed_usuarios(conn)
    finally:
        if own:
            conn.close()


def _rebuild_hilos(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM cartas")
        rows = [row_to_dict(r, with_class=False) for r in cur.fetchall()]
    return persist_hilos(conn, rows)


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
    if not username or not password:
        return jsonify({"error": "Usuario y contraseña requeridos"}), 400
    user = verify_login(get_db(), username, password)
    if not user:
        return jsonify({"error": "Credenciales inválidas"}), 401
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
    db = get_db()
    bandeja = request.args.get("bandeja")
    estado = request.args.get("estado")
    esp = request.args.get("especialidad")
    qtext = request.args.get("q")
    deuda = request.args.get("deuda")
    contraparte = request.args.get("contraparte")
    naturaleza = request.args.get("naturaleza")
    actor = request.args.get("actor")
    sql = "SELECT * FROM cartas WHERE 1=1"
    params = []
    if bandeja and bandeja != "all":
        sql += " AND bandeja=%s"
        params.append(bandeja)
    if estado and estado != "all":
        sql += " AND estado_norm=%s"
        params.append(estado)
    if esp and esp != "all":
        sql += " AND especialidad_norm=%s"
        params.append(esp)
    if qtext:
        sql += " AND (n_documento LIKE %s OR asunto LIKE %s OR referencias LIKE %s)"
        like = f"%{qtext}%"
        params.extend([like, like, like])
    sql += " ORDER BY fecha IS NULL, fecha DESC, id DESC"
    with db.cursor() as cur:
        cur.execute(sql, params)
        rows = [row_to_dict(r) for r in cur.fetchall()]
    rows = filter_cartas_for_user(rows, current_user())

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
    rows = scoped_cartas()
    return jsonify(public_pendientes(rows))


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
        solo_urgentes = True
    rows = scoped_cartas()
    payload = list_hilos_api(
        rows,
        solo_abiertos=solo,
        deuda_filter=deuda,
        excluir_legado=excluir_legado,
        max_dias=max_dias_i,
        solo_urgentes=solo_urgentes,
    )
    u = current_user()
    payload["vista_parcial"] = bool(u and u.get("vista_parcial"))
    payload["scope"] = {
        "rol": (u or {}).get("rol"),
        "especialidades": (u or {}).get("especialidades") or [],
    }
    return jsonify(payload)


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
    rows = scoped_cartas()
    payload = build_saldos(rows)
    u = current_user()
    if u and u.get("vista_parcial"):
        payload["vista_parcial"] = True
        payload["excel_paridad_aplica"] = False
        payload["nota"] = (
            "Vista parcial por especialidad: los totales no deben compararse "
            "con la paridad Excel global (175/228)."
        )
    return jsonify(payload)


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
        cur.execute("SELECT * FROM cartas WHERE id=%s", (cid,))
        r = cur.fetchone()
    if not r:
        return jsonify({"error": "Carta no encontrada"}), 404
    c = row_to_dict(r)
    if not filter_cartas_for_user([c], current_user()):
        return jsonify({"error": "Sin acceso a esta carta"}), 403
    return jsonify(c)


@app.route("/api/cartas", methods=["POST"])
@require_auth
def api_cartas_add():
    db = get_db()
    d = request.get_json(silent=True) or {}
    if not d.get("n_documento") or not d.get("bandeja"):
        return jsonify({"error": "n_documento y bandeja son obligatorios"}), 400
    data = _prepare_carta_payload(d)
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
    cerrar_refs = d.get("cerrar_referenciadas", True)
    cols = list(data.keys())
    ph = ", ".join(["%s"] * len(cols))
    sql = f"INSERT INTO cartas ({', '.join(cols)}) VALUES ({ph})"
    with db.cursor() as cur:
        cur.execute(sql, [data[k] for k in cols])
        new_id = cur.lastrowid
        cur.execute("SELECT * FROM cartas WHERE id=%s", (new_id,))
        r = cur.fetchone()
    db.commit()
    close_info = try_close_referenced_cartas(db, {**data, "id": new_id}, cerrar=bool(cerrar_refs))
    hilos_info = _rebuild_hilos(db)
    out = row_to_dict(r)
    out["_cierre_referencias"] = close_info
    out["_hilos"] = hilos_info
    return jsonify(out), 201


@app.route("/api/cartas/<int:cid>", methods=["PUT"])
@require_auth
def api_cartas_edit(cid):
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT * FROM cartas WHERE id=%s", (cid,))
        r = cur.fetchone()
        if not r:
            return jsonify({"error": "Carta no encontrada"}), 404
        existing = row_to_dict(r)
        if not filter_cartas_for_user([existing], current_user()):
            return jsonify({"error": "Sin acceso a esta carta"}), 403
        d = request.get_json(silent=True) or {}
        merged = {**existing, **d}
        data = _prepare_carta_payload(merged)
        u = current_user()
        if u and u.get("vista_parcial"):
            probe = {**data}
            if not filter_cartas_for_user([probe], u):
                return jsonify({"error": "No puedes mover la carta fuera de tu especialidad"}), 403
        cerrar_refs = d.get("cerrar_referenciadas", True)
        sets = [f"{k}=%s" for k in data.keys()]
        vals = list(data.values()) + [cid]
        cur.execute(
            f"UPDATE cartas SET {', '.join(sets)}, actualizado_en=NOW() WHERE id=%s",
            vals,
        )
        cur.execute("SELECT * FROM cartas WHERE id=%s", (cid,))
        r2 = cur.fetchone()
    db.commit()
    close_info = try_close_referenced_cartas(db, {**data, "id": cid}, cerrar=bool(cerrar_refs))
    hilos_info = _rebuild_hilos(db)
    out = row_to_dict(r2)
    out["_cierre_referencias"] = close_info
    out["_hilos"] = hilos_info
    return jsonify(out)


@app.route("/api/cartas/<int:cid>", methods=["DELETE"])
@require_auth
def api_cartas_del(cid):
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT * FROM cartas WHERE id=%s", (cid,))
        r = cur.fetchone()
        if not r:
            return jsonify({"error": "Carta no encontrada"}), 404
        if not filter_cartas_for_user([row_to_dict(r)], current_user()):
            return jsonify({"error": "Sin acceso a esta carta"}), 403
        cur.execute("DELETE FROM cartas WHERE id=%s", (cid,))
    db.commit()
    return jsonify({"ok": True, "id": cid})


@app.route("/api/stats", methods=["GET"])
@require_auth
def api_stats():
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

    classified = classify_cartas(rows)
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
            "plazos": plazos_config(),
            "pendientes": {
                "counts": pendientes["counts"],
                "debo_by_actor": pendientes["debo"]["by_actor"],
                "me_deben_by_actor": pendientes["me_deben"]["by_actor"],
                "debo_by_especialidad": pendientes["debo"]["by_especialidad"],
                "me_deben_by_especialidad": pendientes["me_deben"]["by_especialidad"],
            },
            "vista_parcial": bool(u and u.get("vista_parcial")),
            "user": public_user(u),
        }
    )


@app.route("/api/import/excel", methods=["POST"])
@require_perm("can_import")
def api_import_excel():
    if NOTIFY_SECRET:
        body = request.get_json(silent=True) or {}
        if request.headers.get("X-Notify-Secret") != NOTIFY_SECRET and body.get("secret") != NOTIFY_SECRET:
            return jsonify({"error": "No autorizado"}), 401
    body = request.get_json(silent=True) or {}
    force = bool(body.get("force"))
    db = get_db()
    result = import_excel_to_db(db, force=force)
    if result.get("ok") and not result.get("skipped"):
        norms = refresh_normalized_fields(db)
        result["normalize"] = norms
        try:
            result["hilos"] = _rebuild_hilos(db)
        except Exception as exc:
            result["hilos_error"] = str(exc)
    code = 200 if result.get("ok") else 500
    return jsonify(result), code


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


def _load_cartas(db):
    with db.cursor() as cur:
        cur.execute("SELECT * FROM cartas")
        return [row_to_dict(r) for r in cur.fetchall()]


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
    interval = max(15, cfg["interval_minutes"]) * 60

    def loop():
        if cfg["notify_on_start"]:
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
        f"[whatsapp] scheduler cada {cfg['interval_minutes']} min "
        f"(enabled={cfg['enabled']}, to={cfg['to'] or '—'})"
    )


@app.route("/")
def index():
    return send_from_directory(BASE, "dashboard.html")


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
                # Base ya cargada: asegurar amarre de hilos al arrancar
                hilos = _rebuild_hilos(conn)
                print("[hilos]", hilos, flush=True)
        finally:
            conn.close()
    except Exception as exc:
        print(f"[import] error: {exc}", flush=True)


if __name__ == "__main__":
    wait_for_mysql()
    init_db()
    if AUTO_IMPORT_EXCEL:
        threading.Thread(
            target=_auto_import_background,
            name="excel-import",
            daemon=True,
        ).start()
    start_whatsapp_scheduler()
    app.run(host=APP_HOST, port=APP_PORT, debug=FLASK_DEBUG)
