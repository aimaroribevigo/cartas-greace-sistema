# -*- coding: utf-8 -*-
"""Normalización de estados y especialidades (Excel ruidoso → catálogo estable)."""
from __future__ import annotations

import re
import unicodedata


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().upper()


ESTADO_ALIASES = {
    "ABIERTO": "ABIERTO",
    "EN TRAMITE": "ABIERTO",
    "EN TRÁMITE": "ABIERTO",
    "CERRADO": "CERRADO",
    "CERRADA": "CERRADO",
    "ABSUELTO SUPERVISION": "ABSUELTO SUPERVISION",
    "ABSUELTO SUPERVISIÓN": "ABSUELTO SUPERVISION",
    "ABSUELTA POR SUPERVISOR": "ABSUELTA POR SUPERVISOR",
    "ABSUELTO ENTIDAD": "ABSUELTO ENTIDAD",
    "ABSUELTA POR ENTIDAD": "ABSUELTA POR ENTIDAD",
    "PARA RESPUESTA": "PARA RESPUESTA",
    "PARA RESPUESTAA": "PARA RESPUESTA",
    "EN PROCESO": "EN PROCESO",
    "EN REVISION": "EN REVISION",
    "EN REVISIÓN": "EN REVISION",
    "C. OBSERVADA": "C. OBSERVADA",
    "C, OBSERVADA": "C. OBSERVADA",
    "C. OBERVADA": "C. OBSERVADA",
    "OBSERVADO": "C. OBSERVADA",
    "OBSERVADA": "C. OBSERVADA",
    "PENDIENTE ENTIDAD": "PENDIENTE ENTIDAD",
    "PEND. ENTIDAD": "PENDIENTE ENTIDAD",
    "PENSIENTE ENTIDAD": "PENDIENTE ENTIDAD",
    "PENDIENTE MUNICIPALIDAD": "PENDIENTE MUNICIPALIDAD",
    "PEND. MUNICIPALIDAD": "PENDIENTE MUNICIPALIDAD",
    "PENSIENTE MUNICIPALIDAD": "PENDIENTE MUNICIPALIDAD",
    "PENDIENTE SUPERVISION": "PENDIENTE SUPERVISION",
    "PENDIENTE SUPERVISOR": "PENDIENTE SUPERVISION",
    "PENDIENTE SUP./INSP.": "PENDIENTE SUPERVISION",
    "PENDIENTE CGGC": "PENDIENTE CGGC",
    "PENDIENTE RO": "PENDIENTE RO",
    "PENDIENTE JRD": "PENDIENTE JRD",
    "SUBSANADO": "SUBSANADO",
    "REITERADO": "REITERADO",
    "C. ANULADA": "ANULADA",
    "ANULADA": "ANULADA",
    "SIN RESPUESTA": "SIN RESPUESTA",
    "REINGRESO": "REINGRESO",
    "RESPONDER": "PARA RESPUESTA",
    "PARA CONOCIMIENTO": "PARA CONOCIMIENTO",
    # En bandejas a veces cierran así, pero la hoja 'Le Deben' aún las sigue:
    # las tratamos como abiertas de seguimiento hasta que el Excel las retire.
    "INGRESADA CON OTRO NUMERO DE ONSULTA": "EN PROCESO",
    "INGRESADA CON OTRO NUMERO DE CONSULTA": "EN PROCESO",
}


ESP_ALIASES = {
    "ESTR.": "ESTRUCTURAS",
    "ESTR": "ESTRUCTURAS",
    ".ESTR": "ESTRUCTURAS",
    "ESTRUCTURAS": "ESTRUCTURAS",
    "ARQ.": "ARQUITECTURA",
    "ARQ": "ARQUITECTURA",
    "ARQUITECTURA": "ARQUITECTURA",
    "INST. ELECTRICAS": "INST. ELECTRICAS",
    "INST. ELÉCTRICAS": "INST. ELECTRICAS",
    "INST. ELECTR.": "INST. ELECTRICAS",
    "INT. ELECTRICAS": "INST. ELECTRICAS",
    "II.EE": "INST. ELECTRICAS",
    "IIEE": "INST. ELECTRICAS",
    "INST. SANITARIAS": "INST. SANITARIAS",
    "INSTALACIONES SANITARIAS": "INST. SANITARIAS",
    "IISS": "INST. SANITARIAS",
    "INST. MECANICAS": "INST. MECANICAS",
    "INST. MECÁNICAS": "INST. MECANICAS",
    "INST MECANICAS": "INST. MECANICAS",
    "MECANICA": "INST. MECANICAS",
    "INST. Y COMUNICACIONES": "COMUNICACIONES",
    "INST Y COMUNICACIONES": "COMUNICACIONES",
    "INST. COMUNICACIONES": "COMUNICACIONES",
    "INST. DE COMUNICACIONES": "COMUNICACIONES",
    "INST. COMUN.": "COMUNICACIONES",
    "COMUNICACIONES": "COMUNICACIONES",
    "EQUIPAMIENTO": "EQUIPAMIENTO",
    "EQUIPAMEINTO": "EQUIPAMIENTO",
    "EQUIP. MEDICO": "EQUIPAMIENTO",
    "INST. EQUIP. HOSPITALARIO": "EQUIPAMIENTO",
    "GEOTECNIA": "GEOTECNIA",
    "GEOT.": "GEOTECNIA",
    "ESP. GEOTECNIA": "GEOTECNIA",
    "COSTOS": "COSTOS",
    "CALIDAD": "CALIDAD",
    "SSOMA": "SSOMA",
    "SOMA": "SSOMA",
    "MEDIO AMBIENTE": "MEDIO AMBIENTE",
    "ESP. M. AMBIENTE": "MEDIO AMBIENTE",
    "M. AMBIENTE": "MEDIO AMBIENTE",
    "M. AMB": "MEDIO AMBIENTE",
    "ADM. DE CONTR.": "ADM. DE CONTRATOS",
    "ADM. CONTRATOS": "ADM. DE CONTRATOS",
    "ADM CONTRATOS": "ADM. DE CONTRATOS",
    "ADM DE CONTRATOS": "ADM. DE CONTRATOS",
    "ADMIN DE CONTRATOS": "ADM. DE CONTRATOS",
    "ADMIN. DE CONTRATOS": "ADM. DE CONTRATOS",
    "ADMINIST DE CONTR": "ADM. DE CONTRATOS",
    "ADMINIST DE CONTRATOS": "ADM. DE CONTRATOS",
    "ADM. DE CONTRATOS": "ADM. DE CONTRATOS",
    "IIEE": "INST. ELECTRICAS",
    "IISS": "INST. SANITARIAS",
    "MECANICA": "INST. MECANICAS",
    "PRODUCCIÓN": "PRODUCCION",
    "PRODUCCION": "PRODUCCION",
    "SIN ESP": "SIN ESPECIALIDAD",
    "TOPOGRAFIA": "TOPOGRAFIA",
    "SUPERVISIÓN": "SUPERVISION",
    "SUPERVISION": "SUPERVISION",
    "RR.HH.": "RR.HH.",
    "RRHH": "RR.HH.",
    "OFICINA TECNICA": "OFICINA TECNICA",
    "ING. CAMPO": "CAMPO",
    "CAMPO": "CAMPO",
    "RESIDENTE": "RESIDENTE",
    "RESIDENCIA": "RESIDENTE",
    "RO": "RO",
    "WILINTONG DELGADO": "RO",
    "MILER": "CAMPO",
    "TODAS LAS ESP.": "MIXTA",
    "SIN ESPECIALIDAD": "SIN ESPECIALIDAD",
    "-": "SIN ESPECIALIDAD",
    ".": "SIN ESPECIALIDAD",
    "ES": "SIN ESPECIALIDAD",
}

# Catálogo operativo (select en formulario de cartas)
CATALOGO_ESPECIALIDADES = [
    "ESTRUCTURAS",
    "ARQUITECTURA",
    "INST. SANITARIAS",
    "INST. ELECTRICAS",
    "INST. MECANICAS",
    "EQUIPAMIENTO",
    "CALIDAD",
    "SSOMA",
    "BIM",
    "GEOTECNIA",
    "TOPOGRAFIA",
    "MEDIO AMBIENTE",
    "ADM. DE CONTRATOS",
    "COSTOS",
    "COMUNICACIONES",
    "PRODUCCION",
    "CAMPO",
    "RR.HH.",
]

CATALOGO_ESPECIALISTAS = [
    "ESPECIALISTA ESTRUCTURAS",
    "ESPECIALISTA ARQUITECTURA",
    "ESPECIALISTA SANITARIAS",
    "ESPECIALISTA ELECTRICAS",
    "ESPECIALISTA GEOTECNIA",
    "ESPECIALISTA BIM",
    "ESPECIALISTA TOPOGRAFIA",
    "ESPECIALISTA MEDIO AMBIENTE",
    "ESPECIALISTA ADM. CONTRATOS",
    "ESPECIALISTA COSTOS",
    "ESPECIALISTA COMUNICACIONES",
    "ESPECIALISTA PRODUCCION",
    "ESPECIALISTA CAMPO",
    "SSOMA / CALIDAD",
    "EQUIPAMIENTO",
    "RESIDENCIA",
    "OFICINA TECNICA",
]

# Especialidad técnica (tema) → especialista interno sugerido (Residencia)
ESP_TO_ESPECIALISTA: dict[str, str] = {
    "ESTRUCTURAS": "ESPECIALISTA ESTRUCTURAS",
    "ARQUITECTURA": "ESPECIALISTA ARQUITECTURA",
    "INST. SANITARIAS": "ESPECIALISTA SANITARIAS",
    "INST. ELECTRICAS": "ESPECIALISTA ELECTRICAS",
    "INST. MECANICAS": "EQUIPAMIENTO",
    "EQUIPAMIENTO": "EQUIPAMIENTO",
    "CALIDAD": "SSOMA / CALIDAD",
    "SSOMA": "SSOMA / CALIDAD",
    "GEOTECNIA": "ESPECIALISTA GEOTECNIA",
    "BIM": "ESPECIALISTA BIM",
    "TOPOGRAFIA": "ESPECIALISTA TOPOGRAFIA",
    "MEDIO AMBIENTE": "ESPECIALISTA MEDIO AMBIENTE",
    "ADM. DE CONTRATOS": "ESPECIALISTA ADM. CONTRATOS",
    "COSTOS": "ESPECIALISTA COSTOS",
    "COMUNICACIONES": "ESPECIALISTA COMUNICACIONES",
    "PRODUCCION": "ESPECIALISTA PRODUCCION",
    "RR.HH.": "RESIDENCIA",
    "CAMPO": "ESPECIALISTA CAMPO",
}


def catalogo_payload() -> dict:
    return {
        "especialidades": list(CATALOGO_ESPECIALIDADES),
        "especialistas": list(CATALOGO_ESPECIALISTAS),
        "esp_a_especialista": dict(ESP_TO_ESPECIALISTA),
    }


def suggest_especialista(especialidad_norm: str | None) -> str | None:
    key = (especialidad_norm or "").strip().upper()
    return ESP_TO_ESPECIALISTA.get(key)


CLOSED_STATES = {
    "CERRADO",
    "CERRADA",
    "ABSUELTO SUPERVISION",
    "ABSUELTO SUPERVISIÓN",
    "ABSUELTA POR SUPERVISOR",
    "ABSUELTO ENTIDAD",
    "ABSUELTA POR ENTIDAD",
    "SUBSANADO",
    "PARA CONOCIMIENTO",
    "ANULADA",
    "C. ANULADA",
}

OPEN_STATES = {
    "ABIERTO",
    "EN TRAMITE",
    "EN TRÁMITE",
    "PARA RESPUESTA",
    "EN PROCESO",
    "EN REVISION",
    "EN REVISIÓN",
    "C. OBSERVADA",
    "OBSERVADO",
    "OBSERVADA",
    "PENDIENTE ENTIDAD",
    "PENDIENTE MUNICIPALIDAD",
    "PENDIENTE SUPERVISION",
    "PENDIENTE CGGC",
    "PENDIENTE RO",
    "PENDIENTE JRD",
    "SIN RESPUESTA",
    "REINGRESO",
    "REITERADO",
}


def normalize_estado(raw) -> str:
    if raw is None:
        return "SIN ESTADO"
    s = _fold(str(raw))
    if not s:
        return "SIN ESTADO"
    if s in ESTADO_ALIASES:
        return ESTADO_ALIASES[s]
    for key, val in ESTADO_ALIASES.items():
        if key in s:
            return val
    return s[:100]


def infer_estado_from_row(raw_estado, asunto: str = "", n_documento: str = "", bandeja: str = "") -> str:
    if raw_estado is not None and str(raw_estado).strip() and str(raw_estado).strip() != "-":
        norm = normalize_estado(raw_estado)
        if norm and norm != "SIN ESTADO":
            return norm
            
    asunto_upper = _fold(str(asunto or ""))
    doc_upper = _fold(str(n_documento or ""))
    bandeja_lower = str(bandeja or "").lower()
    
    if any(k in asunto_upper for k in ["NO HA SIDO EMITIDA", "NO SE EMITIO", "ANULADA"]):
        return "ANULADA"
        
    if any(k in asunto_upper for k in ["CONOCIMIENTO", "INVITA A REUNION", "REUNION", "DONACION", "CONTRATO DE SUMINISTRO"]):
        return "PARA CONOCIMIENTO"
        
    if any(k in asunto_upper or k in doc_upper for k in ["AUTORIZACI", "PERMISO", "CERTIFICADO", "LICENCIA", "CONFORMIDAD", "RESPUESTA"]):
        return "CERRADO"
        
    if bandeja_lower in ("recibida_mpsc", "recibida_otros"):
        return "PARA CONOCIMIENTO"
        
    return "ABIERTO"


def _normalize_esp_token(key: str) -> str:
    if key in ESP_ALIASES:
        return ESP_ALIASES[key]
    if re.search(r"ADM\.?\s*(DE\s+)?CONTR", key):
        return "ADM. DE CONTRATOS"
    if re.search(r"\bESTR", key) and "INST" not in key:
        return "ESTRUCTURAS"
    if "ELECTRIC" in key or key in ("IIEE", "II.EE"):
        return "INST. ELECTRICAS"
    if "SANITAR" in key or key == "IISS":
        return "INST. SANITARIAS"
    if "MECANIC" in key:
        return "INST. MECANICAS"
    if "COMUNIC" in key:
        return "COMUNICACIONES"
    if "EQUIP" in key:
        return "EQUIPAMIENTO"
    if "GEOT" in key:
        return "GEOTECNIA"
    if "AMBIENT" in key:
        return "MEDIO AMBIENTE"
    if key in ("SOMA",) or "SSOMA" in key:
        return "SSOMA"
    for ak, av in ESP_ALIASES.items():
        fak = _fold(ak)
        if fak == key or (len(fak) >= 4 and key.startswith(fak)):
            return av
    return key[:60] if key else "SIN ESPECIALIDAD"


def split_especialidades(raw, norm_fallback=None) -> list[str]:
    """Lista estable de especialidades normalizadas (admite multi-valor)."""
    s = str(raw or "").replace("\n", " ").strip()
    norm_s = str(norm_fallback or "").replace("\n", " ").strip()
    if not s:
        s = norm_s
    if not s:
        return ["SIN ESPECIALIDAD"]
    if _fold(s) == "MIXTA" and norm_s and _fold(norm_s) != "MIXTA":
        s = norm_s
    parts = re.split(r"[,/;\+]|\s+Y\s+", s, flags=re.I)
    parts = [p.strip() for p in parts if p.strip()]
    norms: list[str] = []
    for p in parts:
        key = _fold(p)
        if key == "MIXTA":
            continue
        norms.append(_normalize_esp_token(key))
    norms = list(dict.fromkeys(norms))
    return norms if norms else ["SIN ESPECIALIDAD"]


def carta_matches_especialidad(carta: dict, selected: str) -> bool:
    """True si la carta incluye la especialidad indicada (multi-valor incluido)."""
    sel = _fold(selected)
    if not sel or sel == "ALL":
        return True
    esps = split_especialidades(
        carta.get("especialidad"), carta.get("especialidad_norm")
    )
    if sel in esps:
        return True
    if sel == "MIXTA":
        return len(esps) > 1
    return False


def normalize_especialidad(raw) -> str:
    norms = split_especialidades(raw)
    if len(norms) > 1:
        return ", ".join(norms)
    return norms[0]


_REF_ANT_DOC_RE = re.compile(
    r"(?:CARTA|INFORME|OFICIO|ASIENTO|CONTRATO)"
    r"(?:\s+DE\s+(?:[^N°]+?))?"
    r"\s*N[°º.]?\s*[A-Z0-9\-/.()]+(?:\s*\([^)]*\))?",
    re.I,
)


def parse_referencias_antecedentes(raw) -> list[str]:
    """Separa antecedentes citados aunque vengan del Excel con tabulaciones o espacios largos."""
    s = re.sub(r"\t", " ", str(raw or "")).strip()
    if not s:
        return []
    seen: set[str] = set()
    out: list[str] = []

    def _push(part: str) -> None:
        p = re.sub(r"\s+", " ", part).strip()
        if len(p) < 3:
            return
        key = p.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(p)

    for m in _REF_ANT_DOC_RE.finditer(s):
        _push(m.group(0))

    if not out:
        for chunk in re.split(r"[,;\n\r]+|\s+Y\s+", s, flags=re.I):
            for piece in re.split(r"\s{2,}", chunk):
                _push(piece)
            if chunk.strip():
                _push(chunk)

    if not out and s:
        _push(s)
    return out


def normalize_referencias_antecedentes(raw) -> str | None:
    if raw is None:
        return None
    parts = parse_referencias_antecedentes(raw)
    if not parts:
        collapsed = re.sub(r"\s+", " ", str(raw)).strip()
        return collapsed or None
    return ", ".join(parts)


def refresh_normalized_fields(conn) -> dict:
    """Recalcula estado_norm / especialidad_norm sobre filas ya importadas."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, estado, especialidad FROM cartas")
        rows = cur.fetchall()
        updated = 0
        for r in rows:
            en = normalize_estado(r.get("estado"))
            esp = normalize_especialidad(r.get("especialidad"))
            cur.execute(
                """
                UPDATE cartas
                SET estado_norm=%s, especialidad_norm=%s
                WHERE id=%s
                  AND (IFNULL(estado_norm,'') <> %s OR IFNULL(especialidad_norm,'') <> %s)
                """,
                (en, esp, r["id"], en, esp),
            )
            updated += cur.rowcount
    conn.commit()
    return {"ok": True, "checked": len(rows), "updated": updated}


def is_estado_abierto(estado_norm: str) -> bool:
    if not estado_norm:
        return False
    s = _fold(str(estado_norm))
    if not s or s == "SIN ESTADO":
        return False
    if s in CLOSED_STATES:
        return False
    return True
