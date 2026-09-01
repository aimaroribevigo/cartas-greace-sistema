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
    "ABSUELTO": "ABSUELTO",
    "ABSUELTA": "ABSUELTO",
    "ABSUELTO SUPERVISION": "ABSUELTO SUPERVISION",
    "ABSUELTO SUPERVISIÓN": "ABSUELTO SUPERVISION",
    "ABSUELTA POR SUPERVISOR": "ABSUELTA POR SUPERVISOR",
    "ABSUELTA SUPERVISION": "ABSUELTO SUPERVISION",
    "ABSUELTA SUPERVISIÓN": "ABSUELTO SUPERVISION",
    "ABSUELTO POR SUPERVISION": "ABSUELTO SUPERVISION",
    "ABSUELTO POR SUPERVISIÓN": "ABSUELTO SUPERVISION",
    "ABSUELTO ENTIDAD": "ABSUELTO ENTIDAD",
    "ABSUELTA POR ENTIDAD": "ABSUELTA POR ENTIDAD",
    "ABSUELTA ENTIDAD": "ABSUELTO ENTIDAD",
    "ABSUELTO POR ENTIDAD": "ABSUELTO ENTIDAD",
    "ABSUELTA POR LA ENTIDAD": "ABSUELTA POR ENTIDAD",
    "ABSUELTO POR LA ENTIDAD": "ABSUELTO ENTIDAD",
    "ABSUELTA POR LA SUPERVISION": "ABSUELTA POR SUPERVISOR",
    "ABSUELTO POR LA SUPERVISION": "ABSUELTA POR SUPERVISOR",
    "ABSOLUCION": "ABSUELTO",
    "ABSOLUCIÓN": "ABSUELTO",
    "ABSOLUCION DE CONSULTA": "ABSUELTO",
    "ABSOLUCIÓN DE CONSULTA": "ABSUELTO",
    "ABSUELVE CONSULTA": "ABSUELTO",
    "ABSUELVEN CONSULTA": "ABSUELTO",
    "ABSUELVE": "ABSUELTO",
    "ABSUELVEN": "ABSUELTO",
    "ABSOLVER": "ABSUELTO",
    "ATENCION DE CONSULTA": "ABSUELTO",
    "ATENCIÓN DE CONSULTA": "ABSUELTO",
    "CONSULTA ABSUELTA": "ABSUELTO",
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
    "SUBSANADA": "SUBSANADO",
    "REITERADO": "REITERADO",
    "C. ANULADA": "ANULADA",
    "ANULADA": "ANULADA",
    "SIN RESPUESTA": "SIN RESPUESTA",
    "REINGRESO": "REINGRESO",
    "RESPONDER": "PARA RESPUESTA",
    "PARA CONOCIMIENTO": "PARA CONOCIMIENTO",
    "SOLO COMUNICACION": "PARA CONOCIMIENTO",
    "SOLO COMUNICACIÓN": "PARA CONOCIMIENTO",
    "COMUNICADO": "PARA CONOCIMIENTO",
    "COMUNICACION": "PARA CONOCIMIENTO",
    "COMUNICACIÓN": "PARA CONOCIMIENTO",
    "INFORMATIVO": "PARA CONOCIMIENTO",
    "INFORMATIVA": "PARA CONOCIMIENTO",
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
    "ABSUELTO",
    "ABSUELTA",
    "ABSUELTO SUPERVISION",
    "ABSUELTO SUPERVISIÓN",
    "ABSUELTA POR SUPERVISOR",
    "ABSUELTO ENTIDAD",
    "ABSUELTA POR ENTIDAD",
    "ABSUELTA SUPERVISION",
    "ABSUELTA SUPERVISIÓN",
    "ABSUELTO POR SUPERVISION",
    "ABSUELTO POR SUPERVISIÓN",
    "ABSUELTO POR ENTIDAD",
    "ABSUELTA POR ENTIDAD",
    "ABSUELTO POR LA ENTIDAD",
    "ABSUELTA POR LA ENTIDAD",
    "ABSUELTO POR LA SUPERVISION",
    "ABSUELTA POR LA SUPERVISION",
    "ABSOLUCION",
    "ABSOLUCIÓN",
    "ABSOLUCION DE CONSULTA",
    "ABSOLUCIÓN DE CONSULTA",
    "ABSUELVE CONSULTA",
    "ABSUELVEN CONSULTA",
    "ABSUELVE",
    "ABSUELVEN",
    "ABSOLVER",
    "ATENCION DE CONSULTA",
    "ATENCIÓN DE CONSULTA",
    "CONSULTA ABSUELTA",
    "SUBSANADO",
    "SUBSANADA",
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
    asunto_upper = _fold(str(asunto or ""))
    doc_upper = _fold(str(n_documento or ""))
    bandeja_lower = str(bandeja or "").lower()
    
    # 1. Si el contenido es explícitamente una absolución (ej. "ABSOLUCIÓN DE CONSULTA", "ABSUELTO", "ABSUELVEN"),
    # prevalece como cerrado/absuelto aunque en el Excel se haya registrado temporalmente "PENDIENTE ENTIDAD" o "PARA RESPUESTA".
    if any(k in asunto_upper or k in doc_upper for k in [
        "ABSUELT", "ABSUELV", "ABSOLUCION DE CONSULTA", "ABSOLUCIÓN DE CONSULTA", "ABSOLUCION", "ABSOLUCIÓN",
        "CONSULTA ABSUELTA", "ATENCION DE CONSULTA", "ATENCIÓN DE CONSULTA", "ABSOLVER",
        "ABSOLUCION A LAS OBSERVACIONES", "ABSOLUCIÓN A LAS OBSERVACIONES", "PRONUNCIAMIENTO A LA ABSOLUCION"
    ]):
        if bandeja_lower in ("recibida_sup",) or "SUPERVIS" in asunto_upper:
            return "ABSUELTO SUPERVISION"
        if bandeja_lower in ("recibida_pronis",) or "PRONIS" in asunto_upper or "MINSA" in asunto_upper:
            return "ABSUELTO ENTIDAD"
        return "ABSUELTO"

    # 2. Si el contenido es presentación/pedido de ensayos de control de calidad o comunicaciones informativas/protocolos
    if any(k in asunto_upper or k in doc_upper for k in [
        "PRESENTACION DE ENSAYO", "PRESENTACIÓN DE ENSAYO", "PRESENTACION DE LOS ENSAYO", "PRESENTACIÓN DE LOS ENSAYO",
        "PRESENTAR ENSAYO", "PRESENTAR LOS ENSAYO", "SOLICITA PRESENTACION DE ENSAYO", "SOLICITA PRESENTACIÓN DE ENSAYO",
        "SOLICITA PRESENTACION DE LOS ENSAYO", "SOLICITA PRESENTACIÓN DE LOS ENSAYO", "SOLICITA ENSAYO", "SOLICITUD DE ENSAYO",
        "REITERACION EN PRESENTACION DE ENSAYO", "REITERACIÓN EN PRESENTACIÓN DE ENSAYO",
        "REITERACION CONSECUTIVA EN PRESENTACION DE ENSAYO", "REITERACIÓN CONSECUTIVA EN PRESENTACIÓN DE ENSAYO",
        "ENTREGA DE ENSAYO", "REMISIÓN DE ENSAYO", "REMISION DE ENSAYO", "ENVÍO DE ENSAYO", "ENVIO DE ENSAYO",
        "RESULTADOS DE ENSAYO", "RESULTADO DE ENSAYO", "ENSAYOS DE CONTROL DE CALIDAD",
        "ENSAYO DE MATERIAL", "ENSAYOS DE MATERIAL", "ENSAYO DE DENSIDAD", "ENSAYOS DE DENSIDAD",
        "ENSAYO DE COMPRESION", "ENSAYOS DE COMPRESIÓN", "ROTURAS A COMPRESION", "ROTURAS A COMPRESIÓN",
        "ROTURA DE PROBETA", "ENSAYOS DEL LADRILLO", "ENSAYOS DE TUBERIA", "ENSAYOS DE CONCRETO",
        "CERTIFICADO DE CALIDAD", "CERTIFICADOS DE CALIDAD", "CERTIFICADO DE CALIBRACION", "CERTIFICADOS DE CALIBRACIÓN",
        "RECALIBRACION", "RECALIBRACIÓN", "CERTIFICADOS DE RECALIBRACIÓN", "CERTIFICADOS DE RECALIBRACION",
        "PROTOCOLOS DE LIBERACION", "PROTOCOLOS DE LIBERACIÓN", "PROTOCOLOS DE CALIDAD", "PROTOCOLOS PENDIENTES",
        "DOSSIER DE CALIDAD", "FICHAS TECNICAS", "FICHAS TÉCNICAS", "FICHAS TECNICAD", "FICHA TECNICAD", "DISEÑO DE MEZCLA", "DISEÑO DE MEZCLAS",
        "FORMATOS ATS", "FORMATOS DE SEGURIDAD", "SEGURIDAD Y SALUD EN EL TRABAJO", "CHARLA INFORMATIVA",
        "INSTRUCTIVO PARA ATORTOLAR", "CONSIDERACIONES EN BASE A LAS EE.TT PARA SU DESENCOFRADO",
        "CONSIDERACIONES PARA EMPALME", "CONSIDERACIONES PARA LA RECEPCIÓN", "CONSIDERACIONES PARA LA RECEPCION",
        "PLAN DE CALIDAD DEL PROVEEDOR", "MEZCLADORAS DE CONCRETO", "PROGRAMA DE ENSAYOS", "INSTRUCTIVOS DE ENSAYOS",
        "ANDAMIOS CERTIFICADOS", "ALERTA TEMPRANA", "COMUNICACIÓN DEL MATERIAL", "COMUNICACION DEL MATERIAL",
        "COMUNICACIÓN DE AFECTACIONES", "COMUNICACION DE AFECTACIONES",
        "NOTIFICACIÓN DE HITO", "NOTIFICACION DE HITO", "RESPUESTA A ALERTA",
        "ALCANZAR ACTA DE ACUERDOS", "ALCANZAR ACTA", "ACTA DE ACUERDOS", "ACUERDOS DEL ACTA",
        "DEVOLUCION DE 03 ARCHIVADORES", "DEVOLUCIÓN DE 03 ARCHIVADORES", "DEVOLUCION DE ARCHIVADORES", "DEVOLUCIÓN DE ARCHIVADORES", "DEVOLUCIÓN DE EXPEDIENTE", "DEVOLUCION DE EXPEDIENTE",
        "COMUNICADO", "CARTA CIRCULAR",
        "TRASLADO", "COMUNICAMOS DESIGNACION", "COMUNICAMOS DESIGNACIÓN", "ALCANZA CRONOGRAMA", "ALCANZAR CRONOGRAMA",
        "REMITO COMPROBANTE", "REMITO LOS COMPROBANTE", "REMITO LA ACREDITACION", "REMITO LA ACREDITACIÓN",
        "REMITO PLANO GEORREFERENCIADO", "REMITIR PLANO GEORREFERENCIADO", "ITINERARIO DE REUNION", "ITINERARIO DE REUNIÓN",
        "DECLARACION ANUAL SOBRE MINIMIZACION", "DECLARACIÓN ANUAL SOBRE MINIMIZACIÓN",
        "AMPLIACION DE CORREOS ELECTRONICOS", "AMPLIACIÓN DE CORREOS ELECTRÓNICOS", "AMPLIACIÓN DE CORRESO", "AMPLIACION DE CORRESO",
        "PONE EN CONOCIMIENTO", "PARA SU CONOCIMIENTO", "SOLO INFORMATIVO", "INFORMATIVO", "INFORMATIVA"
    ]):
        return "PARA CONOCIMIENTO"

    if raw_estado is not None and str(raw_estado).strip() and str(raw_estado).strip() != "-":
        norm = normalize_estado(raw_estado)
        if norm and norm != "SIN ESTADO":
            return norm
            
    if any(k in asunto_upper for k in ["NO HA SIDO EMITIDA", "NO SE EMITIO", "ANULADA"]):
        return "ANULADA"
        
    if any(k in asunto_upper for k in ["CONOCIMIENTO", "INVITA A REUNION", "REUNION", "DONACION", "CONTRATO DE SUMINISTRO"]):
        return "PARA CONOCIMIENTO"
        
    if any(k in asunto_upper or k in doc_upper for k in ["AUTORIZACI", "PERMISO", "CERTIFICADO", "LICENCIA", "CONFORMIDAD", "RESPUESTA"]):
        return "CERRADO"

    if any(k in asunto_upper for k in ["REUBICACION DE POSTES", "REUBICACIÓN DE POSTES", "REUBICACION DE SEMAFORO", "REUBICACIÓN DE SEMAFORO", "CIERRE DE VIAS", "CIERRE DE VÍAS", "CIERRE TEMPORAL DE JR", "INTERSECCION DE VIAS", "INTERSECCIÓN DE VÍAS"]):
        return "PENDIENTE MUNICIPALIDAD"
        
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

    for line in re.split(r"[\n\r]+", s):
        line_clean = line.strip()
        if not line_clean:
            continue
        doc_matches = list(_REF_ANT_DOC_RE.finditer(line_clean))
        if doc_matches:
            for m in doc_matches:
                _push(m.group(0))
        else:
            for piece in re.split(r"[,;]+|\s+Y\s+", line_clean, flags=re.I):
                if piece.strip():
                    _push(piece)

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
    """Recalcula estado_norm / especialidad_norm sobre filas ya importadas en lotes rápidos."""
    with conn.cursor() as cur:
        cur.execute("SELECT id, estado, especialidad, asunto, n_documento, bandeja, estado_norm, especialidad_norm FROM cartas")
        rows = cur.fetchall()
        updates = []
        for r in rows:
            raw_est = r.get("estado")
            asunto = r.get("asunto") or ""
            doc = r.get("n_documento") or ""
            ban = r.get("bandeja") or ""
            
            en = infer_estado_from_row(raw_est, asunto, doc, ban)
            esp = normalize_especialidad(r.get("especialidad"))
            if (r.get("estado_norm") or "") != en or (r.get("especialidad_norm") or "") != esp:
                updates.append((en, esp, r["id"]))

        updated = 0
        if updates:
            for i in range(0, len(updates), 500):
                batch = updates[i:i + 500]
                cur.executemany(
                    """
                    UPDATE cartas
                    SET estado_norm=%s, especialidad_norm=%s
                    WHERE id=%s
                    """,
                    batch,
                )
                updated += len(batch)
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
    if any(k in s for k in ("ABSUELT", "ABSUELV", "ABSOLUCI", "CERRAD", "ANULAD", "SUBSANAD", "PARA CONOCIMIENTO", "INFORMATIV")):
        return False
    return True
