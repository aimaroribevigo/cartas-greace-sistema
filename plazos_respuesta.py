# -*- coding: utf-8 -*-
"""Plazos contractuales de respuesta por contraparte (Pendientes operativos)."""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from typing import Any

_RUNTIME_PLAZO_CFG: dict[str, Any] | None = None


def _label_plazo(dias: int, habiles: bool) -> str:
    tipo = "hábiles" if habiles else "calendario"
    return f"{dias} días {tipo}"


def build_plazo_reglas(cfg: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """Reglas contractuales: env como fallback, configuracion_sistema como prioridad."""
    c = cfg or _RUNTIME_PLAZO_CFG or {}
    sup_d = int(c.get("plazo_sup_dias") or os.environ.get("PLAZO_SUP_DIAS", "5"))
    ent_d = int(c.get("plazo_entidad_dias") or os.environ.get("PLAZO_PRONIS_DIAS", "15"))
    muni_d = int(c.get("plazo_muni_dias") or os.environ.get("PLAZO_MUNI_DIAS", "15"))
    jrd_d = int(c.get("plazo_jrd_dias") or os.environ.get("PLAZO_JRD_DIAS", "15"))
    otro_d = int(c.get("plazo_otro_dias") or os.environ.get("PLAZO_OTRO_DIAS", "15"))
    ro_d = int(c.get("plazo_ro_dias") or os.environ.get("PLAZO_RO_DIAS", "5"))
    return {
        "supervisor": {"dias": sup_d, "habiles": True, "label": _label_plazo(sup_d, True)},
        "entidad": {"dias": ent_d, "habiles": False, "label": _label_plazo(ent_d, False)},
        "municipalidad": {"dias": muni_d, "habiles": False, "label": _label_plazo(muni_d, False)},
        "jrd": {"dias": jrd_d, "habiles": False, "label": _label_plazo(jrd_d, False)},
        "otro": {"dias": otro_d, "habiles": False, "label": _label_plazo(otro_d, False)},
        "rl": {"dias": ro_d, "habiles": True, "label": _label_plazo(ro_d, True)},
        "residente": {"dias": ro_d, "habiles": True, "label": _label_plazo(ro_d, True)},
    }


def set_plazos_config(cfg: dict[str, Any] | None) -> None:
    global _RUNTIME_PLAZO_CFG
    _RUNTIME_PLAZO_CFG = cfg


def regla_plazo_contraparte(contraparte: str | None) -> dict[str, Any]:
    key = (contraparte or "otro").strip().lower()
    reglas = build_plazo_reglas()
    base = reglas.get(key) or reglas["otro"]
    return dict(base)


def _as_date(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def add_business_days(start: date, n: int) -> date:
    d = start
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def fecha_limite_respuesta(fecha_emision: date | None, contraparte: str | None) -> date | None:
    if not fecha_emision:
        return None
    reg = regla_plazo_contraparte(contraparte)
    if reg.get("habiles"):
        return add_business_days(fecha_emision, int(reg["dias"]))
    return fecha_emision + timedelta(days=int(reg["dias"]))


def _fecha_base_y_contraparte_plazo(c: dict, cl: dict) -> tuple[date | None, str, str | None]:
    """Fecha ancla y contraparte para plazo contractual."""
    contraparte = cl.get("contraparte") or "supervisor"
    fecha_doc = _as_date(c.get("fecha"))
    estado = (cl.get("estado_norm") or c.get("estado_norm") or c.get("estado") or "").upper()
    sentido = cl.get("sentido") or ""
    deuda = cl.get("deuda") or ""
    nota_traslado = None

    if deuda == "debo":
        return fecha_doc, "residente", "Plazo interno para responder"

    if sentido == "emitida" and deuda == "me_deben" and estado == "PENDIENTE ENTIDAD":
        contraparte = "entidad"
        traslado = _as_date(c.get("fecha_respuesta"))
        if traslado:
            return traslado, contraparte, "Traslado a entidad (desde fecha respuesta/traslado)"
        nota_traslado = "Traslado a entidad (15d desde emisión; indique fecha traslado en la carta)"

    return fecha_doc, contraparte, nota_traslado


def plazo_respuesta_operativo(c: dict, cl: dict | None = None, today: date | None = None) -> dict:
    """Calcula fecha límite y atraso según contraparte (quien debe responder)."""
    today = today or date.today()
    cl = cl or {}
    fecha_doc, contraparte, nota_traslado = _fecha_base_y_contraparte_plazo(c, cl)
    reg = regla_plazo_contraparte(contraparte)
    limite = fecha_limite_respuesta(fecha_doc, contraparte)

    regla_label = reg["label"]
    if nota_traslado:
        regla_label = f"{reg['label']} · {nota_traslado}"

    if not fecha_doc:
        return {
            "contraparte": contraparte,
            "regla_label": regla_label,
            "fecha_emision": None,
            "fecha_limite": None,
            "dias_restantes": None,
            "dias_atraso": None,
            "kind": "sin_fecha",
            "label": "Sin fecha de documento",
            "open": True,
        }
    if not limite:
        return {
            "contraparte": contraparte,
            "regla_label": regla_label,
            "fecha_emision": fecha_doc.isoformat(),
            "fecha_limite": None,
            "dias_restantes": None,
            "dias_atraso": None,
            "kind": "sin_plazo",
            "label": "Sin plazo calculado",
            "open": True,
        }

    delta = (limite - today).days
    if delta < 0:
        atraso = -delta
        return {
            "contraparte": contraparte,
            "regla_label": regla_label,
            "fecha_emision": fecha_doc.isoformat(),
            "fecha_limite": limite.isoformat(),
            "dias_restantes": 0,
            "dias_atraso": atraso,
            "kind": "vencida",
            "label": f"Vencida hace {atraso} día{'s' if atraso != 1 else ''}",
            "open": True,
        }
    if delta == 0:
        return {
            "contraparte": contraparte,
            "regla_label": regla_label,
            "fecha_emision": fecha_doc.isoformat(),
            "fecha_limite": limite.isoformat(),
            "dias_restantes": 0,
            "dias_atraso": 0,
            "kind": "hoy",
            "label": "Vence hoy",
            "open": True,
        }
    return {
        "contraparte": contraparte,
        "regla_label": regla_label,
        "fecha_emision": fecha_doc.isoformat(),
        "fecha_limite": limite.isoformat(),
        "dias_restantes": delta,
        "dias_atraso": 0,
        "kind": "ok",
        "label": f"En plazo ({delta}d restantes)",
        "open": True,
    }


def emitidor_label(c: dict, cl: dict | None = None) -> str:
    cl = cl or {}
    ban = (c.get("bandeja") or "").strip()
    if ban == "rl":
        return "Representante Legal (RL)"
    if ban == "residente":
        return "Residente (RO)"
    actor = cl.get("actor") or ""
    if actor == "rl":
        return "Representante Legal (RL)"
    if actor == "supervisor":
        return "Supervisión"
    if actor == "entidad":
        return "Entidad (PRONIS)"
    if actor == "municipalidad":
        return "Municipalidad"
    if actor == "jrd":
        return "Junta de Resolución de Disputas"
    return cl.get("actor_label") or "Residente (RO)"


def _yo_debo_responder_label(c: dict) -> str:
    """Especialista interno o especialidad técnica (no el RO genérico)."""
    area = (c.get("area") or "").strip()
    if area:
        return area
    ban = (c.get("bandeja") or "").strip()
    if ban.startswith("recibida"):
        try:
            from backfill_cartas import resolve_canonical_area

            inferred = resolve_canonical_area(c)
            if inferred:
                return inferred
        except ImportError:
            pass
    esp = (c.get("especialidad_norm") or c.get("especialidad") or "").strip()
    if esp and esp not in ("SIN ESPECIALIDAD", "MIXTA"):
        return esp
    return "Sin asignar"


def responsable_respuesta_label(c: dict, cl: dict, modo: str) -> str:
    cp = cl.get("contraparte_label") or cl.get("contraparte") or "—"
    if modo == "me_deben":
        return cp
    if modo == "debo":
        return _yo_debo_responder_label(c)
    return cp


def serialize_pendiente_item(c: dict, modo: str) -> dict:
    from clasificacion import classify_carta

    cl = c.get("clasificacion") or classify_carta(c)
    plazo = plazo_respuesta_operativo(c, cl)
    sentido = cl.get("sentido") or "emitida"
    return {
        "id": c.get("id"),
        "n_documento": c.get("n_documento"),
        "fecha": c.get("fecha"),
        "asunto": c.get("asunto"),
        "estado_norm": cl.get("estado_norm"),
        "especialidad_norm": cl.get("especialidad_norm"),
        "bandeja": c.get("bandeja"),
        "sentido": sentido,
        "actor": cl.get("actor"),
        "actor_label": cl.get("actor_label"),
        "contraparte": cl.get("contraparte"),
        "contraparte_label": cl.get("contraparte_label"),
        "flujo_label": cl.get("flujo_label"),
        "flujo_code": cl.get("flujo_code"),
        "emisor_code": cl.get("emisor_code"),
        "dest_code": cl.get("dest_code"),
        "emitido_por": emitidor_label(c, cl) if modo == "me_deben" else None,
        "recibido_de": cl.get("contraparte_label") if modo == "debo" else None,
        "enviado_a": cl.get("contraparte_label") if modo == "me_deben" else None,
        "debe_responder": responsable_respuesta_label(c, cl, modo),
        "plazo": plazo,
    }


def plazos_respuesta_config(cfg: dict[str, Any] | None = None) -> dict:
    reglas = build_plazo_reglas(cfg)
    return {
        "supervisor": reglas["supervisor"],
        "entidad": reglas["entidad"],
        "municipalidad": reglas["municipalidad"],
        "jrd": reglas["jrd"],
        "residente": reglas["residente"],
        "nota": (
            "Plazos contractuales Pendientes: Supervisión (hábiles); "
            "tras traslado, Entidad/Municipalidad/JRD (calendario). Configurable en Configuración."
        ),
    }
