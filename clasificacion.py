# -*- coding: utf-8 -*-
"""Clasificación operativa de cartas: actor, contraparte y deuda (debo / me deben).

Vista del Residente de obra:
- Emitida abierta (no traslado) → me deben respuesta (la contraparte).
- Recibida abierta (no traslado) → yo debo responder.
- Traslado / para conocimiento → solo comunicación (no genera deuda de respuesta).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from normalizers import is_estado_abierto, normalize_estado

ACTORES = {
    "residente": "Residente",
    "supervisor": "Supervisión",
    "rl": "Representante Legal",
    "entidad": "PRONIS",
    "otro": "Otro",
    "municipalidad": "Municipalidad",
    "jrd": "Junta Resol. Disputas",
}

# Contrapartes externas con plazo de respuesta (Pendientes Yo debo / Me deben)
PEND_CONTRAPARTES = ("supervisor", "entidad", "municipalidad", "jrd")

NATURALEZA_RESPUESTA = "respuesta"
NATURALEZA_COMUNICACION = "comunicacion"

DEUDA_DEBO = "debo"
DEUDA_ME_DEBEN = "me_deben"
DEUDA_NINGUNA = "ninguna"

_TRASLADO_RE = re.compile(r"\bTRASLAD", re.I)

_PEND_ENTIDAD_STATES = {
    "PENDIENTE ENTIDAD",
    "PENDIENTE MUNICIPALIDAD",
    "PENDIENTE SUPERVISION",
    "PENDIENTE CGGC",
}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().upper()


def is_solo_comunicacion(c: dict) -> bool:
    """Traslado / para conocimiento: no exige respuesta operativa propia."""
    estado = normalize_estado(c.get("estado_norm") or c.get("estado"))
    if estado == "PARA CONOCIMIENTO":
        return True
    blob = " ".join(
        [
            str(c.get("asunto") or ""),
            str(c.get("n_documento") or ""),
            str(c.get("observacion") or ""),
            str(c.get("referencias") or ""),
        ]
    )
    return bool(_TRASLADO_RE.search(blob))


def actor_registro(c: dict) -> str:
    """Quién ‘posee’ la bandeja de registro en el Excel."""
    ban = (c.get("bandeja") or "").strip()
    if ban == "residente":
        return "residente"
    if ban == "rl":
        return "rl"
    if ban == "recibida_sup":
        return "supervisor"
    if ban in ("recibida_pronis", "recibida_mpsc", "recibida_otros"):
        return "entidad"
    return "residente"


def infer_contraparte(c: dict) -> str:
    """Contraparte alineada a hojas 'Le Deben' / 'El CGGC Le Debe' (Destino/Emisor)."""
    ban = (c.get("bandeja") or "").strip()
    if ban == "recibida_sup":
        return "supervisor"
    if ban == "recibida_pronis":
        return "entidad"
    if ban == "recibida_mpsc":
        return "municipalidad"
    if ban == "recibida_otros":
        return "otro"

    est = _fold(str(c.get("estado_norm") or c.get("estado") or ""))
    if "MUNICIPALIDAD" in est:
        return "municipalidad"
    if "ENTIDAD" in est or "PRONIS" in est:
        return "entidad"
    if "SUPERVISION" in est or "SUPERVIS" in est:
        return "supervisor"

    dirigido = _fold(
        " ".join(
            [
                str(c.get("dirigido_a") or ""),
                str(c.get("receptor") or ""),
                str(c.get("empresa") or ""),
                str(c.get("cargo") or ""),
            ]
        )
    )
    if any(k in dirigido for k in ("MPSC", "MUNICIP", "SANCHEZ CARRION", "SÁNCHEZ CARRIÓN")):
        return "municipalidad"
    if any(
        k in dirigido
        for k in (
            "PRONIS",
            "MINSA",
            "ENTIDAD",
            "MESA DE PARTES",
            "CEPLAN",
        )
    ):
        return "entidad"
    if any(
        k in dirigido
        for k in (
            "JUNTA DE RESOLUCION",
            "RESOLUCION DE DISPUTAS",
            "RESOLUCIÓN DE DISPUTAS",
            " DISPUTAS",
            "JRD",
            "ARBITRAJE",
            "JUNTA RESOL",
        )
    ):
        return "jrd"
    if any(
        k in dirigido
        for k in (
            "CARRION",
            "CARRIÓN",
            "CCC",
            "SUPERV",
            "CONSORCIO CONSULTOR",
            "JQG",
        )
    ):
        return "supervisor"

    # Destinos atípicos (lab, hidrandina, etc.) → OTRO como en Excel
    if ban in ("residente", "rl") and dirigido:
        if any(
            k in dirigido
            for k in (
                "HIDRANDINA",
                "MOVISTAR",
                "LAB",
                "JMF",
                "SEGASC",
                "GERENCIA",
                "AREA DE",
                "ÁREA DE",
            )
        ):
            return "otro"

    if ban == "rl":
        return "entidad"
    return "supervisor"


def classify_carta(c: dict) -> dict[str, Any]:
    estado = normalize_estado(c.get("estado_norm") or c.get("estado"))
    abierta = is_estado_abierto(estado)
    sentido = (c.get("sentido") or "").strip().lower()
    if not sentido:
        ban = c.get("bandeja") or ""
        sentido = "recibida" if str(ban).startswith("recibida") else "emitida"

    actor = actor_registro(c)
    contraparte = infer_contraparte(c)
    traslado = is_solo_comunicacion(c) and estado != "PARA CONOCIMIENTO"
    # PARA CONOCIMIENTO siempre comunicación; TRASLADO:
    # - en recibidas: no deuda (Excel)
    # - en emitidas: sí deuda si está pendiente entidad/muni (seguimiento);
    #   si solo es PARA RESPUESTA/EN PROCESO informativo, no cuenta
    if estado == "PARA CONOCIMIENTO":
        deuda = DEUDA_NINGUNA
        naturaleza = NATURALEZA_COMUNICACION
    elif sentido == "recibida" and traslado:
        deuda = DEUDA_NINGUNA
        naturaleza = NATURALEZA_COMUNICACION
    elif sentido == "emitida" and traslado and estado not in _PEND_ENTIDAD_STATES:
        deuda = DEUDA_NINGUNA
        naturaleza = NATURALEZA_COMUNICACION
    elif not abierta:
        deuda = DEUDA_NINGUNA
        naturaleza = NATURALEZA_RESPUESTA
    elif sentido == "recibida":
        deuda = DEUDA_DEBO
        naturaleza = NATURALEZA_RESPUESTA
    else:
        deuda = DEUDA_ME_DEBEN
        naturaleza = NATURALEZA_RESPUESTA

    comunicacion = naturaleza == NATURALEZA_COMUNICACION

    if deuda == DEUDA_DEBO:
        deudor = "residente"
        acreedor = contraparte
    elif deuda == DEUDA_ME_DEBEN:
        deudor = contraparte
        acreedor = actor if actor in ("residente", "rl") else "residente"
    else:
        deudor = None
        acreedor = None

    # Para saldos, municipalidad se consolida con entidad (como KPI Excel)
    contraparte_saldo = "entidad" if contraparte == "municipalidad" else contraparte
    if contraparte_saldo not in ("supervisor", "entidad", "otro", "rl", "residente", "jrd"):
        contraparte_saldo = "otro"

    # Mapeo oficial de actores documentarios: RO, RL, SUP, PRONIS, MUNI, OTRO
    actor_short = {
        "residente": "RO",
        "rl": "RL",
        "supervisor": "SUP",
        "entidad": "PRONIS",
        "municipalidad": "MUNI",
        "jrd": "JRD",
        "otro": "OTRO",
    }
    if sentido == "emitida":
        emisor_code = actor_short.get(actor, "RO")
        dest_code = actor_short.get(contraparte, "SUP")
    else:
        emisor_code = actor_short.get(contraparte, "SUP")
        dest_code = "RO" if actor == "residente" else ("RL" if actor == "rl" else "RO")

    flujo_code = f"{emisor_code}➔{dest_code}"
    flujo_label = f"{emisor_code} ➔ {dest_code}"

    return {
        "actor": actor,
        "actor_label": ACTORES.get(actor, actor),
        "contraparte": contraparte,
        "contraparte_label": ACTORES.get(contraparte, contraparte),
        "contraparte_saldo": contraparte_saldo,
        "emisor_code": emisor_code,
        "dest_code": dest_code,
        "flujo_code": flujo_code,
        "flujo_label": flujo_label,
        "sentido": sentido,
        "naturaleza": naturaleza,
        "deuda": deuda,
        "deudor": deudor,
        "acreedor": acreedor,
        "abierta": abierta,
        "solo_comunicacion": comunicacion,
        "estado_norm": estado,
        "especialidad_norm": c.get("especialidad_norm") or "SIN ESPECIALIDAD",
    }


def enrich_carta(c: dict) -> dict:
    out = dict(c)
    out["clasificacion"] = classify_carta(c)
    return out


def build_pendientes(rows: list[dict], include_items: bool = False) -> dict:
    """Resumen de pendientes por deuda × actor × especialidad."""
    from plazos_respuesta import serialize_pendiente_item

    debo, me_deben, comunicacion = [], [], []
    for raw in rows:
        c = enrich_carta(raw)
        cl = c["clasificacion"]
        if cl["naturaleza"] == NATURALEZA_COMUNICACION:
            comunicacion.append(c)
        if cl["deuda"] == DEUDA_DEBO:
            debo.append(c)
        elif cl["deuda"] == DEUDA_ME_DEBEN:
            me_deben.append(c)

    def _solo_contrapartes_pend(items: list[dict]) -> list[dict]:
        out = []
        for c in items:
            cp = (c.get("clasificacion") or {}).get("contraparte")
            if cp in PEND_CONTRAPARTES:
                out.append(c)
        return out

    debo = _solo_contrapartes_pend(debo)
    me_deben = _solo_contrapartes_pend(me_deben)

    def matrix(items: list[dict], key_actor: str) -> dict:
        """key_actor: 'contraparte' para agrupar con quién está la deuda."""
        by_actor: dict[str, int] = {k: 0 for k in PEND_CONTRAPARTES}
        by_esp: dict[str, int] = {}
        by_actor_esp: dict[str, dict[str, int]] = {k: {} for k in PEND_CONTRAPARTES}
        for c in items:
            cl = c["clasificacion"]
            actor = cl.get(key_actor) or "supervisor"
            if actor not in PEND_CONTRAPARTES:
                continue
            esp = cl.get("especialidad_norm") or "SIN ESPECIALIDAD"
            by_actor[actor] = by_actor.get(actor, 0) + 1
            by_esp[esp] = by_esp.get(esp, 0) + 1
            by_actor_esp.setdefault(actor, {})
            by_actor_esp[actor][esp] = by_actor_esp[actor].get(esp, 0) + 1
        out = {
            "by_actor": by_actor,
            "by_especialidad": dict(sorted(by_esp.items(), key=lambda x: (-x[1], x[0]))),
            "by_actor_especialidad": by_actor_esp,
            "ids": [c.get("id") for c in items],
        }
        if include_items:
            out["items"] = items
        return out

    return {
        "ok": True,
        "actores": [{"id": k, "label": ACTORES[k]} for k in PEND_CONTRAPARTES],
        "contrapartes_pendientes": [
            {"id": k, "label": ACTORES[k]} for k in PEND_CONTRAPARTES
        ],
        "counts": {
            "debo": len(debo),
            "me_deben": len(me_deben),
            "comunicacion": len(comunicacion),
            "total_pendiente_respuesta": len(debo) + len(me_deben),
        },
        "debo": {
            "label": "Yo debo responder",
            "hint": "Cartas recibidas abiertas. Te escribió Supervisión, PRONIS, Municipalidad o JRD y aún no respondes.",
            **matrix(debo, "contraparte"),
            "items": [serialize_pendiente_item(c, "debo") for c in sorted(debo, key=_fecha_sort_key)],
        },
        "me_deben": {
            "label": "Me deben respuesta",
            "hint": "Cartas emitidas por RO o RL hacia Supervisión, PRONIS, Municipalidad o JRD sin respuesta.",
            **matrix(me_deben, "contraparte"),
            "items": [
                serialize_pendiente_item(c, "me_deben") for c in sorted(me_deben, key=_fecha_sort_key)
            ],
        },
        "comunicacion": {
            "label": "Solo comunicación / traslado",
            "hint": "Traslados y ‘para conocimiento’: no generan deuda de respuesta.",
            "count": len(comunicacion),
            "ids": [c.get("id") for c in comunicacion],
        },
        "_debo_items": debo,
        "_me_deben_items": me_deben,
    }


def _fecha_sort_key(c: dict):
    f = c.get("fecha") or ""
    return str(f)[:10] or "9999-99-99"


def build_whatsapp_debo_message(
    rows: list[dict],
    max_especialidades: int = 5,
    max_items: int = 10,
    include_me_deben_summary: bool = True,
) -> str | None:
    """Digest accionable: solo 'yo debo', top especialidades + cartas más antiguas."""
    from datetime import date

    from plazos import deadline_status

    pend = build_pendientes(rows, include_items=False)
    items = list(pend.get("_debo_items") or [])
    if not items:
        return None

    today = date.today().isoformat()
    counts = pend["counts"]
    by_actor = pend["debo"]["by_actor"]
    by_esp = pend["debo"]["by_especialidad"]

    lines = [
        "*SistemaGreace - Yo debo responder*",
        f"Fecha: {today}",
        "",
        f"Total pendientes tuyos: *{counts['debo']}* (sin traslados)",
    ]
    for actor_id in ("supervisor", "entidad", "rl", "residente"):
        n = by_actor.get(actor_id) or 0
        if n:
            lines.append(f"- {ACTORES.get(actor_id, actor_id)}: {n}")

    lines.append("")
    lines.append("*Top por especialidad*")
    for i, (esp, n) in enumerate(list(by_esp.items())[:max_especialidades], start=1):
        lines.append(f"{i}. {esp} - *{n}*")

    ranked = []
    for c in items:
        st = deadline_status(c)
        c2 = dict(c)
        c2["_plazo"] = st
        ranked.append(c2)
    ranked.sort(key=lambda x: (_fecha_sort_key(x), x.get("id") or 0))

    # Priorizar antiguas dentro del top de especialidades (no rarezas sueltas)
    top_esp = set(list(by_esp.keys())[:max_especialidades])
    ranked_focus = [
        c
        for c in ranked
        if (c.get("clasificacion") or {}).get("especialidad_norm") in top_esp
        or (c.get("especialidad_norm") in top_esp)
    ] or ranked

    if max_items > 0:
        lines.append("")
        lines.append(f"*Prioridad (mas antiguas del top esp., {max_items})*")
        for c in ranked_focus[:max_items]:
            cl = c.get("clasificacion") or {}
            doc = (c.get("n_documento") or "?")[:42]
            esp = (cl.get("especialidad_norm") or c.get("especialidad_norm") or "-")[:22]
            contra = cl.get("contraparte_label") or cl.get("contraparte") or ""
            st = c.get("_plazo") or {}
            age = st.get("label") or (c.get("estado_norm") or "")
            lines.append(f"- [{contra}] {doc}")
            lines.append(f"  {esp} | {age}")

        rest = counts["debo"] - min(max_items, counts["debo"])
        if rest > 0:
            lines.append(f"  ... y {rest} mas")
    else:
        lines.append("")
        lines.append("_Detalle operativo: bloque Hilos urgentes (arriba)._")

    if include_me_deben_summary:
        extra = build_whatsapp_me_deben_summary(rows)
        if extra:
            lines.append("")
            lines.append(extra)

    lines.append("")
    lines.append("Panel -> Pendientes -> Yo debo")
    return "\n".join(lines).strip()


def build_whatsapp_me_deben_summary(rows: list[dict], max_especialidades: int = 3) -> str | None:
    """Bloque corto: cuántas te deben (sin listar backlog completo)."""
    pend = build_pendientes(rows)
    n = pend["counts"]["me_deben"]
    if n <= 0:
        return None
    by_esp = pend["me_deben"]["by_especialidad"]
    by_actor = pend["me_deben"]["by_actor"]
    lines = [f"*Me deben respuesta:* {n}"]
    parts = []
    for actor_id in ("supervisor", "entidad", "rl"):
        k = by_actor.get(actor_id) or 0
        if k:
            parts.append(f"{ACTORES.get(actor_id, actor_id)} {k}")
    if parts:
        lines.append("- " + " | ".join(parts))
    top = list(by_esp.items())[:max_especialidades]
    if top:
        lines.append("- Esp: " + ", ".join(f"{e} {c}" for e, c in top))
    return "\n".join(lines)


def public_pendientes(rows: list[dict]) -> dict:
    """Respuesta API sin payloads internos (_debo_items)."""
    from plazos_respuesta import plazos_respuesta_config

    pend = build_pendientes(rows)
    pend.pop("_debo_items", None)
    pend.pop("_me_deben_items", None)
    pend["plazos_reglas"] = plazos_respuesta_config()
    return pend


def _esp_label(raw: str) -> str:
    return (raw or "SIN ESPECIALIDAD").strip() or "SIN ESPECIALIDAD"


def build_saldos(rows: list[dict]) -> dict:
    """Balance por especialidad: Le Deben al CGGC vs El CGGC Le Debe (como hoja Excel)."""
    pend = build_pendientes(rows)
    me = pend.get("_me_deben_items") or []
    debo = pend.get("_debo_items") or []

    by_esp: dict[str, dict[str, int]] = {}

    def bump(esp: str, side: str):
        e = _esp_label(esp)
        by_esp.setdefault(e, {"le_deben": 0, "cggc_debe": 0})
        by_esp[e][side] += 1

    for c in me:
        cl = c.get("clasificacion") or {}
        bump(cl.get("especialidad_norm") or c.get("especialidad_norm"), "le_deben")
    for c in debo:
        cl = c.get("clasificacion") or {}
        bump(cl.get("especialidad_norm") or c.get("especialidad_norm"), "cggc_debe")

    rows_out = []
    tot_le = tot_debo = 0
    for esp, vals in by_esp.items():
        le = vals["le_deben"]
        deb = vals["cggc_debe"]
        saldo = le - deb
        total = le + deb
        pct_propia = (deb / total) if total else 0.0
        if pct_propia >= 0.66 or saldo <= -10:
            riesgo = "ALTO"
        elif pct_propia >= 0.4 or abs(saldo) >= 5:
            riesgo = "MEDIO"
        else:
            riesgo = "BAJO"
        rows_out.append(
            {
                "especialidad": esp,
                "le_deben": le,
                "cggc_debe": deb,
                "saldo_neto": saldo,
                "pct_deuda_propia": round(pct_propia, 4),
                "nivel_riesgo": riesgo,
            }
        )
        tot_le += le
        tot_debo += deb

    rows_out.sort(key=lambda r: (r["cggc_debe"] + r["le_deben"]), reverse=True)

    # Quién le debe al CGGC (contraparte de me_deben)
    quien: dict[str, dict[str, int]] = {}
    for c in me:
        cl = c.get("clasificacion") or {}
        contra = cl.get("contraparte_saldo") or cl.get("contraparte") or "otro"
        actor = cl.get("actor") or "residente"
        quien.setdefault(contra, {"residente": 0, "rl": 0, "total": 0})
        if actor == "rl":
            quien[contra]["rl"] += 1
        else:
            quien[contra]["residente"] += 1
        quien[contra]["total"] += 1

    return {
        "ok": True,
        "counts": {
            "le_deben": tot_le,
            "cggc_debe": tot_debo,
            "saldo_neto": tot_le - tot_debo,
        },
        "by_especialidad": rows_out,
        "quien_debe": quien,
        "excel_target": {"le_deben": 175, "cggc_debe": 228, "saldo_neto": -53},
    }


def build_status_supervision(rows: list[dict]) -> dict:
    """Matriz especialidad × estado para cartas recibidas de supervisión (hoja STATUS)."""
    estados = [
        "CERRADO",
        "EN PROCESO",
        "PARA RESPUESTA",
        "C. OBSERVADA",
        "PENDIENTE ENTIDAD",
        "PARA CONOCIMIENTO",
    ]
    alias = {
        "OBSERVADO": "C. OBSERVADA",
        "C. OBSERVADA": "C. OBSERVADA",
    }
    by_esp: dict[str, dict[str, int]] = {}
    total_cols = {e: 0 for e in estados}
    n = 0
    for raw in rows:
        if (raw.get("bandeja") or "") != "recibida_sup":
            continue
        n += 1
        c = enrich_carta(raw)
        cl = c["clasificacion"]
        esp = _esp_label(cl.get("especialidad_norm"))
        est = alias.get(cl.get("estado_norm"), cl.get("estado_norm") or "SIN ESTADO")
        if est not in estados:
            # bucket leftovers loosely
            if "OBSERV" in est:
                est = "C. OBSERVADA"
            elif "PEND" in est and "ENTIDAD" in est:
                est = "PENDIENTE ENTIDAD"
            elif est not in estados:
                continue
        by_esp.setdefault(esp, {e: 0 for e in estados})
        by_esp[esp][est] = by_esp[esp].get(est, 0) + 1
        total_cols[est] = total_cols.get(est, 0) + 1

    out_rows = []
    for esp, cols in by_esp.items():
        total = sum(cols.get(e, 0) for e in estados)
        out_rows.append({"especialidad": esp, **{e: cols.get(e, 0) for e in estados}, "total": total})
    out_rows.sort(key=lambda r: r["total"], reverse=True)
    return {
        "ok": True,
        "titulo": "Control de cartas recibidas supervisión",
        "estados": estados,
        "rows": out_rows,
        "totals": {**total_cols, "total": n},
    }
