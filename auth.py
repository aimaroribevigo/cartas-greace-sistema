# -*- coding: utf-8 -*-
"""Fase B: usuarios, sesión, alcance por especialidad, CRUD y rotación de password."""
from __future__ import annotations

import json
import os
import re
from functools import wraps

from flask import g, jsonify, session
from normalizers import split_especialidades, CATALOGO_ESPECIALIDADES, normalize_especialidad
from werkzeug.security import check_password_hash, generate_password_hash

AUTH_REQUIRED = os.environ.get("AUTH_REQUIRED", "1") in ("1", "true", "True", "yes")
DEFAULT_PASSWORD = (os.environ.get("DEFAULT_USER_PASSWORD") or "greace2026").strip()
FORCE_ROTATION = os.environ.get("FORCE_PASSWORD_ROTATION", "0") in ("1", "true", "True", "yes")
INCLUDE_MIXTA_FOR_ING = os.environ.get("AUTH_INCLUDE_MIXTA", "1") in (
    "1",
    "true",
    "True",
    "yes",
)
MIN_PASSWORD_LEN = int(os.environ.get("MIN_PASSWORD_LEN", "8"))

VALID_ROLES = ("admin", "residente", "ingeniero")

INGENIERO_SEEDS = [
    ("calidad", "CALIDAD", "Ingeniero Calidad"),
    ("estructuras", "ESTRUCTURAS", "Ingeniero Estructuras"),
    ("ssoma", "SSOMA", "Ingeniero SSOMA"),
    ("sanitarias", "INST. SANITARIAS", "Ingeniero Inst. Sanitarias"),
    ("electricas", "INST. ELECTRICAS", "Ingeniero Inst. Eléctricas"),
    ("arquitectura", "ARQUITECTURA", "Ingeniero Arquitectura"),
    ("geotecnia", "GEOTECNIA", "Ingeniero Geotecnia"),
    ("contratos", "ADM. DE CONTRATOS", "Ingeniero Adm. Contratos"),
    ("costos", "COSTOS", "Ingeniero Costos"),
    ("ambiente", "MEDIO AMBIENTE", "Ingeniero Medio Ambiente"),
]


def ensure_usuarios_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS usuarios (
            id INT NOT NULL AUTO_INCREMENT,
            username VARCHAR(80) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            nombre VARCHAR(120) NOT NULL,
            rol VARCHAR(40) NOT NULL DEFAULT 'ingeniero',
            especialidades_json TEXT NULL,
            activo TINYINT(1) NOT NULL DEFAULT 1,
            must_change_password TINYINT(1) NOT NULL DEFAULT 1,
            password_changed_at DATETIME NULL,
            creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_username (username),
            KEY idx_usuarios_rol (rol)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    cur.execute("SHOW COLUMNS FROM usuarios LIKE 'must_change_password'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE usuarios ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1"
        )
    cur.execute("SHOW COLUMNS FROM usuarios LIKE 'password_changed_at'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE usuarios ADD COLUMN password_changed_at DATETIME NULL")
    cur.execute("SHOW COLUMNS FROM usuarios LIKE 'intentos_fallidos'")
    if not cur.fetchone():
        cur.execute("ALTER TABLE usuarios ADD COLUMN intentos_fallidos INT NOT NULL DEFAULT 0")


def seed_usuarios(conn) -> dict:
    """Crea/corrige admin, residente e ingenieros; marca rotación si aplica."""
    created = []
    updated = []
    rotation_marked = []
    with conn.cursor() as cur:
        ensure_usuarios_table(cur)
        seeds = [
            ("admin", "Administrador", "admin", []),
            ("residente", "Residente CGGC", "residente", []),
        ]
        for username, esp_code, nombre in INGENIERO_SEEDS:
            seeds.append((username, nombre, "ingeniero", [esp_code]))

        for username, nombre, rol, esps in seeds:
            esp_json = json.dumps(esps, ensure_ascii=False)
            cur.execute("SELECT * FROM usuarios WHERE username=%s", (username,))
            row = cur.fetchone()
            if not row:
                cur.execute(
                    """
                    INSERT INTO usuarios
                    (username, password_hash, nombre, rol, especialidades_json, activo, must_change_password)
                    VALUES (%s,%s,%s,%s,%s,1,1)
                    """,
                    (
                        username,
                        generate_password_hash(DEFAULT_PASSWORD),
                        nombre,
                        rol,
                        esp_json,
                    ),
                )
                created.append(username)
                continue
            if (
                (row.get("especialidades_json") or "") != esp_json
                or (row.get("nombre") or "") != nombre
                or (row.get("rol") or "") != rol
            ):
                cur.execute(
                    """
                    UPDATE usuarios
                    SET nombre=%s, rol=%s, especialidades_json=%s
                    WHERE id=%s
                    """,
                    (nombre, rol, esp_json, row["id"]),
                )
                updated.append(username)

            # Rotación forzada: si aún usa la password por defecto, exigir cambio
            if FORCE_ROTATION and DEFAULT_PASSWORD:
                try:
                    still_default = check_password_hash(
                        row["password_hash"], DEFAULT_PASSWORD
                    )
                except Exception:
                    still_default = False
                if still_default and not int(row.get("must_change_password") or 0):
                    cur.execute(
                        "UPDATE usuarios SET must_change_password=1 WHERE id=%s",
                        (row["id"],),
                    )
                    rotation_marked.append(username)
    conn.commit()
    return {
        "ok": True,
        "created": created,
        "updated": updated,
        "rotation_marked": rotation_marked,
        "default_password_set": bool(DEFAULT_PASSWORD),
    }


def _parse_esps(raw) -> list[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x).strip() for x in data if str(x).strip()]
    except (TypeError, json.JSONDecodeError):
        pass
    return [p.strip() for p in str(raw).split(",") if p.strip()]


def _normalize_username(raw: str) -> str:
    return (raw or "").strip().lower()


def validate_username(raw: str) -> tuple[str | None, str | None]:
    if not raw or not str(raw).strip():
        return None, "El nombre de usuario es obligatorio"
    s = str(raw).strip().lower()
    if len(s) < 3:
        return None, "El usuario debe tener al menos 3 caracteres"
    if len(s) > 60:
        return None, "El usuario no puede superar los 60 caracteres"
    if not re.match(r"^[a-z0-9._-]+$", s):
        return None, "El usuario solo puede contener letras (a-z), números (0-9), puntos, guiones y sin espacios"
    return s, None


def validate_password(password: str, username: str | None = None) -> str | None:
    """Devuelve mensaje de error o None si OK."""
    pw = password or ""
    if len(pw) < MIN_PASSWORD_LEN:
        return f"La contraseña debe tener al menos {MIN_PASSWORD_LEN} caracteres"
    if len(pw) > 128:
        return "La contraseña no puede superar los 128 caracteres"
    if DEFAULT_PASSWORD and pw == DEFAULT_PASSWORD:
        return "No puedes usar la contraseña por defecto del sistema"
    if username and pw.lower() == username.lower():
        return "La contraseña no puede ser igual al usuario"
    if pw.isdigit() or pw.isalpha():
        return "La contraseña debe combinar letras y números (o símbolos)"
    return None


def user_from_row(r: dict | None) -> dict | None:
    if not r:
        return None
    esps = _parse_esps(r.get("especialidades_json"))
    rol = (r.get("rol") or "ingeniero").strip().lower()
    must = bool(int(r.get("must_change_password") or 0))
    return {
        "id": r["id"],
        "username": r["username"],
        "nombre": r.get("nombre") or r["username"],
        "rol": rol,
        "especialidades": esps,
        "activo": bool(r.get("activo", 1)),
        "must_change_password": must,
        "password_changed_at": (
            r["password_changed_at"].isoformat()
            if hasattr(r.get("password_changed_at"), "isoformat")
            else r.get("password_changed_at")
        ),
        "can_see_all": rol in ("admin", "residente"),
        "can_import": rol in ("admin", "residente"),
        "can_export": rol in ("admin", "residente"),
        "can_notify": rol in ("admin", "residente"),
        "can_manage_users": rol == "admin",
        # Todo el ciclo de cartas (crear → respuesta → hilo → cierre) lo maneja solo el admin.
        "can_create_cartas": rol == "admin",
        "can_delete_cartas": rol == "admin",
        "can_edit_formal": rol == "admin",
        "can_edit_cartas": rol == "admin",
        "vista_parcial": rol == "ingeniero",
        "solo_lectura_cartas": rol in ("ingeniero", "residente"),
    }


def fetch_user_row(conn, uid: int, only_active: bool = True) -> dict | None:
    with conn.cursor() as cur:
        if only_active:
            cur.execute("SELECT * FROM usuarios WHERE id=%s AND activo=1 LIMIT 1", (uid,))
        else:
            cur.execute("SELECT * FROM usuarios WHERE id=%s LIMIT 1", (uid,))
        return cur.fetchone()


def fetch_user_by_id(conn, uid: int) -> dict | None:
    return user_from_row(fetch_user_row(conn, uid, only_active=True))


def verify_login(conn, username: str, password: str) -> tuple[dict | None, str | None]:
    clean_user = (username or "").strip().lower()
    if not clean_user:
        return None, "Ingresa tu nombre de usuario"
    if not password:
        return None, "Ingresa tu contraseña"

    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM usuarios WHERE username=%s LIMIT 1",
            (clean_user,),
        )
        row = cur.fetchone()
    if not row:
        return None, "Usuario o contraseña incorrectos"

    if not bool(row.get("activo", 1)):
        return None, "Tu cuenta ha sido desactivada por seguridad. Contacta al Administrador para reactivarla."

    if not check_password_hash(row["password_hash"], password or ""):
        intentos = int(row.get("intentos_fallidos") or 0) + 1
        if intentos >= 3:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE usuarios SET intentos_fallidos=%s, activo=0 WHERE id=%s",
                    (intentos, row["id"]),
                )
            conn.commit()
            return None, "Has superado el límite de 3 intentos fallidos. Tu cuenta ha sido desactivada por seguridad. Contacta al Administrador para reactivarla."
        else:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE usuarios SET intentos_fallidos=%s WHERE id=%s",
                    (intentos, row["id"]),
                )
            conn.commit()
            restantes = 3 - intentos
            plur = "intento" if restantes == 1 else "intentos"
            return None, f"Contraseña incorrecta. Te queda {restantes} {plur} antes del bloqueo de cuenta."

    # Login exitoso: reiniciar contador de intentos fallidos
    if int(row.get("intentos_fallidos") or 0) > 0:
        with conn.cursor() as cur:
            cur.execute("UPDATE usuarios SET intentos_fallidos=0 WHERE id=%s", (row["id"],))
        conn.commit()

    u = user_from_row(row)
    # Si entra con password por defecto, forzar rotación en caliente
    if (
        FORCE_ROTATION
        and DEFAULT_PASSWORD
        and password == DEFAULT_PASSWORD
        and u
        and not u.get("must_change_password")
    ):
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE usuarios SET must_change_password=1 WHERE id=%s", (u["id"],)
            )
        conn.commit()
        u["must_change_password"] = True
    return u, None


def public_user(u: dict | None) -> dict | None:
    if not u:
        return None
    return {
        "id": u["id"],
        "username": u["username"],
        "nombre": u["nombre"],
        "rol": u["rol"],
        "especialidades": u.get("especialidades") or [],
        "activo": u.get("activo", True),
        "must_change_password": bool(u.get("must_change_password")),
        "password_changed_at": u.get("password_changed_at"),
        "can_see_all": u.get("can_see_all", False),
        "can_import": u.get("can_import", False),
        "can_notify": u.get("can_notify", False),
        "can_manage_users": u.get("can_manage_users", False),
        "can_create_cartas": u.get("can_create_cartas", False),
        "can_delete_cartas": u.get("can_delete_cartas", False),
        "can_edit_formal": u.get("can_edit_formal", False),
        "can_edit_cartas": u.get("can_edit_cartas", u.get("can_edit_formal", False)),
        "solo_lectura_cartas": u.get("solo_lectura_cartas", False),
        "vista_parcial": u.get("vista_parcial", False),
        "auth_required": AUTH_REQUIRED,
    }


def carta_in_scope(carta: dict, user: dict | None) -> bool:
    if not user or user.get("can_see_all"):
        return True
    esps = {e.upper() for e in (user.get("especialidades") or [])}
    if not esps:
        return False
    carta_esps = set(split_especialidades(
        carta.get("especialidad"), carta.get("especialidad_norm")
    ))
    if carta_esps & esps:
        return True
    if INCLUDE_MIXTA_FOR_ING and len(carta_esps) > 1:
        return True
    raw = (carta.get("especialidad") or "").upper()
    return any(e in raw for e in esps)


def filter_cartas_for_user(rows: list[dict], user: dict | None) -> list[dict]:
    if not user or user.get("can_see_all"):
        return rows
    return [r for r in rows if carta_in_scope(r, user)]


def login_user(user: dict) -> None:
    session.clear()
    session["uid"] = user["id"]
    session["username"] = user["username"]
    session.permanent = True


def logout_user() -> None:
    session.clear()
    g._auth_user = None
    g._auth_checked = True


def load_session_user(conn) -> dict | None:
    if getattr(g, "_auth_checked", False):
        return getattr(g, "_auth_user", None)
    g._auth_checked = True
    uid = session.get("uid")
    if not uid:
        g._auth_user = None
        return None
    u = fetch_user_by_id(conn, int(uid))
    g._auth_user = u
    if not u:
        session.clear()
    return u


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        from flask import current_app

        get_user = current_app.config.get("GET_CURRENT_USER")
        user = get_user() if callable(get_user) else None
        if AUTH_REQUIRED and not user:
            return jsonify({"error": "No autenticado", "code": "auth_required"}), 401
        return fn(*args, **kwargs)

    return wrapper


def require_perm(perm: str):
    def deco(fn):
        @wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            from flask import current_app

            get_user = current_app.config.get("GET_CURRENT_USER")
            user = get_user() if callable(get_user) else None
            if user and not user.get(perm):
                return jsonify({"error": "Sin permiso", "code": "forbidden", "perm": perm}), 403
            return fn(*args, **kwargs)

        return wrapper

    return deco


def list_usuarios_public(conn, include_inactive: bool = True) -> list[dict]:
    with conn.cursor() as cur:
        if include_inactive:
            cur.execute(
                """
                SELECT id, username, nombre, rol, especialidades_json, activo,
                       must_change_password, password_changed_at
                FROM usuarios ORDER BY activo DESC, rol, username
                """
            )
        else:
            cur.execute(
                """
                SELECT id, username, nombre, rol, especialidades_json, activo,
                       must_change_password, password_changed_at
                FROM usuarios WHERE activo=1 ORDER BY rol, username
                """
            )
        rows = cur.fetchall()
    out = []
    for r in rows:
        u = user_from_row(r)
        if u:
            out.append(public_user(u))
    return out


_CATALOGO_ESP_SET = {e.upper() for e in CATALOGO_ESPECIALIDADES}


def _sanitize_user_especialidades(esps: list) -> tuple[list[str], str | None]:
    """Normaliza y valida especialidades contra el catálogo oficial."""
    out: list[str] = []
    seen: set[str] = set()
    for e in esps or []:
        raw = str(e).strip()
        if not raw:
            continue
        norm = normalize_especialidad(raw)
        if norm in ("SIN ESPECIALIDAD", "MIXTA", ""):
            return [], f"Especialidad no válida: {raw}"
        canon = next((c for c in CATALOGO_ESPECIALIDADES if c.upper() == norm.upper()), None)
        if not canon:
            return [], f"Especialidad fuera del catálogo: {raw}"
        if canon not in seen:
            seen.add(canon)
            out.append(canon)
    return out, None


def create_usuario(
    conn,
    *,
    username: str,
    password: str,
    nombre: str,
    rol: str,
    especialidades: list[str] | None = None,
    must_change_password: bool = True,
) -> tuple[dict | None, str | None]:
    uname, err_u = validate_username(username)
    if err_u:
        return None, err_u

    nom = (nombre or "").strip()
    if not nom:
        return None, "El nombre y cargo son obligatorios"
    if len(nom) > 100:
        return None, "El nombre y cargo no pueden superar los 100 caracteres"

    rol = (rol or "ingeniero").strip().lower()
    if rol not in VALID_ROLES:
        return None, f"Rol inválido. Use: {', '.join(VALID_ROLES)}"

    err_p = validate_password(password, uname)
    if err_p:
        return None, err_p

    esps = especialidades or []
    esps, err_e = _sanitize_user_especialidades(esps)
    if err_e:
        return None, err_e
    if any(len(str(e).strip()) > 80 for e in esps):
        return None, "Cada especialidad no puede superar los 80 caracteres"
    if len(json.dumps(esps, ensure_ascii=False)) > 1500:
        return None, "El listado de especialidades supera el límite permitido"

    if rol == "ingeniero" and not esps:
        return None, "El rol Ingeniero requiere al menos una especialidad"
    if rol in ("admin", "residente"):
        esps = []

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM usuarios WHERE username=%s", (uname,))
        if cur.fetchone():
            return None, "Ese nombre de usuario ya está registrado"
        try:
            cur.execute(
                """
                INSERT INTO usuarios
                (username, password_hash, nombre, rol, especialidades_json, activo, must_change_password)
                VALUES (%s,%s,%s,%s,%s,1,%s)
                """,
                (
                    uname,
                    generate_password_hash(password),
                    nom[:120],
                    rol,
                    json.dumps(esps, ensure_ascii=False),
                    1 if must_change_password else 0,
                ),
            )
            new_id = cur.lastrowid
            conn.commit()
        except pymysql.err.DataError:
            return None, "Uno de los campos supera la capacidad de almacenamiento de la base de datos"
    return public_user(user_from_row(fetch_user_row(conn, new_id, only_active=False))), None


def update_usuario(
    conn,
    uid: int,
    *,
    nombre: str | None = None,
    rol: str | None = None,
    especialidades: list[str] | None = None,
    activo: bool | None = None,
) -> tuple[dict | None, str | None]:
    row = fetch_user_row(conn, uid, only_active=False)
    if not row:
        return None, "Usuario no encontrado"

    if nombre is not None:
        nom = nombre.strip()
        if not nom:
            return None, "El nombre y cargo no pueden estar vacíos"
        if len(nom) > 100:
            return None, "El nombre y cargo no pueden superar los 100 caracteres"
        new_nombre = nom[:120]
    else:
        new_nombre = row["nombre"]

    new_rol = (rol if rol is not None else row["rol"]).strip().lower()
    if new_rol not in VALID_ROLES:
        return None, f"Rol inválido. Use: {', '.join(VALID_ROLES)}"

    if especialidades is not None:
        esps, err_e = _sanitize_user_especialidades(especialidades)
        if err_e:
            return None, err_e
    else:
        esps = _parse_esps(row.get("especialidades_json"))

    if any(len(str(e).strip()) > 80 for e in esps):
        return None, "Cada especialidad no puede superar los 80 caracteres"
    if len(json.dumps(esps, ensure_ascii=False)) > 1500:
        return None, "El listado de especialidades supera el límite permitido"

    if new_rol == "ingeniero" and not esps:
        return None, "El rol Ingeniero requiere al menos una especialidad"
    if new_rol in ("admin", "residente"):
        esps = []

    new_activo = row["activo"] if activo is None else (1 if activo else 0)
    # No desactivar el último admin activo
    if row["rol"] == "admin" and not new_activo:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM usuarios WHERE rol='admin' AND activo=1 AND id<>%s",
                (uid,),
            )
            if (cur.fetchone() or {}).get("c", 0) < 1:
                return None, "No puedes desactivar el último administrador activo"

    with conn.cursor() as cur:
        try:
            if new_activo:
                cur.execute(
                    """
                    UPDATE usuarios
                    SET nombre=%s, rol=%s, especialidades_json=%s, activo=%s, intentos_fallidos=0
                    WHERE id=%s
                    """,
                    (new_nombre, new_rol, json.dumps(esps, ensure_ascii=False), new_activo, uid),
                )
            else:
                cur.execute(
                    """
                    UPDATE usuarios
                    SET nombre=%s, rol=%s, especialidades_json=%s, activo=%s
                    WHERE id=%s
                    """,
                    (new_nombre, new_rol, json.dumps(esps, ensure_ascii=False), new_activo, uid),
                )
            conn.commit()
        except pymysql.err.DataError:
            return None, "Uno de los campos supera la capacidad de almacenamiento de la base de datos"
    return public_user(user_from_row(fetch_user_row(conn, uid, only_active=False))), None


def admin_set_password(
    conn, uid: int, new_password: str, *, must_change: bool = True
) -> tuple[bool, str | None]:
    row = fetch_user_row(conn, uid, only_active=False)
    if not row:
        return False, "Usuario no encontrado"
    err = validate_password(new_password, row["username"])
    if err:
        return False, err
    with conn.cursor() as cur:
        if must_change:
            cur.execute(
                """
                UPDATE usuarios
                SET password_hash=%s, must_change_password=1, intentos_fallidos=0
                WHERE id=%s
                """,
                (generate_password_hash(new_password), uid),
            )
        else:
            cur.execute(
                """
                UPDATE usuarios
                SET password_hash=%s, must_change_password=0, password_changed_at=NOW(), intentos_fallidos=0
                WHERE id=%s
                """,
                (generate_password_hash(new_password), uid),
            )
    conn.commit()
    return True, None


def change_own_password(
    conn, uid: int, current_password: str, new_password: str
) -> tuple[bool, str | None]:
    row = fetch_user_row(conn, uid, only_active=True)
    if not row:
        return False, "Usuario no encontrado"
    if not check_password_hash(row["password_hash"], current_password or ""):
        return False, "Contraseña actual incorrecta"
    err = validate_password(new_password, row["username"])
    if err:
        return False, err
    if current_password == new_password:
        return False, "La nueva contraseña debe ser distinta a la actual"
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE usuarios
            SET password_hash=%s, must_change_password=0, password_changed_at=NOW()
            WHERE id=%s
            """,
            (generate_password_hash(new_password), uid),
        )
    conn.commit()
    # refrescar cache de request
    g._auth_checked = False
    g._auth_user = None
    return True, None
