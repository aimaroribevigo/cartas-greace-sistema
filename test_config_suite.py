# -*- coding: utf-8 -*-
"""Suite de pruebas y auditoría de Configuración General, Plazos Contractuales y SLA Unificado."""
import json
import os
import sys

from app import app, get_db, _apply_plazos_from_config
from plazos_respuesta import build_plazo_reglas, regla_plazo_contraparte, fecha_limite_respuesta
from plazos import deadline_status, plazos_config
from hilos import list_hilos_api

print("======================================================================")
print("     SUITE DE TESTING: CONFIGURACIÓN GENERAL Y SLA UNIFICADO          ")
print("======================================================================")

client = app.test_client()

with app.app_context():
    db = get_db()

    # 1. Login como admin para las pruebas
    print("\n[TEST 1] Autenticación como Administrador...")
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200, f"Login falló: {login_res.data}"
    print("  ✓ Autenticado exitosamente como 'admin'")

    # 2. Lectura de Configuración Actual
    print("\n[TEST 2] Verificando GET /api/config...")
    cfg_res = client.get("/api/config")
    assert cfg_res.status_code == 200, f"GET /api/config falló: {cfg_res.data}"
    cfg_data = cfg_res.get_json().get("config", {})
    assert "nombre_sistema" in cfg_data
    assert "plazo_sup_dias" in cfg_data
    assert "plazo_ro_dias" in cfg_data
    print(f"  ✓ Configuración recuperada: {cfg_data.get('nombre_sistema')} - {cfg_data.get('subtitulo_proyecto')}")
    print(f"    - Plazo Supervisión: {cfg_data.get('plazo_sup_dias')}d hábiles")
    print(f"    - Plazo PRONIS: {cfg_data.get('plazo_entidad_dias')}d cal")
    print(f"    - Plazo Municipalidad: {cfg_data.get('plazo_muni_dias')}d cal")
    print(f"    - Plazo JRD: {cfg_data.get('plazo_jrd_dias')}d cal")
    print(f"    - Plazo Residencia (Yo debo): {cfg_data.get('plazo_ro_dias')}d hábiles")

    # 3. Prueba de Actualización y Sincronización Automática
    print("\n[TEST 3] Actualizando Plazos Contractuales a nuevos valores...")
    new_cfg = {
        "nombre_sistema": "SistemaGreace Test",
        "subtitulo_proyecto": "Obra Hospital Leoncio Prado",
        "plazo_sup_dias": 7,
        "plazo_entidad_dias": 20,
        "plazo_muni_dias": 15,
        "plazo_jrd_dias": 15,
        "plazo_ro_dias": 6
    }
    put_res = client.put("/api/config", json=new_cfg)
    assert put_res.status_code == 200, f"PUT /api/config falló: {put_res.data}"
    saved = put_res.get_json().get("config", {})
    assert saved.get("plazo_sup_dias") == 7, "Plazo sup no actualizado"
    assert saved.get("plazo_entidad_dias") == 20, "Plazo entidad no actualizado"
    assert saved.get("plazo_ro_dias") == 6, "Plazo ro no actualizado"
    # Sincronización automática de hilos y semáforos
    assert saved.get("dias_hilo") == 6, f"dias_hilo no sincronizado con ro: {saved.get('dias_hilo')}"
    assert saved.get("dias_vencida") == 20, f"dias_vencida esperado 20, obtenido: {saved.get('dias_vencida')}"
    assert saved.get("dias_por_vencer") == 4, f"dias_por_vencer esperado min(6,7)-2=4, obtenido: {saved.get('dias_por_vencer')}"
    print("  ✓ Configuración guardada en MySQL y semáforos recalculados automáticamente:")
    print(f"    - Vencida (Rojo): ≥ {saved.get('dias_vencida')} días")
    print(f"    - Por vencer (Amarillo): ≥ {saved.get('dias_por_vencer')} días")
    print(f"    - Hilos de Conversación: {saved.get('dias_hilo')} días hábiles")

    # 4. Verificación de Propagación a Módulos del Sistema
    print("\n[TEST 4] Verificando propagación a reglas de plazos y cálculos...")
    reglas = build_plazo_reglas()
    assert reglas["supervisor"]["dias"] == 7
    assert reglas["entidad"]["dias"] == 20
    assert reglas["residente"]["dias"] == 6
    print("  ✓ Reglas en memoria actualizadas correctamente:")
    print(f"    - Supervisión: {reglas['supervisor']['label']}")
    print(f"    - Entidad: {reglas['entidad']['label']}")
    print(f"    - Residente: {reglas['residente']['label']}")

    # 5. Verificación de Endpoints del Sistema (/api/stats, /api/pendientes)
    print("\n[TEST 5] Verificando respuestas de los endpoints con los nuevos plazos...")
    stats_res = client.get("/api/stats")
    assert stats_res.status_code == 200
    stats_json = stats_res.get_json()
    assert stats_json.get("plazos", {}).get("vencida_dias") == 20
    assert stats_json.get("plazos", {}).get("por_vencer_dias") == 4
    assert stats_json.get("plazos_contractuales", {}).get("plazo_sup_dias") == 7
    print(f"  ✓ /api/stats refleja: Vencidas ≥ {stats_json['plazos']['vencida_dias']}d, Alerta ≥ {stats_json['plazos']['por_vencer_dias']}d")

    pend_res = client.get("/api/pendientes")
    assert pend_res.status_code == 200
    pend_json = pend_res.get_json()
    assert "debo" in pend_json and "me_deben" in pend_json
    print(f"  ✓ /api/pendientes calculado con éxito: Debo={pend_json['counts']['debo']}, Me deben={pend_json['counts']['me_deben']}")

    # 6. Pruebas de Validación de Límites y Errores
    print("\n[TEST 6] Verificando validaciones de seguridad y límites...")
    
    # 6.1 Días negativos o 0
    bad_res1 = client.put("/api/config", json={**new_cfg, "plazo_sup_dias": 0})
    assert bad_res1.status_code == 400, "Debió rechazar días = 0"
    print("  ✓ Rechaza correctamente valores menores a 1 día")

    # 6.2 Días fuera de rango (>99,999)
    bad_res2 = client.put("/api/config", json={**new_cfg, "plazo_sup_dias": 100000})
    assert bad_res2.status_code == 400, "Debió rechazar días > 99,999"
    print("  ✓ Rechaza correctamente valores mayores al límite de 99,999 días")

    # 6.3 Nombre de sistema vacío
    bad_res3 = client.put("/api/config", json={**new_cfg, "nombre_sistema": ""})
    assert bad_res3.status_code == 400, "Debió rechazar nombre vacío"
    print("  ✓ Rechaza correctamente nombre de sistema vacío")

    # 7. Restauración a la Configuración Estándar HLP
    print("\n[TEST 7] Restaurando valores contractuales estándar...")
    reset_cfg = {
        "nombre_sistema": "SistemaGreace",
        "subtitulo_proyecto": "Hospital Leoncio Prado (PRONIS/MINSA)",
        "plazo_sup_dias": 5,
        "plazo_entidad_dias": 15,
        "plazo_muni_dias": 15,
        "plazo_jrd_dias": 15,
        "plazo_ro_dias": 5
    }
    reset_res = client.put("/api/config", json=reset_cfg)
    assert reset_res.status_code == 200
    final_cfg = reset_res.get_json().get("config", {})
    assert final_cfg.get("dias_vencida") == 15
    assert final_cfg.get("dias_por_vencer") == 3
    assert final_cfg.get("dias_hilo") == 5
    print("  ✓ Valores restablecidos exitosamente a estándar HLP (5d sup, 15d entidad, 5d ro)")

print("\n======================================================================")
print("  TODAS LAS PRUEBAS DE CONFIGURACIÓN Y SLA PASARON EXITOSAMENTE (7/7) ")
print("======================================================================")
