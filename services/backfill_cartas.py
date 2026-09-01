# -*- coding: utf-8 -*-
"""Backfill de referencia operativa y especialista responsable (area) en cartas históricas."""
from __future__ import annotations

import re
from typing import Any

from core.normalizers import split_especialidades, ESP_TO_ESPECIALISTA

# Especialidad técnica → responsable interno canónico (equipo de Residencia)
ESP_TO_AREA: dict[str, str] = ESP_TO_ESPECIALISTA

# Etiquetas legacy del Excel en columna area → responsable canónico
_AREA_LEGACY_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bESTR|\bEST\.", re.I), "ESPECIALISTA ESTRUCTURAS"),
    (re.compile(r"\bARQ", re.I), "ESPECIALISTA ARQUITECTURA"),
    (re.compile(r"\bIISS|\bSANITAR", re.I), "ESPECIALISTA SANITARIAS"),
    (re.compile(r"\bIIEE|\bELECT", re.I), "ESPECIALISTA ELECTRICAS"),
    (re.compile(r"\bGEOT", re.I), "ESPECIALISTA GEOTECNIA"),
    (re.compile(r"\bSSOMA|\bCAL\b|\bCALIDAD", re.I), "SSOMA / CALIDAD"),
    (re.compile(r"\bBIM\b", re.I), "ESPECIALISTA BIM"),
    (re.compile(r"\bMECAN|\bEQUIP", re.I), "EQUIPAMIENTO"),
    (re.compile(r"\bCOSTOS", re.I), "ESPECIALISTA COSTOS"),
    (re.compile(r"\bADM|\bCONTRAT", re.I), "ESPECIALISTA ADM. CONTRATOS"),
    (re.compile(r"\bCOMUNIC", re.I), "ESPECIALISTA COMUNICACIONES"),
    (re.compile(r"\bPRODUC", re.I), "ESPECIALISTA PRODUCCION"),
    (re.compile(r"\bM\.?\s*AMB|\bAMBIENT", re.I), "ESPECIALISTA MEDIO AMBIENTE"),
    (re.compile(r"\bTOPO", re.I), "ESPECIALISTA TOPOGRAFIA"),
    (re.compile(r"\bRO\b|\bRESID", re.I), "RESIDENCIA"),
    (re.compile(r"\bOT\b|\bOFICINA", re.I), "OFICINA TECNICA"),
]

_CANONICAL_AREAS = frozenset(
    {
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
    }
)

_INFORME_RE = re.compile(r"\bINFORME\s*N[°º.]?\s*0*(\d+)", re.I)
_CARTA_RE = re.compile(r"\bCARTA\s*N[°º.]?\s*0*(\d+)", re.I)

_SKIP_ESP_TOKENS = frozenset(
    {"RO", "RL", "SUP", "PRONIS", "MUNI", "OTRO", "RESIDENTE", "RESIDENCIA", "MIXTA"}
)


def _cartas_especialidades(c: dict) -> list[str]:
    return [
        e
        for e in split_especialidades(c.get("especialidad"), c.get("especialidad_norm"))
        if e not in _SKIP_ESP_TOKENS and e != "SIN ESPECIALIDAD"
    ]


def _primary_especialidad(c: dict) -> str:
    esps = _cartas_especialidades(c)
    return esps[0] if esps else ""


def _area_from_legacy_label(area_raw: str) -> str | None:
    if not area_raw:
        return None
    upper = area_raw.strip().upper()
    if upper in _CANONICAL_AREAS:
        return upper
    for pat, target in _AREA_LEGACY_PATTERNS:
        if pat.search(area_raw):
            return target
    return None


def resolve_canonical_area(c: dict) -> str:
    """Responsable interno canónico para cartas recibidas."""
    ban = (c.get("bandeja") or "").strip()
    if not ban.startswith("recibida"):
        return (c.get("area") or "").strip()

    legacy = _area_from_legacy_label((c.get("area") or "").strip())
    if legacy and legacy != "OFICINA TECNICA":
        return legacy

    esps = _cartas_especialidades(c)
    if not esps:
        return "RESIDENCIA"
    if len(esps) == 1:
        return ESP_TO_AREA.get(esps[0], "OFICINA TECNICA")

    mapped = [ESP_TO_AREA.get(e, "OFICINA TECNICA") for e in esps]
    unique = {m for m in mapped if m}
    if len(unique) == 1:
        return next(iter(unique))
    # Multi-especialidad: priorizar especialista del primer tema reconocible
    for e in esps:
        target = ESP_TO_AREA.get(e)
        if target and target != "OFICINA TECNICA":
            return target
    return "OFICINA TECNICA"


def infer_referencia(c: dict) -> str | None:
    """Etiqueta corta buscable; None si ya existe o no se puede inferir."""
    if (c.get("referencia") or "").strip():
        return None
    doc = (c.get("n_documento") or "").strip()
    if not doc:
        return None
    esp = _primary_especialidad(c)
    m = _INFORME_RE.search(doc)
    if m:
        num = int(m.group(1))
        return f"Informe {num} de {esp}" if esp else f"Informe {num}"
    mc = _CARTA_RE.search(doc)
    if mc:
        num = int(mc.group(1))
        return f"Carta {num} de {esp}" if esp else f"Carta {num}"
    return None


def infer_area_responsable(c: dict) -> str | None:
    """Especialista interno para recibidas sin area; None si no aplica o ya tiene."""
    ban = (c.get("bandeja") or "").strip()
    if not ban.startswith("recibida"):
        return None
    if (c.get("area") or "").strip():
        return None
    return resolve_canonical_area(c)


def fix_areas_responsables(conn, dry_run: bool = False) -> dict[str, Any]:
    """Normaliza area en recibidas: OFICINA TECNICA genérico y etiquetas legacy del Excel."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM cartas WHERE bandeja LIKE %s ORDER BY id",
            ("recibida%",),
        )
        rows = cur.fetchall()

    stats: dict[str, Any] = {
        "ok": True,
        "dry_run": dry_run,
        "checked": len(rows),
        "areas_fixed": 0,
        "oficina_tecnica_before": 0,
        "oficina_tecnica_after": 0,
        "by_target": {},
        "samples": [],
    }

    pending_after = 0
    for row in rows:
        current = (row.get("area") or "").strip()
        if current.upper() == "OFICINA TECNICA":
            stats["oficina_tecnica_before"] += 1

        canonical = resolve_canonical_area(row)
        if current.upper() == canonical.upper():
            if canonical.upper() == "OFICINA TECNICA":
                pending_after += 1
            continue

        stats["areas_fixed"] += 1
        stats["by_target"][canonical] = stats["by_target"].get(canonical, 0) + 1

        if len(stats["samples"]) < 15:
            stats["samples"].append(
                {
                    "id": row["id"],
                    "n_documento": row.get("n_documento"),
                    "especialidad": row.get("especialidad"),
                    "estado_norm": row.get("estado_norm"),
                    "area_before": current or "—",
                    "area_after": canonical,
                }
            )

        if dry_run:
            if canonical.upper() == "OFICINA TECNICA":
                pending_after += 1
            continue

        with conn.cursor() as cur:
            cur.execute("UPDATE cartas SET area=%s WHERE id=%s", (canonical, row["id"]))

    if not dry_run:
        conn.commit()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) c FROM cartas WHERE bandeja LIKE %s AND UPPER(TRIM(area))=%s",
                ("recibida%", "OFICINA TECNICA"),
            )
            stats["oficina_tecnica_after"] = cur.fetchone()["c"]
    else:
        stats["oficina_tecnica_after"] = (
            stats["oficina_tecnica_before"]
            - sum(
                1
                for s in stats["samples"]
                if s["area_before"].upper() == "OFICINA TECNICA"
                and s["area_after"].upper() != "OFICINA TECNICA"
            )
            # approx for dry-run display only
        )
        pending_after = stats["oficina_tecnica_before"]  # conservative

    stats["oficina_tecnica_remaining"] = pending_after if dry_run else stats["oficina_tecnica_after"]
    return stats


def backfill_cartas(
    conn,
    dry_run: bool = False,
    fill_missing: bool = True,
    fix_areas: bool = False,
) -> dict[str, Any]:
    """Completa referencia/area faltantes y opcionalmente normaliza responsables."""
    result: dict[str, Any] = {
        "ok": True,
        "dry_run": dry_run,
        "fill_missing": fill_missing,
        "fix_areas": fix_areas,
    }

    if fill_missing:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cartas ORDER BY id")
            rows = cur.fetchall()
        conn.commit()

        fill_stats: dict[str, Any] = {
            "total": len(rows),
            "referencia_updated": 0,
            "area_updated": 0,
            "unchanged": 0,
            "samples": [],
        }

        update_batch = []
        for row in rows:
            cid = row["id"]
            new_ref = infer_referencia(row)
            new_area = infer_area_responsable(row)
            if not new_ref and not new_area:
                fill_stats["unchanged"] += 1
                continue

            updates: dict[str, str] = {}
            if new_ref:
                updates["referencia"] = new_ref
                fill_stats["referencia_updated"] += 1
            if new_area:
                updates["area"] = new_area
                fill_stats["area_updated"] += 1

            if len(fill_stats["samples"]) < 12:
                fill_stats["samples"].append(
                    {
                        "id": cid,
                        "n_documento": row.get("n_documento"),
                        "bandeja": row.get("bandeja"),
                        **updates,
                    }
                )

            if not dry_run and updates:
                update_batch.append((updates, cid))

        if not dry_run and update_batch:
            with conn.cursor() as cur:
                for updates, cid in update_batch:
                    sets = ", ".join(f"{k}=%s" for k in updates)
                    vals = list(updates.values()) + [cid]
                    cur.execute(f"UPDATE cartas SET {sets} WHERE id=%s", vals)
            conn.commit()
        result["fill"] = fill_stats

    if fix_areas:
        result["areas"] = fix_areas_responsables(conn, dry_run=dry_run)

    return result


def main():
    import argparse
    import os

    import pymysql
    from pymysql.cursors import DictCursor

    parser = argparse.ArgumentParser(description="Backfill referencia y area en cartas")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar cambios, sin escribir")
    parser.add_argument(
        "--fix-areas-only",
        action="store_true",
        help="Solo normalizar responsables (OFICINA TECNICA / legacy)",
    )
    args = parser.parse_args()

    mysql_ssl = os.environ.get("MYSQL_SSL", "0") in ("1", "true", "True", "yes", "REQUIRED")
    kwargs = {
        "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MYSQL_PORT", "3307")),
        "user": os.environ.get("MYSQL_USER", "greace"),
        "password": os.environ.get("MYSQL_PASSWORD", "greace_pass_change_me"),
        "database": os.environ.get("MYSQL_DATABASE", "sistemagreace"),
        "charset": "utf8mb4",
        "cursorclass": DictCursor,
    }
    if mysql_ssl:
        kwargs["ssl"] = {"check_hostname": False}
    conn = pymysql.connect(**kwargs)
    try:
        result = backfill_cartas(
            conn,
            dry_run=args.dry_run,
            fill_missing=not args.fix_areas_only,
            fix_areas=True,
        )
        mode = "DRY-RUN" if args.dry_run else "APLICADO"
        print(f"[{mode}]")
        if result.get("fill"):
            f = result["fill"]
            print(f"  referencia: {f.get('referencia_updated', 0)}")
            print(f"  area nueva: {f.get('area_updated', 0)}")
        if result.get("areas"):
            a = result["areas"]
            print(f"  areas corregidas: {a.get('areas_fixed', 0)}")
            print(f"  OFICINA TECNICA restante: {a.get('oficina_tecnica_remaining', 0)}")
            if a.get("by_target"):
                print("  por destino:", a["by_target"])
    finally:
        conn.close()


if __name__ == "__main__":
    main()
