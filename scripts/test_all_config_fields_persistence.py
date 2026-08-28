import io
import os
import sys
import json

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app, get_db

print("======================================================================")
print("  AUDITORÍA EXHAUSTIVA DE PERSISTENCIA DE TODOS LOS CAMPOS DE CONFIG  ")
print("======================================================================")

client = app.test_client()

with app.app_context():
    # 1. Login admin
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200, "Fallo login admin"

    # 2. Guardar valores personalizados en TODOS los campos
    print("\n[TEST 1] Estableciendo valores personalizados en todos los campos...")
    custom_payload = {
        "nombre_sistema": "SistemaGreace - Hospital Leoncio Prado",
        "subtitulo_proyecto": "Consorcio Ejecutor Hospital Leoncio Prado / PRONIS",
        "plazo_sup_dias": 8,         # Supervisión (días hábiles)
        "plazo_entidad_dias": 25,    # PRONIS (días calendario)
        "plazo_muni_dias": 18,       # Municipalidad (días calendario)
        "plazo_jrd_dias": 22,        # Junta de Disputas (días calendario)
        "plazo_ro_dias": 7,          # Residencia / Yo debo (días hábiles)
        "sync_semaforos": True
    }
    res1 = client.put("/api/config", json=custom_payload)
    assert res1.status_code == 200, f"Error al guardar: {res1.data}"
    c1 = res1.get_json().get("config", {})

    # Verificaciones
    assert c1.get("nombre_sistema") == "SistemaGreace - Hospital Leoncio Prado"
    assert c1.get("subtitulo_proyecto") == "Consorcio Ejecutor Hospital Leoncio Prado / PRONIS"
    assert c1.get("plazo_sup_dias") == 8
    assert c1.get("plazo_entidad_dias") == 25
    assert c1.get("plazo_muni_dias") == 18
    assert c1.get("plazo_jrd_dias") == 22
    assert c1.get("plazo_ro_dias") == 7
    # Hilos debe unificarse automáticamente con plazo_ro_dias
    assert c1.get("dias_hilo") == 7
    # Semáforo Vencida = max(25, 18, 22, 8, 7) = 25
    assert c1.get("dias_vencida") == 25
    # Semáforo Por Vencer = max(1, min(7, 8) - 2) = 5
    assert c1.get("dias_por_vencer") == 5

    print("  ✓ Nombre del Sistema:", c1.get("nombre_sistema"))
    print("  ✓ Subtítulo / Obra:", c1.get("subtitulo_proyecto"))
    print("  ✓ 1. Plazos para que nos respondan:")
    print(f"      - Supervisión: {c1.get('plazo_sup_dias')}d hábiles")
    print(f"      - PRONIS / Entidad: {c1.get('plazo_entidad_dias')}d calendario")
    print(f"      - Municipalidad: {c1.get('plazo_muni_dias')}d calendario")
    print(f"      - JRD: {c1.get('plazo_jrd_dias')}d calendario")
    print("  ✓ 2. Plazo para responder nosotros:")
    print(f"      - Residencia (Yo debo): {c1.get('plazo_ro_dias')}d hábiles (Hilos: {c1.get('dias_hilo')}d)")
    print("  ✓ 3. Semáforos calculados automáticamente:")
    print(f"      - Vencida: ≥ {c1.get('dias_vencida')} días")
    print(f"      - Alerta preventiva: ≥ {c1.get('dias_por_vencer')} días")

    # 3. Prueba de Actualizaciones Parciales (cambiar SOLO un campo y comprobar que ningún otro se pierda)
    print("\n[TEST 2] Prueba de Actualización Parcial (modificar solo el nombre del sistema)...")
    res_partial_name = client.put("/api/config", json={
        "nombre_sistema": "SistemaGreace Premium"
    })
    assert res_partial_name.status_code == 200
    c_p1 = res_partial_name.get_json().get("config", {})
    assert c_p1.get("nombre_sistema") == "SistemaGreace Premium"
    assert c_p1.get("subtitulo_proyecto") == "Consorcio Ejecutor Hospital Leoncio Prado / PRONIS", "Subtítulo se alteró"
    assert c_p1.get("plazo_sup_dias") == 8, "Plazo sup se alteró"
    assert c_p1.get("plazo_entidad_dias") == 25, "Plazo entidad se alteró"
    assert c_p1.get("plazo_ro_dias") == 7, "Plazo ro se alteró"
    assert c_p1.get("dias_vencida") == 25, "Semáforo vencida se alteró"
    assert c_p1.get("dias_por_vencer") == 5, "Semáforo alerta se alteró"
    print("  ✓ Verificado: La actualización parcial del nombre mantuvo el 100% del resto de configuraciones intactas.")

    print("\n[TEST 3] Prueba de Actualización Parcial (modificar solo plazo de supervisión a 6d)...")
    res_partial_sup = client.put("/api/config", json={
        "plazo_sup_dias": 6
    })
    assert res_partial_sup.status_code == 200
    c_p2 = res_partial_sup.get_json().get("config", {})
    assert c_p2.get("nombre_sistema") == "SistemaGreace Premium"
    assert c_p2.get("plazo_sup_dias") == 6
    assert c_p2.get("plazo_entidad_dias") == 25
    assert c_p2.get("plazo_ro_dias") == 7
    # Recálculo automático: min(ro=7, sup=6) - 2 = 4
    assert c_p2.get("dias_por_vencer") == 4
    print("  ✓ Verificado: El recálculo automático de semáforos se ejecutó y ningún otro plazo se perdió.")

    # 4. Verificación de persistencia directa en MySQL
    print("\n[TEST 4] Verificando persistencia directa en la base de datos MySQL...")
    db = get_db()
    with db.cursor() as cur:
        cur.execute("SELECT * FROM configuracion_sistema WHERE id=1")
        row = cur.fetchone()
    assert row["nombre_sistema"] == "SistemaGreace Premium"
    assert row["subtitulo_proyecto"] == "Consorcio Ejecutor Hospital Leoncio Prado / PRONIS"
    assert row["plazo_sup_dias"] == 6
    assert row["plazo_entidad_dias"] == 25
    assert row["plazo_muni_dias"] == 18
    assert row["plazo_jrd_dias"] == 22
    assert row["plazo_ro_dias"] == 7
    assert row["dias_hilo"] == 7
    assert row["dias_vencida"] == 25
    assert row["dias_por_vencer"] == 4
    print("  ✓ Verificado en tabla MySQL: todos los valores están grabados correctamente.")

    # 5. Restauración a los valores estándar de obra
    print("\n[TEST 5] Restaurando valores contractuales estándar de Hospital Leoncio Prado...")
    std_payload = {
        "nombre_sistema": "SistemaGreace",
        "subtitulo_proyecto": "Hospital Leoncio Prado (PRONIS/MINSA)",
        "plazo_sup_dias": 5,
        "plazo_entidad_dias": 15,
        "plazo_muni_dias": 15,
        "plazo_jrd_dias": 15,
        "plazo_ro_dias": 5,
        "sync_semaforos": True
    }
    res_std = client.put("/api/config", json=std_payload)
    assert res_std.status_code == 200
    c_std = res_std.get_json().get("config", {})
    assert c_std.get("nombre_sistema") == "SistemaGreace"
    assert c_std.get("subtitulo_proyecto") == "Hospital Leoncio Prado (PRONIS/MINSA)"
    assert c_std.get("plazo_sup_dias") == 5
    assert c_std.get("plazo_entidad_dias") == 15
    assert c_std.get("plazo_muni_dias") == 15
    assert c_std.get("plazo_jrd_dias") == 15
    assert c_std.get("plazo_ro_dias") == 5
    assert c_std.get("dias_hilo") == 5
    assert c_std.get("dias_vencida") == 15
    assert c_std.get("dias_por_vencer") == 3
    print("  ✓ Valores restaurados a estándar HLP correctamente.")

print("\n======================================================================")
print("  ✅ TODOS LOS CAMPOS DE CONFIGURACIÓN FUERON AUDITADOS CON ÉXITO    ")
print("======================================================================")
