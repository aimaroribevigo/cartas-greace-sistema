# -*- coding: utf-8 -*-
"""Envío de alertas WhatsApp (CallMeBot para prueba; Meta Cloud API opcional)."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if not digits:
        return ""
    # Perú: 9 dígitos móviles → anteponer 51
    if len(digits) == 9 and digits.startswith("9"):
        digits = "51" + digits
    return digits


def whatsapp_config() -> dict[str, Any]:
    enabled = os.environ.get("WHATSAPP_ENABLED", "0") in ("1", "true", "True", "yes")
    provider = (os.environ.get("WHATSAPP_PROVIDER") or "callmebot").strip().lower()
    to_raw = os.environ.get("WHATSAPP_TO", "")
    return {
        "enabled": enabled,
        "provider": provider,
        "to": normalize_phone(to_raw),
        "to_raw": to_raw,
        "callmebot_apikey": (os.environ.get("CALLMEBOT_APIKEY") or "").strip(),
        "meta_token": (os.environ.get("META_WA_TOKEN") or "").strip(),
        "meta_phone_id": (os.environ.get("META_WA_PHONE_NUMBER_ID") or "").strip(),
        "interval_minutes": int(os.environ.get("WHATSAPP_INTERVAL_MINUTES", "180")),
        "notify_on_start": os.environ.get("WHATSAPP_NOTIFY_ON_START", "0")
        in ("1", "true", "True", "yes"),
    }


def _http_get(url: str, timeout: int = 30) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "SistemaGreace/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body


def _http_post_json(url: str, payload: dict, headers: dict, timeout: int = 30) -> tuple[int, str]:
    data = json.dumps(payload).encode("utf-8")
    hdrs = {"Content-Type": "application/json", "User-Agent": "SistemaGreace/1.0", **headers}
    req = urllib.request.Request(url, data=data, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body


def send_callmebot(phone: str, text: str, apikey: str) -> dict:
    if not apikey:
        return {
            "ok": False,
            "error": "Falta CALLMEBOT_APIKEY. Activa CallMeBot en WhatsApp y pega la apikey en .env",
        }
    if not phone:
        return {"ok": False, "error": "Falta WHATSAPP_TO"}
    qs = urllib.parse.urlencode({"phone": phone, "text": text, "apikey": apikey})
    url = f"https://api.callmebot.com/whatsapp.php?{qs}"
    status, body = _http_get(url)
    ok = 200 <= status < 300 and "error" not in body.lower()
    # CallMeBot a veces responde 200 con texto de error
    if "APIKey is invalid" in body or "not activated" in body.lower():
        ok = False
    return {
        "ok": ok,
        "provider": "callmebot",
        "status_code": status,
        "response": body[:500],
        "to": phone,
    }


def send_meta_cloud(phone: str, text: str, token: str, phone_number_id: str) -> dict:
    """Envío de texto libre: solo válido dentro de ventana 24h del usuario en Cloud API.
    Para alertas proactivas reales hace falta plantilla utility aprobada.
    """
    if not token or not phone_number_id:
        return {
            "ok": False,
            "error": "Faltan META_WA_TOKEN y/o META_WA_PHONE_NUMBER_ID",
        }
    if not phone:
        return {"ok": False, "error": "Falta WHATSAPP_TO"}
    url = f"https://graph.facebook.com/v20.0/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": text[:4096]},
    }
    status, body = _http_post_json(url, payload, {"Authorization": f"Bearer {token}"})
    ok = 200 <= status < 300
    return {
        "ok": ok,
        "provider": "meta",
        "status_code": status,
        "response": body[:800],
        "to": phone,
    }


def send_whatsapp(text: str, cfg: dict | None = None) -> dict:
    cfg = cfg or whatsapp_config()
    if not cfg["enabled"]:
        return {
            "ok": False,
            "skipped": True,
            "error": "WhatsApp deshabilitado (WHATSAPP_ENABLED=0). Actívalo en .env tras configurar apikey.",
        }
    provider = cfg["provider"]
    if provider == "callmebot":
        return send_callmebot(cfg["to"], text, cfg["callmebot_apikey"])
    if provider == "meta":
        return send_meta_cloud(cfg["to"], text, cfg["meta_token"], cfg["meta_phone_id"])
    return {"ok": False, "error": f"Proveedor desconocido: {provider}"}
