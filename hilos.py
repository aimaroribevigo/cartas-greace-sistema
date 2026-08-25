# -*- coding: utf-8 -*-
"""Hilos de trámite: amarre automático, cronómetro vivo y semáforo 5 días."""
from __future__ import annotations

import hashlib
import os
import re
import unicodedata
from collections import Counter
from datetime import date, datetime

from normalizers import is_estado_abierto, normalize_estado

HILO_PLAZO_DIAS = int(os.environ.get("HILO_PLAZO_DIAS", "5"))
HILO_VERDE_HASTA = int(os.environ.get("HILO_VERDE_HASTA", "3"))
HILO_AMARILLO_DIA = int(os.environ.get("HILO_AMARILLO_DIA", "4"))
HILO_LEGADO_DIAS = int(os.environ.get("HILO_LEGADO_DIAS", "60"))
HILO_OPERATIVO_MAX_DIAS = int(os.environ.get("HILO_OPERATIVO_MAX_DIAS", "15"))

_DOC_RE = re.compile(
    r"(?:CARTA|INFORME|OFICIO|ASIENTO)\s*N[°º]?\s*[A-Z0-9\-/]+",
    re.I,
)
_CONSULTA_RE = re.compile(r"CONSULTA\s*N[°º]?\s*(\d+)", re.I)
_ENSAYO_RE = re.compile(r"ENSAYOS?\s+DE\s+([A-ZÁÉÍÓÚÑ0-9 ]{3,40})", re.I)

CLOSED_STATES = {
    "CERRADO",
    "ABSUELTO SUPERVISION",
    "ABSUELTO ENTIDAD",
    "ANULADA",
    "PARA CONOCIMIENTO",
}


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().upper()


def normalize_doc_key(raw: str | None) -> str:
    s = _fold(raw or "")
    s = s.replace("Nº", "N°").replace("N°", "N ").replace(".", "")
    s = re.sub(r"\s+", " ", s)
    return s


def extract_cited_docs(text: str | None) -> list[str]:
    if not text:
        return []
    return [normalize_doc_key(m.group(0)) for m in _DOC_RE.finditer(str(text))]


def extract_tramite_keys(c: dict) -> list[str]:
    """Claves de trámite estables (consulta / ensayo)."""
    blob = " ".join(
        [
            str(c.get("asunto") or ""),
            str(c.get("referencias") or ""),
            str(c.get("observacion") or ""),
            str(c.get("n_documento") or ""),
        ]
    )
    keys = []
    for m in _CONSULTA_RE.finditer(blob):
        keys.append(f"CONSULTA:{m.group(1)}")
    for m in _ENSAYO_RE.finditer(blob):
        tema = _fold(m.group(1))[:40]
        if tema:
            keys.append(f"ENSAYO:{tema}")
    # dedupe keep order
    return list(dict.fromkeys(keys))


def _as_date(v) -> date | None:
    if v is None or v == "":
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


def semaforo_dias(days: int | None) -> dict:
    if days is None:
        return {"kind": "sin_fecha", "label": "Sin fecha", "tone": "muted"}
    if days <= HILO_VERDE_HASTA:
        return {
            "kind": "a_tiempo",
            "label": f"A tiempo ({days}d / {HILO_PLAZO_DIAS})",
            "tone": "green",
            "days": days,
        }
    if days == HILO_AMARILLO_DIA:
        rest = HILO_PLAZO_DIAS - days
        return {
            "kind": "por_vencer",
            "label": f"Por vencer (queda {rest}d)",
            "tone": "amber",
            "days": days,
        }
    return {
        "kind": "vencido",
        "label": f"Vencido ({days}d)",
        "tone": "rose",
        "days": days,
    }


class _UF:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, i: int) -> int:
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]
            i = self.p[i]
        return i

    def union(self, a: int, b: int):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[rb] = ra


def build_thread_groups(cartas: list[dict]) -> list[dict]:
    """Agrupa cartas en hilos por citas + CONSULTA/ENSAYO."""
    n = len(cartas)
    if n == 0:
        return []
    uf = _UF(n)
    by_doc: dict[str, list[int]] = {}
    by_tramite: dict[str, list[int]] = {}

    for i, c in enumerate(cartas):
        dk = normalize_doc_key(c.get("n_documento"))
        if dk:
            by_doc.setdefault(dk, []).append(i)
        for tk in extract_tramite_keys(c):
            # CONSULTA une fuerte; ENSAYO solo si no es demasiado genérico
            if tk.startswith("ENSAYO:"):
                tema = tk.split(":", 1)[1]
                if len(tema) < 5:
                    continue
            by_tramite.setdefault(tk, []).append(i)

    # unir duplicados mismo n_documento
    for idxs in by_doc.values():
        for j in idxs[1:]:
            uf.union(idxs[0], j)

    # citas en referencias/asunto
    for i, c in enumerate(cartas):
        blob = " ".join(
            [str(c.get("referencias") or ""), str(c.get("asunto") or ""), str(c.get("observacion") or "")]
        )
        for cited in extract_cited_docs(blob):
            for j in by_doc.get(cited, []):
                if i != j:
                    uf.union(i, j)

    # trámite keys
    for idxs in by_tramite.values():
        if len(idxs) < 2:
            continue
        # limitar mega-clusters de ensayo: unir solo si comparten especialidad o ≤12
        if len(idxs) > 12:
            by_esp: dict[str, list[int]] = {}
            for i in idxs:
                esp = (cartas[i].get("especialidad_norm") or "SIN")[:60]
                by_esp.setdefault(esp, []).append(i)
            for group in by_esp.values():
                for j in group[1:]:
                    uf.union(group[0], j)
        else:
            for j in idxs[1:]:
                uf.union(idxs[0], j)

    roots: dict[int, list[int]] = {}
    for i in range(n):
        roots.setdefault(uf.find(i), []).append(i)

    groups = []
    for members in roots.values():
        items = [cartas[i] for i in members]
        groups.append(_summarize_group(items))
    groups.sort(key=lambda g: (0 if g["abierto"] else 1, -(g.get("dias") or 0), g["titulo"]))
    return groups


def _cartas_abiertas(items: list[dict]) -> list[dict]:
    out = []
    for c in items:
        est = normalize_estado(c.get("estado_norm") or c.get("estado"))
        if is_estado_abierto(est) and est not in ("PARA CONOCIMIENTO",):
            out.append(c)
    return out


def _fecha_ancla_abiertas(
    abiertas: list[dict], deuda_prefer: str | None = None
) -> date | None:
    """Ancla tipo next-response: última carta abierta con deuda (no el inicio del hilo)."""
    from clasificacion import classify_carta

    con_deuda: list[date] = []
    otras: list[date] = []
    for c in abiertas:
        fd = _as_date(c.get("fecha"))
        if not fd:
            continue
        cl = c.get("clasificacion") or classify_carta(c)
        if cl.get("solo_comunicacion") or cl.get("naturaleza") == "comunicacion":
            continue
        deuda = cl.get("deuda")
        if deuda in ("debo", "me_deben"):
            if deuda_prefer and deuda != deuda_prefer:
                continue
            con_deuda.append(fd)
        else:
            otras.append(fd)
    pool = con_deuda or (otras if not deuda_prefer else [])
    if not pool and deuda_prefer:
        # sin cartas de ese lado: no inventar ancla con el otro sentido
        return None
    if not pool:
        pool = [_as_date(c.get("fecha")) for c in abiertas]
        pool = [f for f in pool if f]
    return max(pool) if pool else None


def _titulo_group(items: list[dict]) -> str:
    for c in items:
        keys = extract_tramite_keys(c)
        if keys:
            k = keys[0]
            if k.startswith("CONSULTA:"):
                return f"Consulta N°{k.split(':',1)[1]}"
            if k.startswith("ENSAYO:"):
                return f"Ensayos de {k.split(':',1)[1].title()}"
    # fallback: asunto corto de la más antigua
    dated = sorted(items, key=lambda x: str(x.get("fecha") or "9999"))
    asu = (dated[0].get("asunto") or dated[0].get("n_documento") or "Trámite")[:80]
    return asu


def _summarize_group(items: list[dict], today: date | None = None) -> dict:
    today = today or date.today()
    fechas = [_as_date(c.get("fecha")) for c in items]
    fechas = [f for f in fechas if f]
    fecha_inicio = min(fechas) if fechas else None

    abiertas = _cartas_abiertas(items)
    abierto = len(abiertas) > 0
    fecha_ancla = _fecha_ancla_abiertas(abiertas) if abierto else None

    if abierto:
        fecha_cierre = None
        # Reloj operativo = edad desde ancla (última acción abierta), no desde inicio
        dias = (today - fecha_ancla).days if fecha_ancla else None
        dias_desde_inicio = (today - fecha_inicio).days if fecha_inicio else None
        dias_congelados = None
    else:
        fecha_cierre = max(fechas) if fechas else None
        if fecha_inicio and fecha_cierre:
            dias_congelados = (fecha_cierre - fecha_inicio).days
        else:
            dias_congelados = None
        dias = dias_congelados
        dias_desde_inicio = dias_congelados
        fecha_ancla = fecha_cierre

    sem = semaforo_dias(dias if abierto else None) if abierto else {
        "kind": "cerrado",
        "label": f"Cerrado ({dias_congelados}d)" if dias_congelados is not None else "Cerrado",
        "tone": "muted",
        "days": dias_congelados,
    }

    esps = [
        k
        for k, _ in Counter(
            (x.get("especialidad_norm") or "SIN ESPECIALIDAD") for x in items
        ).most_common()
    ]
    clave_parts = []
    for c in items:
        clave_parts.extend(extract_tramite_keys(c))
    base = clave_parts[0] if clave_parts else f"DOC:{normalize_doc_key(items[0].get('n_documento'))}"
    id_bits = sorted(
        str(c.get("id") or normalize_doc_key(c.get("n_documento")) or i)
        for i, c in enumerate(items)
    )
    suffix = hashlib.md5("|".join(id_bits).encode("utf-8")).hexdigest()[:10]
    clave = f"{base}|{suffix}"

    return {
        "clave": clave[:255],
        "titulo": _titulo_group(items),
        "especialidad_norm": esps[0] if esps else "SIN ESPECIALIDAD",
        "abierto": abierto,
        "estado": "abierto" if abierto else "cerrado",
        "fecha_inicio": fecha_inicio.isoformat() if fecha_inicio else None,
        "fecha_ancla": fecha_ancla.isoformat() if fecha_ancla else None,
        "fecha_cierre": fecha_cierre.isoformat() if fecha_cierre else None,
        "dias": dias,
        "dias_desde_inicio": dias_desde_inicio,
        "dias_congelados": dias_congelados,
        "semaforo": sem,
        "n_cartas": len(items),
        "n_abiertas": len(abiertas),
        "carta_ids": [c.get("id") for c in items if c.get("id") is not None],
        "docs": [c.get("n_documento") for c in items],
    }


def persist_hilos(conn, cartas: list[dict]) -> dict:
    """Recalcula hilos, limpia y reescribe tablas. No altera estados de cartas Excel."""
    groups = build_thread_groups(cartas)
    with conn.cursor() as cur:
        # asegurar columnas
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
        _ensure_carta_hilo_col(cur)
        cur.execute("UPDATE cartas SET hilo_id=NULL")
        cur.execute("DELETE FROM hilos")

        abiertos = cerrados = 0
        for g in groups:
            cur.execute(
                """
                INSERT INTO hilos (clave, titulo, especialidad_norm, estado,
                    fecha_inicio, fecha_cierre, dias_congelados, n_cartas)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    g["clave"][:255],
                    g["titulo"][:255],
                    g["especialidad_norm"],
                    g["estado"],
                    g["fecha_inicio"],
                    g["fecha_cierre"],
                    g["dias_congelados"],
                    g["n_cartas"],
                ),
            )
            hid = cur.lastrowid
            ids = [i for i in g["carta_ids"] if i is not None]
            if ids:
                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(
                    f"UPDATE cartas SET hilo_id=%s WHERE id IN ({placeholders})",
                    [hid] + ids,
                )
            if g["abierto"]:
                abiertos += 1
            else:
                cerrados += 1
    conn.commit()
    return {"ok": True, "hilos": len(groups), "abiertos": abiertos, "cerrados": cerrados}


def _ensure_carta_hilo_col(cur):
    cur.execute("SHOW COLUMNS FROM cartas LIKE 'hilo_id'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE cartas ADD COLUMN hilo_id INT NULL, ADD KEY idx_cartas_hilo (hilo_id)"
        )


def list_hilos_api(
    cartas: list[dict],
    solo_abiertos: bool = True,
    deuda_filter: str | None = None,
    excluir_legado: bool = False,
    max_dias: int | None = None,
    solo_urgentes: bool = False,
) -> dict:
    """Lista hilos enriquecidos con reloj anclado a la última carta abierta de deuda."""
    from clasificacion import classify_carta

    today = date.today()
    by_id = {c["id"]: c for c in cartas if c.get("id") is not None}
    groups = build_thread_groups(cartas)
    out = []
    counts = {
        "abiertos": 0,
        "cerrados": 0,
        "a_tiempo": 0,
        "por_vencer": 0,
        "vencido": 0,
        "legado": 0,
        "sin_fecha": 0,
        "operativos": 0,
        "urgentes": 0,
    }

    for g in groups:
        members = [by_id[i] for i in g["carta_ids"] if i in by_id]
        if not members:
            members = [c for c in cartas if c.get("n_documento") in (g.get("docs") or [])]

        deudas = []
        for c in members:
            cl = c.get("clasificacion") or classify_carta(c)
            deudas.append(cl.get("deuda"))
        has_debo = "debo" in deudas
        has_me = "me_deben" in deudas

        if deuda_filter == "debo" and not has_debo:
            continue
        if deuda_filter == "me_deben" and not has_me:
            continue
        if solo_abiertos and not g["abierto"]:
            continue

        abiertas = _cartas_abiertas(members)
        ancla = (
            _fecha_ancla_abiertas(abiertas, deuda_prefer=deuda_filter)
            if g["abierto"]
            else None
        )
        if g["abierto"]:
            days = (today - ancla).days if ancla else None
            sem = semaforo_dias(days)
        else:
            days = g.get("dias")
            ancla = _as_date(g.get("fecha_ancla") or g.get("fecha_cierre"))
            sem = g["semaforo"]

        legado = bool(g["abierto"] and days is not None and days > HILO_LEGADO_DIAS)
        if legado and g["abierto"]:
            sem = {
                **sem,
                "kind": "legado",
                "label": f"Legado abierto ({days}d desde ancla)",
                "tone": "slate",
            }

        urgente = bool(
            g["abierto"]
            and not legado
            and sem.get("kind") in ("por_vencer", "vencido")
        )

        # Conteos del universo (antes de filtros de foco)
        if legado and g["abierto"]:
            counts["legado"] += 1
        elif g["abierto"]:
            kind = sem.get("kind") or "sin_fecha"
            counts[kind] = counts.get(kind, 0) + 1
            counts["operativos"] += 1
            if urgente:
                counts["urgentes"] += 1

        if g["abierto"]:
            counts["abiertos"] += 1
        else:
            counts["cerrados"] += 1

        if excluir_legado and legado:
            continue
        if max_dias is not None and (days is None or days > max_dias):
            continue
        if solo_urgentes and not urgente:
            continue

        alerta = None
        if g["abierto"] and not legado and days is not None:
            titulo = g["titulo"]
            if days == HILO_AMARILLO_DIA:
                alerta = f"Ojo, te queda 1 dia para responder: {titulo}"
            elif days >= HILO_PLAZO_DIAS:
                alerta = f"URGENTE: Documento VENCIDO ({days}d desde ancla) — {titulo}"

        out.append(
            {
                **g,
                "fecha_ancla": ancla.isoformat() if ancla else g.get("fecha_ancla"),
                "dias": days,
                "semaforo": sem,
                "legado": legado,
                "urgente": urgente,
                "has_debo": has_debo,
                "has_me_deben": has_me,
                "alerta": alerta,
                "plazo_dias": HILO_PLAZO_DIAS,
            }
        )

    # Priorizar urgentes operativos, luego a tiempo, legado al final
    rank = {"vencido": 0, "por_vencer": 1, "a_tiempo": 2, "sin_fecha": 3, "legado": 4, "cerrado": 5}
    out.sort(
        key=lambda h: (
            rank.get((h.get("semaforo") or {}).get("kind"), 9),
            -(h.get("dias") or 0) if (h.get("semaforo") or {}).get("kind") in ("vencido", "por_vencer") else (h.get("dias") or 0),
            h.get("titulo") or "",
        )
    )

    return {
        "ok": True,
        "plazo_dias": HILO_PLAZO_DIAS,
        "verde_hasta": HILO_VERDE_HASTA,
        "amarillo_dia": HILO_AMARILLO_DIA,
        "legado_dias": HILO_LEGADO_DIAS,
        "operativo_max_dias": HILO_OPERATIVO_MAX_DIAS,
        "ancla": "ultima_carta_abierta_deuda",
        "counts": counts,
        "hilos": out,
    }


def build_whatsapp_hilos_urgentes(
    cartas: list[dict],
    deuda: str = "debo",
    max_items: int = 8,
) -> str | None:
    """Digest: solo hilos ámbar/rojo no legado (reloj desde ancla)."""
    data = list_hilos_api(
        cartas,
        solo_abiertos=True,
        deuda_filter=deuda if deuda in ("debo", "me_deben") else "debo",
        excluir_legado=True,
        solo_urgentes=True,
    )
    urgentes = data.get("hilos") or []
    today = date.today().isoformat()
    label = "Yo debo" if deuda == "debo" else "Me deben"
    lines = [
        f"*SistemaGreace — Hilos urgentes ({label})*",
        f"Fecha: {today}",
        f"Plazo: {HILO_PLAZO_DIAS}d desde ultima carta abierta (ancla)",
        "",
    ]
    if not urgentes:
        # Sin urgencias operativas: no inundar con legado
        full = list_hilos_api(
            cartas,
            solo_abiertos=True,
            deuda_filter=deuda if deuda in ("debo", "me_deben") else "debo",
        )
        c = full.get("counts") or {}
        lines.append("Sin hilos ambar/rojo en ventana operativa.")
        lines.append(
            f"Abiertos: {c.get('abiertos', 0)} · Legado: {c.get('legado', 0)} · "
            f"A tiempo: {c.get('a_tiempo', 0)}"
        )
        lines.append("")
        lines.append("Panel -> Pendientes -> Hilos (filtro Operativo)")
        return "\n".join(lines).strip()

    lines.append(f"Urgentes ahora: *{len(urgentes)}*")
    lines.append("")
    for h in urgentes[:max_items]:
        sem = h.get("semaforo") or {}
        tone = "VENCIDO" if sem.get("kind") == "vencido" else "POR VENCER"
        titulo = (h.get("titulo") or "Tramite")[:50]
        esp = (h.get("especialidad_norm") or "-")[:22]
        dias = h.get("dias")
        ancla = h.get("fecha_ancla") or "—"
        lines.append(f"- [{tone}] {titulo}")
        lines.append(f"  {esp} | {dias}d desde {ancla}")
    rest = len(urgentes) - min(max_items, len(urgentes))
    if rest > 0:
        lines.append(f"  ... y {rest} mas")
    lines.append("")
    lines.append("Panel -> Pendientes -> Hilos (Urgentes)")
    return "\n".join(lines).strip()


def try_close_referenced_cartas(conn, nueva: dict, cerrar: bool = True) -> dict:
    """Si la carta nueva es de cierre y cita otras abiertas, las marca CERRADO."""
    if not cerrar:
        return {"ok": True, "closed": 0}
    est = normalize_estado(nueva.get("estado_norm") or nueva.get("estado"))
    if est not in ("CERRADO", "ABSUELTO SUPERVISION", "ABSUELTO ENTIDAD"):
        return {"ok": True, "closed": 0, "reason": "no_es_cierre"}

    cited = set(
        extract_cited_docs(
            " ".join([str(nueva.get("referencias") or ""), str(nueva.get("asunto") or "")])
        )
    )
    if not cited:
        return {"ok": True, "closed": 0, "reason": "sin_citas"}

    closed = 0
    with conn.cursor() as cur:
        cur.execute("SELECT id, n_documento, estado, estado_norm FROM cartas")
        for r in cur.fetchall():
            if normalize_doc_key(r["n_documento"]) not in cited:
                continue
            est_r = normalize_estado(r.get("estado_norm") or r.get("estado"))
            if not is_estado_abierto(est_r):
                continue
            cur.execute(
                """
                UPDATE cartas
                SET estado=%s, estado_norm=%s, actualizado_en=NOW()
                WHERE id=%s
                """,
                ("CERRADO", "CERRADO", r["id"]),
            )
            closed += cur.rowcount
    if closed:
        conn.commit()
    return {"ok": True, "closed": closed}
