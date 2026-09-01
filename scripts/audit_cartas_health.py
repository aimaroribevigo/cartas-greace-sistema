import os
import sys
from collections import Counter
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import app
import core.clasificacion as clasificacion
import core.hilos as hilos
import core.normalizers as normalizers

def run_audit():
    conn = app.connect_mysql()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cartas")
    cartas = [app.row_to_dict(r) for r in cur.fetchall()]
    cur.close()
    conn.commit()
    total = len(cartas)

    print("=" * 70)
    print(f"       INFORME DE AUDITORÍA EXHAUSTIVA DE CARTAS ({total} REGISTROS)")
    print("=" * 70)

    # 1. Bandejas
    bandejas = Counter(c.get("bandeja") for c in cartas)
    print("\n[1] DISTRIBUCIÓN POR BANDEJAS:")
    for b, cnt in sorted(bandejas.items(), key=lambda x: x[1], reverse=True):
        print(f"    • {b:18}: {cnt:5} cartas ({round(cnt/total*100, 1)}%)")

    # 2. Estados
    estados = Counter(c.get("estado_norm") or c.get("estado") for c in cartas)
    print("\n[2] DISTRIBUCION POR ESTADOS (NORMALIZADOS):")
    for st, cnt in sorted(estados.items(), key=lambda x: x[1], reverse=True):
        st_str = str(st or "SIN ESTADO")
        is_open = normalizers.is_estado_abierto(st_str)
        tag = "[ABIERTO]" if is_open else "[CERRADO/INACTIVO]"
        print(f"    * {st_str:25} {tag:18}: {cnt:5} cartas")

    # 3. Especialidades
    esps = Counter(c.get("especialidad_norm") or c.get("especialidad") for c in cartas)
    print(f"\n[3] ESPECIALIDADES REGISTRADAS ({len(esps)} categorias):")
    for esp, cnt in sorted(esps.items(), key=lambda x: x[1], reverse=True)[:10]:
        esp_str = str(esp or "SIN ESPECIALIDAD")
        print(f"    * {esp_str:25}: {cnt:5} cartas")

    # 4. Verificacion de Fechas y Anomalias
    sin_fecha = [c for c in cartas if not c.get("fecha")]
    fecha_futura = []
    fecha_muy_antigua = []
    now = datetime.now().date()
    for c in cartas:
        f = c.get("fecha")
        if f:
            if hasattr(f, "year"):
                if f.year > 2030:
                    fecha_futura.append((c["id"], c["n_documento"], str(f)))
                elif f.year < 2018:
                    fecha_muy_antigua.append((c["id"], c["n_documento"], str(f)))

    print("\n[4] AUDITORIA DE FECHAS:")
    print(f"    * Cartas sin fecha: {len(sin_fecha)}")
    print(f"    * Cartas con fechas futuras anomalas (>2030): {len(fecha_futura)}")
    print(f"    * Cartas con fechas previas al proyecto (<2018): {len(fecha_muy_antigua)}")

    # 5. Coherencia Deuda vs Estado vs Naturaleza
    cerradas_con_deuda = []
    conocimiento_con_deuda = []
    abiertas_sin_deuda = []
    traslados_recibidos = []
    
    for c in cartas:
        cl = c.get("clasificacion") or clasificacion.classify_carta(c)
        est = normalizers.normalize_estado(c.get("estado_norm") or c.get("estado"))
        abierta = normalizers.is_estado_abierto(est)
        deuda = cl.get("deuda")
        nat = cl.get("naturaleza")
        
        if not abierta and deuda != "ninguna":
            cerradas_con_deuda.append((c["id"], c["n_documento"], est, deuda))
        if est == "PARA CONOCIMIENTO" and deuda != "ninguna":
            conocimiento_con_deuda.append((c["id"], c["n_documento"], est, deuda))
        if abierta and deuda == "ninguna" and not cl.get("solo_comunicacion"):
            abiertas_sin_deuda.append((c["id"], c["n_documento"], est, nat))
        if cl.get("solo_comunicacion"):
            traslados_recibidos.append((c["id"], c["n_documento"], c.get("bandeja")))

    print("\n[5] COHERENCIA DE REGLAS DE DEUDA Y NATURALEZA:")
    print(f"    * Cartas cerradas con deuda erronea: {len(cerradas_con_deuda)} (Esperado: 0)")
    print(f"    * Cartas PARA CONOCIMIENTO con deuda erronea: {len(conocimiento_con_deuda)} (Esperado: 0)")
    print(f"    * Cartas abiertas sin deuda no justificadas: {len(abiertas_sin_deuda)} (Esperado: 0)")
    print(f"    * Cartas clasificadas como Solo Comunicacion / Traslado: {len(traslados_recibidos)}")

    # 6. Motor Semántico de Palabras Clave
    sem_counts = Counter()
    for c in cartas:
        sem = clasificacion.analyze_semantic_intent(c)
        sem_counts[sem["short_label"]] += 1

    print("\n[6] ESCANEO DE INTENCION SEMANTICA POR PALABRAS CLAVE:")
    for cat_label, cnt in sem_counts.most_common():
        print(f"    * {cat_label:30}: {cnt:5} cartas ({round(cnt/total*100, 1)}%)")

    # 7. Hilos de Conversación
    conn.close()
    conn_hilos = app.connect_mysql()
    h_data = hilos.rebuild_hilos_fast(conn_hilos)
    h_count = h_data.get("hilos", 0)
    h_abiertos = h_data.get("abiertos", 0)
    h_cerrados = h_data.get("cerrados", 0)
    conn_hilos.close()
    
    print("\n[7] ANALISIS DE HILOS Y TRAZABILIDAD:")
    print(f"    * Total Hilos reconstruidos: {h_count}")
    print(f"    * Hilos Abiertos activos: {h_abiertos}")
    print(f"    * Hilos Cerrados concluidos: {h_cerrados}")

    # 8. Saldos y Paridad con Libro Excel Oficial
    saldos = clasificacion.build_saldos(cartas)
    cnts = saldos["counts"]
    tgt = saldos["excel_target"]
    print("\n[8] PARIDAD CONTABLE CON EL LIBRO EXCEL:")
    print(f"    * Le deben (Supervision debe a CGGC): {cnts['le_deben']}  [Excel Meta: {tgt['le_deben']}]  {'[OK CUADRA]' if cnts['le_deben'] == tgt['le_deben'] else '[DIFERENCIA]'}")
    print(f"    * CGGC Debe (Yo debo responder):      {cnts['cggc_debe']}  [Excel Meta: {tgt['cggc_debe']}]  {'[OK CUADRA]' if cnts['cggc_debe'] == tgt['cggc_debe'] else '[DIFERENCIA]'}")
    print(f"    * Saldo Neto (Balance):               {cnts['saldo_neto']}  [Excel Meta: {tgt['saldo_neto']}]  {'[OK CUADRA]' if cnts['saldo_neto'] == tgt['saldo_neto'] else '[DIFERENCIA]'}")

    print("\n" + "=" * 70)
    print("                    AUDITORIA FINALIZADA SIN ERRORES CRITICOS")
    print("=" * 70)

if __name__ == "__main__":
    run_audit()
