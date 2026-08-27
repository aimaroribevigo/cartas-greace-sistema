# -*- coding: utf-8 -*-
"""Alertas de plazo sobre cartas abiertas (edad desde fecha del documento)."""
from __future__ import annotations

import os
from datetime import date, datetime
from typing import Any

from normalizers import is_estado_abierto, normalize_estado
from clasificacion import is_solo_comunicacion

VENCIDA_DIAS = int(os.environ.get("CARTA_VENCIDA_DIAS", "15"))
POR_VENCER_DIAS = int(os.environ.get("CARTA_POR_VENCER_DIAS", "10"))


def set_sla_config(cfg: dict | None) -> None:
    """Sincroniza umbrales de semáforo con configuracion_sistema."""
    global VENCIDA_DIAS, POR_VENCER_DIAS
    if not cfg:
        return
    if cfg.get("dias_vencida") is not None:
        VENCIDA_DIAS = max(1, int(cfg["dias_vencida"]))
    if cfg.get("dias_por_vencer") is not None:
        POR_VENCER_DIAS = max(1, int(cfg["dias_por_vencer"]))


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


def deadline_status(
    c: dict,
    today: date | None = None,
    vencida_dias: int | None = None,
    por_vencer_dias: int | None = None,
) -> dict:
    today = today or date.today()
    v_dias = vencida_dias if vencida_dias is not None else VENCIDA_DIAS
    pv_dias = por_vencer_dias if por_vencer_dias is not None else POR_VENCER_DIAS
    estado = c.get("estado_norm") or normalize_estado(c.get("estado"))
    if is_solo_comunicacion(c):
        fecha = _as_date(c.get("fecha"))
        return {
            "kind": "comunicacion",
            "days": None,
            "label": "Solo comunicación",
            "date": fecha.isoformat() if fecha else None,
            "open": False,
        }
    open_ = is_estado_abierto(estado)
    fecha = _as_date(c.get("fecha"))
    if not open_:
        return {
            "kind": "cerrada",
            "days": None,
            "label": estado or "Cerrada",
            "date": fecha.isoformat() if fecha else None,
            "open": False,
        }
    if not fecha:
        return {
            "kind": "sin_plazo",
            "days": None,
            "label": "Abierta sin fecha",
            "date": None,
            "open": True,
        }
    days_open = (today - fecha).days
    if days_open >= v_dias:
        return {
            "kind": "vencida",
            "days": -days_open,
            "label": f"Abierta hace {days_open} días",
            "date": fecha.isoformat(),
            "open": True,
        }
    if days_open >= pv_dias:
        rest = v_dias - days_open
        return {
            "kind": "por_vencer",
            "days": rest,
            "label": f"En riesgo ({days_open}d abierta)",
            "date": fecha.isoformat(),
            "open": True,
        }
    return {
        "kind": "ok",
        "days": v_dias - days_open,
        "label": f"En gestión ({days_open}d)",
        "date": fecha.isoformat(),
        "open": True,
    }


def plazos_config(vencida_dias: int | None = None, por_vencer_dias: int | None = None) -> dict:
    v_dias = vencida_dias if vencida_dias is not None else VENCIDA_DIAS
    pv_dias = por_vencer_dias if por_vencer_dias is not None else POR_VENCER_DIAS
    return {
        "vencida_dias": v_dias,
        "por_vencer_dias": pv_dias,
        "nota": (
            "Alerta por edad del documento en cartas abiertas "
            f"(≥{pv_dias}d riesgo, ≥{v_dias}d vencida). "
            "No usa días hábiles contractuales OSCE; calibrar con la obra."
        ),
    }


def classify_cartas(
    rows: list[dict],
    today: date | None = None,
    vencida_dias: int | None = None,
    por_vencer_dias: int | None = None,
) -> dict:
    today = today or date.today()
    v_dias = vencida_dias if vencida_dias is not None else VENCIDA_DIAS
    pv_dias = por_vencer_dias if por_vencer_dias is not None else POR_VENCER_DIAS
    vencidas, por_vencer = [], []
    sin_plazo = []
    abiertas_ok = []
    for raw in rows:
        c = dict(raw)
        st = deadline_status(c, today=today, vencida_dias=v_dias, por_vencer_dias=pv_dias)
        c["_plazo"] = st
        if st["kind"] == "vencida":
            vencidas.append(c)
        elif st["kind"] == "por_vencer":
            por_vencer.append(c)
        elif st["kind"] == "sin_plazo":
            sin_plazo.append(c)
        elif st["kind"] == "ok":
            abiertas_ok.append(c)
    vencidas.sort(key=lambda x: x["_plazo"]["days"] if x["_plazo"]["days"] is not None else 0)
    por_vencer.sort(key=lambda x: x["_plazo"]["days"] if x["_plazo"]["days"] is not None else 99)
    return {
        "today": today.isoformat(),
        "vencidas": vencidas,
        "por_vencer": por_vencer,
        "sin_plazo": sin_plazo,
        "abiertas_ok": abiertas_ok,
        "thresholds": plazos_config(v_dias, pv_dias),
        "counts": {
            "vencidas": len(vencidas),
            "por_vencer": len(por_vencer),
            "sin_plazo": len(sin_plazo),
            "abiertas_ok": len(abiertas_ok),
            "total_alerta": len(vencidas) + len(por_vencer),
        },
    }


# alias para no romper imports viejos
classify_consultas = classify_cartas


def build_whatsapp_message(classified: dict, max_items: int = 8) -> str | None:
    counts = classified["counts"]
    if counts["total_alerta"] == 0:
        return None
    lines = [
        "*SistemaGreace — Alertas de cartas*",
        f"Fecha: {classified['today']}",
        "",
        f"Vencidas (abiertas ≥{VENCIDA_DIAS}d): *{counts['vencidas']}*",
        f"Por vencer (≥{POR_VENCER_DIAS}d): *{counts['por_vencer']}*",
        "",
    ]

    def block(title: str, items: list[dict]) -> None:
        if not items:
            return
        lines.append(f"*{title}*")
        for c in items[:max_items]:
            st = c["_plazo"]
            doc = (c.get("n_documento") or "?")[:48]
            ban = c.get("bandeja") or ""
            lines.append(f"- [{ban}] {doc}")
            lines.append(f"  {st['label']} · {c.get('estado_norm') or ''}")
        if len(items) > max_items:
            lines.append(f"  … y {len(items) - max_items} más")
        lines.append("")

    block("Vencidas", classified["vencidas"])
    block("Por vencer", classified["por_vencer"])
    lines.append("Revisa el panel → Cartas / plazos.")
    return "\n".join(lines).strip()
