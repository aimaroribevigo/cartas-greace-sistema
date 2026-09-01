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

HILOS_CARTAS_COLS = (
    "id, bandeja, sentido, fecha, n_documento, tipo_documento, asunto, "
    "especialidad, especialidad_norm, estado, estado_norm, referencias, referencia, hilo_id"
)

_RUNTIME_HILO_CFG: dict | None = None


def set_hilo_plazo_config(cfg: dict | None) -> None:
    """Sincroniza plazos de hilos con configuracion_sistema (plazo_ro_dias = fuente)."""
    global HILO_PLAZO_DIAS, HILO_VERDE_HASTA, HILO_AMARILLO_DIA, HILO_OPERATIVO_MAX_DIAS, _RUNTIME_HILO_CFG
    _RUNTIME_HILO_CFG = cfg
    c = cfg or {}
    plazo = int(c.get("plazo_ro_dias") or c.get("dias_hilo") or os.environ.get("HILO_PLAZO_DIAS", "5"))
    HILO_PLAZO_DIAS = max(1, plazo)
    HILO_VERDE_HASTA = max(1, HILO_PLAZO_DIAS - 2)
    HILO_AMARILLO_DIA = max(1, HILO_PLAZO_DIAS - 1)
    max_cal = max(
        int(c.get("plazo_entidad_dias") or 15),
        int(c.get("plazo_muni_dias") or 15),
        int(c.get("plazo_jrd_dias") or 15),
    )
    HILO_OPERATIVO_MAX_DIAS = max_cal

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
    "ABSUELTA POR SUPERVISOR",
    "ABSUELTA POR ENTIDAD",
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


def canonical_tramite_clave(c: dict) -> str | None:
    """Clave estable del trámite (p. ej. CONSULTA:177). Sin hash aleatorio."""
    for k in extract_tramite_keys(c):
        if k.startswith("CONSULTA:"):
            return k
    return None


def _stable_clave_for_items(items: list[dict]) -> str:
    for c in items:
        ck = canonical_tramite_clave(c)
        if ck:
            return ck
    dk = normalize_doc_key((items[0] if items else {}).get("n_documento"))
    if dk:
        return f"DOC:{dk}"[:255]
    cid = (items[0] if items else {}).get("id")
    return f"SUELTA:{cid or 0}"[:255]


def _ensure_hilos_table(cur):
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
    try:
        cur.execute(
            """
            SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cartas'
              AND CONSTRAINT_NAME = 'fk_cartas_hilo'
            """
        )
        if not cur.fetchone():
            cur.execute(
                """
                ALTER TABLE cartas
                ADD CONSTRAINT fk_cartas_hilo
                FOREIGN KEY (hilo_id) REFERENCES hilos(id)
                ON DELETE SET NULL ON UPDATE CASCADE
                """
            )
    except Exception:
        pass


def _hilo_ids_from_cited_docs(cur, cited: set[str], doc_map: dict[str, int] | None = None) -> set[int]:
    if not cited:
        return set()
    if doc_map is not None:
        out: set[int] = set()
        for c in cited:
            if c in doc_map:
                out.add(doc_map[c])
        return out
    cur.execute("SELECT id, n_documento, hilo_id FROM cartas WHERE hilo_id IS NOT NULL")
    out: set[int] = set()
    for r in cur.fetchall():
        doc_k = normalize_doc_key(r.get("n_documento"))
        raw_doc = str(r.get("n_documento") or "").strip().upper()
        if doc_k in cited or raw_doc in cited or r.get("n_documento") in cited:
            hid = r.get("hilo_id")
            if hid is not None:
                out.add(int(hid))
    return out


def _merge_hilos(cur, primary_id: int, other_ids: set[int]) -> None:
    for oid in other_ids:
        if oid == primary_id:
            continue
        cur.execute("UPDATE cartas SET hilo_id=%s WHERE hilo_id=%s", (primary_id, oid))
        cur.execute("DELETE FROM hilos WHERE id=%s", (oid,))


def _get_or_create_hilo(cur, clave: str, carta: dict) -> int:
    clave = clave[:255]
    cur.execute("SELECT id, clave FROM hilos WHERE clave=%s", (clave,))
    row = cur.fetchone()
    if row:
        return int(row["id"])
    titulo = _titulo_group([carta])
    esp = (carta.get("especialidad_norm") or "SIN ESPECIALIDAD")[:120]
    cur.execute(
        """
        INSERT INTO hilos (clave, titulo, especialidad_norm, estado, n_cartas)
        VALUES (%s, %s, %s, 'abierto', 0)
        ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
        """,
        (clave, titulo[:255], esp),
    )
    return int(cur.lastrowid)


def assign_carta_hilo(conn, carta_id: int, carta: dict, doc_map: dict[str, int] | None = None, commit: bool = True) -> dict:
    """
    Vincula la carta a un hilo persistente (FK hilo_id), estilo conversación Outlook.
    Prioridad: hilo_id explícito > antecedentes citados > clave CONSULTA:N > documento raíz.
    """
    blob = " ".join(
        [
            str(carta.get("referencia") or ""),
            str(carta.get("referencias") or ""),
            str(carta.get("asunto") or ""),
            str(carta.get("observacion") or ""),
        ]
    )
    cited = set(extract_cited_docs(blob))
    if carta.get("referencia"):
        ref_norm = normalize_doc_key(carta.get("referencia"))
        if ref_norm:
            cited.add(ref_norm)
        cited.add(str(carta.get("referencia")).strip().upper())
        cited.add(str(carta.get("referencia")).strip())
    carta_clave = canonical_tramite_clave(carta)

    with conn.cursor() as cur:
        _ensure_hilos_table(cur)
        cited_hilos = _hilo_ids_from_cited_docs(cur, cited, doc_map=doc_map)
        cur.execute("SELECT hilo_id FROM cartas WHERE id=%s", (carta_id,))
        own = cur.fetchone()
        existing = int(own["hilo_id"]) if own and own.get("hilo_id") else None

        target: int | None = None
        merged = 0

        if cited_hilos:
            target = min(cited_hilos)
            rest = cited_hilos - {target}
            if existing and existing not in cited_hilos:
                rest.add(existing)
            if rest:
                _merge_hilos(cur, target, rest)
                merged = len(rest)
                if doc_map is not None:
                    for k, v in list(doc_map.items()):
                        if v in rest:
                            doc_map[k] = target
        elif carta.get("hilo_id"):
            target = int(carta.get("hilo_id"))
        elif existing:
            target = existing
        elif carta_clave:
            target = _get_or_create_hilo(cur, carta_clave, carta)
        else:
            root = f"DOC:{normalize_doc_key(carta.get('n_documento'))}"[:255]
            if root and root != "DOC:":
                target = _get_or_create_hilo(cur, root, carta)

        if target is None:
            if commit:
                conn.commit()
            return {"ok": True, "hilo_id": None, "reason": "sin_vinculo"}

        if carta_clave:
            cur.execute("SELECT clave FROM hilos WHERE id=%s", (target,))
            hrow = cur.fetchone()
            if hrow and hrow.get("clave", "").startswith("DOC:") and carta_clave:
                try:
                    cur.execute(
                        "UPDATE hilos SET clave=%s, titulo=%s WHERE id=%s",
                        (carta_clave, _titulo_group([carta])[:255], target),
                    )
                except Exception:
                    pass

        cur.execute("UPDATE cartas SET hilo_id=%s WHERE id=%s", (target, carta_id))
        cur.execute("SELECT clave, titulo FROM hilos WHERE id=%s", (target,))
        meta = cur.fetchone() or {}
    if commit:
        conn.commit()
    return {
        "ok": True,
        "hilo_id": target,
        "clave": meta.get("clave"),
        "titulo": meta.get("titulo"),
        "merged_hilos": merged,
        "via": "citas" if cited_hilos else ("consulta" if carta_clave else "documento"),
    }


def build_groups_from_fk(cartas: list[dict]) -> list[dict]:
    """Agrupa cartas por hilo_id (FK). No mezcla hilos distintos."""
    from collections import defaultdict

    by_hilo: dict[int, list[dict]] = defaultdict(list)
    orphans: list[dict] = []
    for c in cartas:
        hid = c.get("hilo_id")
        if hid is not None:
            by_hilo[int(hid)].append(c)
        else:
            orphans.append(c)

    groups: list[dict] = []
    for hid, items in by_hilo.items():
        g = _summarize_group(items, stable=True)
        g["hilo_id"] = hid
        groups.append(g)

    for c in orphans:
        g = _summarize_group([c], stable=True)
        g["hilo_id"] = None
        groups.append(g)

    groups.sort(key=lambda g: (0 if g["abierto"] else 1, -(g.get("dias") or 0), g["titulo"]))
    return groups


def _summarize_group(items: list[dict], today: date | None = None, stable: bool = False) -> dict:
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
    if stable:
        clave = _stable_clave_for_items(items)[:255]
    else:
        clave_parts = []
        for c in items:
            clave_parts.extend(extract_tramite_keys(c))
        base = clave_parts[0] if clave_parts else f"DOC:{normalize_doc_key(items[0].get('n_documento'))}"
        id_bits = sorted(
            str(c.get("id") or normalize_doc_key(c.get("n_documento")) or i)
            for i, c in enumerate(items)
        )
        suffix = hashlib.md5("|".join(id_bits).encode("utf-8")).hexdigest()[:10]
        clave = f"{base}|{suffix}"[:255]

    return {
        "clave": clave,
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


def sync_hilos_metadata(conn, cartas: list[dict] | None = None) -> dict:
    """Sincroniza metadatos de hilos respetando FK hilo_id (no borra vínculos)."""
    with conn.cursor() as cur:
        _ensure_hilos_table(cur)
        if cartas is None:
            cartas = _fetch_all_cartas(cur)

        cur.execute("SELECT id, n_documento, hilo_id FROM cartas WHERE hilo_id IS NOT NULL")
        doc_map = {}
        for r in cur.fetchall():
            hid = r.get("hilo_id")
            if hid is not None:
                doc_map[normalize_doc_key(r.get("n_documento"))] = int(hid)
                doc_map[str(r.get("n_documento") or "").strip().upper()] = int(hid)

        for c in cartas:
            cid = c.get("id")
            if cid is None or c.get("hilo_id"):
                continue
            res = assign_carta_hilo(conn, int(cid), c, doc_map=doc_map, commit=False)
            if res.get("hilo_id"):
                hid = int(res["hilo_id"])
                doc_map[normalize_doc_key(c.get("n_documento"))] = hid
                doc_map[str(c.get("n_documento") or "").strip().upper()] = hid

        cartas = _fetch_all_cartas(cur)
        groups = build_groups_from_fk(cartas)
        hilo_ids_seen: set[int] = set()
        abiertos = cerrados = 0
        update_params = []

        for g in groups:
            hid = g.get("hilo_id")
            if hid is None:
                continue
            hilo_ids_seen.add(int(hid))
            update_params.append(
                (
                    g["clave"][:255],
                    g["titulo"][:255],
                    g["especialidad_norm"],
                    g["estado"],
                    g["fecha_inicio"],
                    g["fecha_cierre"],
                    g["dias_congelados"],
                    g["n_cartas"],
                    hid,
                )
            )
            if g["abierto"]:
                abiertos += 1
            else:
                cerrados += 1

        if update_params:
            cur.executemany(
                """
                UPDATE hilos SET
                    clave=%s, titulo=%s, especialidad_norm=%s, estado=%s,
                    fecha_inicio=%s, fecha_cierre=%s, dias_congelados=%s, n_cartas=%s
                WHERE id=%s
                """,
                update_params,
            )

def rebuild_hilos_fast(conn) -> dict:
    """Reconstruye todos los hilos desde cero en memoria con Union-Find en < 0.5s."""
    with conn.cursor() as cur:
        _ensure_hilos_table(cur)
        cur.execute("SELECT id, n_documento, tipo_documento, asunto, observacion, referencia, referencias, especialidad_norm, estado, estado_norm, fecha FROM cartas")
        cartas = cur.fetchall()
        if not cartas:
            return {"ok": True, "hilos": 0, "abiertos": 0, "cerrados": 0}

        parent = {c["id"]: c["id"] for c in cartas}
        def find(i):
            path = []
            while parent[i] != i:
                path.append(i)
                i = parent[i]
            for node in path:
                parent[node] = i
            return i

        def union(i, j):
            root_i, root_j = find(i), find(j)
            if root_i != root_j:
                if root_i < root_j:
                    parent[root_j] = root_i
                else:
                    parent[root_i] = root_j

        doc_to_id = {}
        tramite_to_id = {}
        for c in cartas:
            cid = c["id"]
            d_norm = normalize_doc_key(c.get("n_documento"))
            if d_norm:
                doc_to_id[d_norm] = cid
            raw_doc = str(c.get("n_documento") or "").strip().upper()
            if raw_doc:
                doc_to_id[raw_doc] = cid
            t_clave = canonical_tramite_clave(c)
            if t_clave:
                if t_clave in tramite_to_id:
                    union(cid, tramite_to_id[t_clave])
                else:
                    tramite_to_id[t_clave] = cid

        for c in cartas:
            cid = c["id"]
            blob = " ".join([
                str(c.get("referencia") or ""),
                str(c.get("referencias") or ""),
                str(c.get("asunto") or ""),
                str(c.get("observacion") or ""),
            ])
            cited = set(extract_cited_docs(blob))
            if c.get("referencia"):
                ref_k = normalize_doc_key(c.get("referencia"))
                if ref_k:
                    cited.add(ref_k)
                cited.add(str(c.get("referencia")).strip().upper())
            for ck in cited:
                target_id = doc_to_id.get(ck)
                if target_id and target_id != cid:
                    union(cid, target_id)

        from collections import defaultdict
        groups_map = defaultdict(list)
        for c in cartas:
            groups_map[find(c["id"])].append(c)

        cur.execute("SET FOREIGN_KEY_CHECKS=0")
        cur.execute("UPDATE cartas SET hilo_id=NULL")
        cur.execute("DELETE FROM hilos")
        cur.execute("ALTER TABLE hilos AUTO_INCREMENT = 1")
        summarized = []
        used_claves = set()
        auto_closed_cids = []
        for root_id, items in groups_map.items():
            if len(items) > 1:
                # Ordenar cronológicamente para identificar la última carta vs intermedias
                items.sort(key=lambda x: (x.get("fecha") is None, x.get("fecha") or date.min, x.get("id") or 0))
                # Solo cerrar intermedias si la última carta del hilo tiene estado definitivo
                last_est = normalize_estado(items[-1].get("estado_norm") or items[-1].get("estado"))
                hilo_concluded = not is_estado_abierto(last_est)
                if hilo_concluded:
                    for c in items[:-1]:
                        if is_estado_abierto(c.get("estado_norm") or c.get("estado")):
                            c["estado"] = "CERRADO"
                            c["estado_norm"] = "CERRADO"
                            auto_closed_cids.append(c["id"])

            g = _summarize_group(items, stable=True)
            base_clave = g["clave"][:200]
            clave = base_clave
            counter = 2
            norm_k = re.sub(r"[^A-Z0-9]+", "_", clave.upper()).strip("_")
            while norm_k in used_claves:
                clave = f"{base_clave}#{counter}"
                norm_k = re.sub(r"[^A-Z0-9]+", "_", clave.upper()).strip("_")
                counter += 1
            used_claves.add(norm_k)
            g["clave"] = clave
            summarized.append((g, items))

        # Bulk insert all hilos in batches
        hilo_insert_tuples = []
        for g, items in summarized:
            hilo_insert_tuples.append((
                g["clave"][:255],
                g["titulo"][:255] if g["titulo"] else None,
                g["especialidad_norm"],
                g["estado"],
                g["fecha_inicio"],
                g["fecha_cierre"],
                g["dias_congelados"],
                g["n_cartas"],
            ))

        for i in range(0, len(hilo_insert_tuples), 500):
            batch = hilo_insert_tuples[i:i+500]
            cur.executemany(
                """
                INSERT INTO hilos (clave, titulo, especialidad_norm, estado, fecha_inicio, fecha_cierre, dias_congelados, n_cartas)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                batch,
            )

        cur.execute("SELECT id, clave FROM hilos")
        clave_to_hid = {r["clave"]: r["id"] for r in cur.fetchall()}

        update_cartas = []
        for g, items in summarized:
            hid = clave_to_hid.get(g["clave"])
            if hid:
                g["hilo_id"] = hid
                for c in items:
                    update_cartas.append((hid, c["id"]))

        for i in range(0, len(update_cartas), 300):
            chunk = update_cartas[i:i+300]
            cids = [str(cid) for hid, cid in chunk]
            cases = " ".join(f"WHEN {cid} THEN {hid}" for hid, cid in chunk)
            cur.execute(f"UPDATE cartas SET hilo_id = CASE id {cases} END WHERE id IN ({','.join(cids)})")

        if auto_closed_cids:
            for i in range(0, len(auto_closed_cids), 500):
                batch = auto_closed_cids[i:i+500]
                placeholders = ", ".join(["%s"] * len(batch))
                cur.execute(
                    f"UPDATE cartas SET estado='CERRADO', estado_norm='CERRADO', actualizado_en=NOW() WHERE id IN ({placeholders})",
                    batch,
                )

        cur.execute("SET FOREIGN_KEY_CHECKS=1")
    conn.commit()

    abiertos = sum(1 for g, _ in summarized if g["abierto"])
    cerrados = len(summarized) - abiertos
    return {
        "ok": True,
        "hilos": len(summarized),
        "abiertos": abiertos,
        "cerrados": cerrados,
        "auto_closed_intermediate": len(auto_closed_cids),
        "mode": "fast_union_find",
    }


def auto_close_intermediate_hilo_cartas(conn) -> dict:
    """Cierra cartas intermedias de un hilo que hayan sido sucedidas por cartas posteriores."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, n_documento, fecha, estado, estado_norm, hilo_id 
            FROM cartas 
            WHERE hilo_id IS NOT NULL 
            ORDER BY hilo_id ASC, fecha IS NULL, fecha ASC, id ASC
            """
        )
        rows = cur.fetchall()

    from collections import defaultdict
    threads = defaultdict(list)
    for r in rows:
        threads[r["hilo_id"]].append(r)

    cids_to_close = []
    for hid, items in threads.items():
        if len(items) <= 1:
            continue
        # Solo cerrar intermedias si la última carta tiene estado definitivo
        last_est = normalize_estado(items[-1].get("estado_norm") or items[-1].get("estado"))
        if is_estado_abierto(last_est):
            continue  # Hilo aún activo, no cerrar intermedias
        for c in items[:-1]:
            if is_estado_abierto(c.get("estado_norm") or c.get("estado")):
                cids_to_close.append(c["id"])

    updated = 0
    if cids_to_close:
        with conn.cursor() as cur:
            for i in range(0, len(cids_to_close), 500):
                batch = cids_to_close[i:i+500]
                placeholders = ", ".join(["%s"] * len(batch))
                cur.execute(
                    f"UPDATE cartas SET estado='CERRADO', estado_norm='CERRADO', actualizado_en=NOW() WHERE id IN ({placeholders})",
                    batch,
                )
                updated += cur.rowcount
        conn.commit()

    return {"ok": True, "closed_intermediate": updated}


def persist_hilos(conn, cartas: list[dict]) -> dict:
    """Reconstruye hilos usando fast_union_find."""
    return rebuild_hilos_fast(conn)


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
    groups = build_groups_from_fk(cartas)
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


def is_respuesta_emitida(nueva: dict) -> bool:
    """Carta emitida RO/RL que cita antecedentes = respuesta operativa."""
    sentido = (nueva.get("sentido") or "").strip().lower()
    if not sentido:
        ban = (nueva.get("bandeja") or "").strip()
        sentido = "recibida" if ban.startswith("recibida") else "emitida"
    if sentido != "emitida":
        return False
    ban = (nueva.get("bandeja") or "").strip()
    if ban not in ("residente", "rl"):
        return False
    cited = extract_cited_docs(
        " ".join([str(nueva.get("referencias") or ""), str(nueva.get("asunto") or "")])
    )
    return bool(cited)


def _fetch_all_cartas(cur) -> list[dict]:
    cur.execute(f"SELECT {HILOS_CARTAS_COLS} FROM cartas")
    out = []
    for r in cur.fetchall():
        d = dict(r) if not isinstance(r, dict) else dict(r)
        for k, v in list(d.items()):
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        out.append(d)
    return out


def _merge_nueva_en_cartas(cartas: list[dict], nueva: dict) -> list[dict]:
    nid = nueva.get("id")
    merged: list[dict] = []
    found = False
    for c in cartas:
        if nid is not None and c.get("id") == nid:
            merged.append({**c, **nueva})
            found = True
        else:
            merged.append(c)
    if not found and nid is not None:
        merged.append(dict(nueva))
    return merged


def _groups_for_cierre(cartas: list[dict], nueva_id: int | None, cited: set[str]) -> list[dict]:
    groups = build_groups_from_fk(cartas)
    matched: list[dict] = []
    seen: set[tuple] = set()
    for g in groups:
        ids = sorted(g.get("carta_ids") or [])
        gkey = tuple(ids)
        if gkey in seen:
            continue
        hit = bool(nueva_id is not None and nueva_id in ids)
        if not hit and cited:
            for c in cartas:
                if c.get("id") not in ids:
                    continue
                if normalize_doc_key(c.get("n_documento")) in cited:
                    hit = True
                    break
        if hit:
            matched.append(g)
            seen.add(gkey)
    return matched


def _close_open_cartas_ids(conn, ids_to_close: set[int], skip_id: int | None = None) -> tuple[int, list]:
    closed = 0
    samples: list[dict] = []
    with conn.cursor() as cur:
        for cid in ids_to_close:
            if skip_id is not None and cid == skip_id:
                continue
            cur.execute(
                "SELECT id, n_documento, estado, estado_norm FROM cartas WHERE id=%s",
                (cid,),
            )
            r = cur.fetchone()
            if not r:
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
                ("CERRADO", "CERRADO", cid),
            )
            if cur.rowcount:
                closed += cur.rowcount
                if len(samples) < 10:
                    samples.append({"id": cid, "n_documento": r.get("n_documento")})
    return closed, samples


def _close_cited_open_cartas(conn, cited: set[str], skip_id: int | None = None) -> dict:
    if not cited:
        return {"ok": True, "closed": 0, "reason": "sin_citas"}
    closed = 0
    samples: list[dict] = []
    with conn.cursor() as cur:
        cur.execute("SELECT id, n_documento, estado, estado_norm FROM cartas")
        for r in cur.fetchall():
            if normalize_doc_key(r["n_documento"]) not in cited:
                continue
            cid = r["id"]
            if skip_id is not None and cid == skip_id:
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
                ("CERRADO", "CERRADO", cid),
            )
            if cur.rowcount:
                closed += cur.rowcount
                if len(samples) < 10:
                    samples.append({"id": cid, "n_documento": r.get("n_documento")})
    if closed:
        conn.commit()
    return {"ok": True, "closed": closed, "mode": "citas", "samples": samples}


def _close_hilo_on_cierre(conn, nueva: dict, cited: set[str]) -> dict:
    """Cierra todas las cartas abiertas del hilo FK o del grupo vinculado."""
    nueva_id = nueva.get("id")
    hilo_id = nueva.get("hilo_id")
    ids: set[int] = set()
    titulos: list[str] = []

    if hilo_id:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cartas WHERE hilo_id=%s", (int(hilo_id),))
            ids = {int(r["id"]) for r in cur.fetchall()}
            cur.execute("SELECT titulo FROM hilos WHERE id=%s", (int(hilo_id),))
            trow = cur.fetchone()
            if trow and trow.get("titulo"):
                titulos.append(str(trow["titulo"])[:80])

    if len(ids) < 2:
        with conn.cursor() as cur:
            cartas = _merge_nueva_en_cartas(_fetch_all_cartas(cur), nueva)
        groups = _groups_for_cierre(cartas, nueva_id, cited)
        for g in groups:
            if (g.get("n_cartas") or 0) < 2:
                continue
            for cid in g.get("carta_ids") or []:
                if cid is not None:
                    ids.add(int(cid))
            t = g.get("titulo")
            if t and t not in titulos:
                titulos.append(str(t)[:80])

    if len(ids) < 2:
        return {"ok": True, "closed": 0, "mode": "hilo", "reason": "hilo_unitario"}

    closed, samples = _close_open_cartas_ids(conn, ids, skip_id=nueva_id)
    if closed:
        conn.commit()
    return {
        "ok": True,
        "closed": closed,
        "mode": "hilo",
        "hilo_cartas": len(ids),
        "hilo_titulos": titulos[:3],
        "samples": samples,
    }


def try_close_referenced_cartas(conn, nueva: dict | str, cerrar: bool = True) -> dict:
    """Cierra antecedentes citados; si es cierre de trámite, cierra todo el hilo vinculado."""
    if isinstance(nueva, str):
        nueva = {"referencia": nueva, "estado": "CERRADO", "estado_norm": "CERRADO"}
    elif not isinstance(nueva, dict):
        return {"ok": True, "closed": 0}
    has_ref = bool(nueva.get("referencia") or nueva.get("referencias"))
    if not cerrar and not has_ref:
        return {"ok": True, "closed": 0}
    est = normalize_estado(nueva.get("estado_norm") or nueva.get("estado"))
    is_cierre = est in (
        "CERRADO",
        "ABSUELTO SUPERVISION",
        "ABSUELTO ENTIDAD",
        "ABSUELTA POR SUPERVISOR",
        "ABSUELTA POR ENTIDAD",
        "PARA CONOCIMIENTO",
    )
    is_response = is_respuesta_emitida(nueva)

    blob = " ".join([
        str(nueva.get("referencia") or ""),
        str(nueva.get("referencias") or ""),
        str(nueva.get("asunto") or ""),
        str(nueva.get("observacion") or "")
    ])
    cited = set(extract_cited_docs(blob))
    if nueva.get("referencia"):
        ref_norm = normalize_doc_key(nueva.get("referencia"))
        if ref_norm:
            cited.add(ref_norm)
        cited.add(str(nueva.get("referencia")).strip().upper())
        cited.add(str(nueva.get("referencia")).strip())

    if is_cierre or is_response or cerrar:
        direct_closed = 0
        samples: list[dict] = []
        target_close_state = "ABSUELTA POR SUPERVISOR" if ("SUPERVIS" in est or "SUP" in est) else ("ABSUELTA POR ENTIDAD" if ("ENTIDAD" in est or "PRONIS" in est) else "CERRADO")

        with conn.cursor() as cur:
            cur.execute("SELECT id, n_documento, estado, estado_norm FROM cartas WHERE id != %s", (nueva.get("id") or 0,))
            for r in cur.fetchall():
                doc_k = normalize_doc_key(r["n_documento"])
                raw_k = str(r["n_documento"] or "").strip().upper()
                is_match = doc_k in cited or raw_k in cited or r["n_documento"] == nueva.get("referencia")
                if is_match:
                    est_r = normalize_estado(r.get("estado_norm") or r.get("estado"))
                    if is_estado_abierto(est_r):
                        cur.execute(
                            "UPDATE cartas SET estado=%s, estado_norm=%s, actualizado_en=NOW() WHERE id=%s",
                            (target_close_state, target_close_state, r["id"])
                        )
                        if cur.rowcount:
                            direct_closed += cur.rowcount
                            samples.append({"id": r["id"], "n_documento": r["n_documento"]})
        if direct_closed:
            conn.commit()

        # If hilo is linked, close open sibling cartas in the same hilo
        hilo_result = _close_hilo_on_cierre(conn, nueva, cited)
        if hilo_result.get("closed", 0) > 0 or direct_closed > 0:
            hilo_result["closed"] = hilo_result.get("closed", 0) + direct_closed
            hilo_result["samples"] = hilo_result.get("samples", []) + samples
            return hilo_result

        cited_result = _close_cited_open_cartas(conn, cited, skip_id=nueva.get("id"))
        if cited_result.get("closed", 0) > 0:
            return cited_result
        return hilo_result if hilo_result.get("hilo_cartas", 0) >= 2 else cited_result

    if not cerrar and not is_cierre:
        return {"ok": True, "closed": 0, "reason": "cerrar_desactivado"}

    return _close_cited_open_cartas(conn, cited, skip_id=nueva.get("id"))
