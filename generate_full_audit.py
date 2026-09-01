# -*- coding: utf-8 -*-
"""Auditoría 100% exhaustiva de las 108 cartas en 'Yo debo responder' y 29 en 'Me deben respuesta'."""
import json
import re
from app import app, get_db
from clasificacion import build_pendientes, enrich_carta

with app.app_context():
    db = get_db()
    with db.cursor() as cur:
        cur.execute("""
            SELECT id, n_documento, bandeja, sentido, fecha, estado, estado_norm, asunto, observacion, referencias, referencia, hilo_id, especialidad, especialidad_norm, tipo_documento, receptor, dirigido_a
            FROM cartas
            ORDER BY id ASC
        """)
        cartas = cur.fetchall()

    pend = build_pendientes(cartas, include_items=True)
    debo_items = pend["debo"]["items"]
    me_deben_items = pend["me_deben"]["items"]

    lines = []
    lines.append(f"TOTAL YO DEBO RESPONDER: {len(debo_items)}")
    lines.append(f"TOTAL ME DEBEN RESPUESTA: {len(me_deben_items)}\n")

    lines.append("═══════════════════════════════════════════════════════════════════")
    lines.append("        DETALLE COMPLETO DE 'YO DEBO RESPONDER' (108 cartas)")
    lines.append("═══════════════════════════════════════════════════════════════════\n")

    for idx, c in enumerate(debo_items, 1):
        asunto = (c.get("asunto") or "").strip()
        doc = (c.get("n_documento") or "").strip()
        bandeja = c.get("bandeja") or ""
        est = c.get("estado_norm") or ""
        fecha = str(c.get("fecha") or "")
        esp = c.get("especialidad_norm") or ""
        obs = (c.get("observacion") or "").strip()
        ref = (c.get("referencias") or c.get("referencia") or "").strip()
        lines.append(f"#{idx:03d} | [{c['id']}] {doc} | {fecha} | Esp: {esp} | Est: {est} | Bandeja: {bandeja}")
        lines.append(f"     Asunto: {asunto}")
        if ref:
            lines.append(f"     Ref: {ref[:80].replace(chr(10), ' ')}")
        if obs:
            lines.append(f"     Obs: {obs[:80].replace(chr(10), ' ')}")
        lines.append("")

    lines.append("\n═══════════════════════════════════════════════════════════════════")
    lines.append("       DETALLE COMPLETO DE 'ME DEBEN RESPUESTA' (29 cartas)")
    lines.append("═══════════════════════════════════════════════════════════════════\n")

    for idx, c in enumerate(me_deben_items, 1):
        asunto = (c.get("asunto") or "").strip()
        doc = (c.get("n_documento") or "").strip()
        bandeja = c.get("bandeja") or ""
        est = c.get("estado_norm") or ""
        fecha = str(c.get("fecha") or "")
        esp = c.get("especialidad_norm") or ""
        obs = (c.get("observacion") or "").strip()
        ref = (c.get("referencias") or c.get("referencia") or "").strip()
        lines.append(f"#{idx:03d} | [{c['id']}] {doc} | {fecha} | Esp: {esp} | Est: {est} | Bandeja: {bandeja}")
        lines.append(f"     Asunto: {asunto}")
        if ref:
            lines.append(f"     Ref: {ref[:80].replace(chr(10), ' ')}")
        if obs:
            lines.append(f"     Obs: {obs[:80].replace(chr(10), ' ')}")
        lines.append("")

    with open("full_audit_108_29_utf8.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Archivo 'full_audit_108_29_utf8.txt' generado con éxito.")
