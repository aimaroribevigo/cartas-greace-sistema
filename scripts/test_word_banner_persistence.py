import io
import os
import sys
import json
import base64
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app, get_db

print("======================================================================")
print("  TEST DE PERSISTENCIA Y FUNCIONAMIENTO DE MEMBRETE WORD (.DOCX)     ")
print("======================================================================")

# Crear imagen PNG simulada en base64 para probar
img = Image.new('RGB', (600, 100), color=(30, 90, 150))
buf = io.BytesIO()
img.save(buf, format='PNG')
test_banner_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')

client = app.test_client()

with app.app_context():
    # 1. Login admin
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200, "Fallo login admin"

    # 2. Guardar membrete personalizado en /api/config
    print("\n[Paso 1] Guardando membrete Word personalizado en /api/config...")
    save_res = client.put("/api/config", json={
        "nombre_sistema": "SistemaGreace",
        "subtitulo_proyecto": "Hospital Leoncio Prado (PRONIS/MINSA)",
        "logo_membrete_word": test_banner_b64
    })
    assert save_res.status_code == 200, f"Error al guardar membrete: {save_res.data}"
    cfg = save_res.get_json().get("config", {})
    assert cfg.get("logo_membrete_word") == test_banner_b64, "Membrete no coincide en respuesta"
    print("  ✓ Membrete personalizado guardado en MySQL con éxito.")

    # 3. Realizar una actualización parcial (por ejemplo, cambiar sólo días de plazo)
    print("\n[Paso 2] Simulando actualización parcial de plazos (sin enviar campo membrete)...")
    partial_res = client.put("/api/config", json={
        "nombre_sistema": "SistemaGreace",
        "subtitulo_proyecto": "Hospital Leoncio Prado (PRONIS/MINSA)",
        "plazo_sup_dias": 5
    })
    assert partial_res.status_code == 200
    cfg2 = partial_res.get_json().get("config", {})
    assert cfg2.get("logo_membrete_word") == test_banner_b64, "¡ERROR! El membrete se borró durante la actualización parcial."
    print("  ✓ Verificado: El membrete Word NO se borró tras la actualización parcial.")

    # 4. Probar generación de Word con el membrete personalizado activo
    print("\n[Paso 3] Generando borrador DOCX con membrete personalizado...")
    docx_res = client.post("/api/cartas/generar-borrador-docx", json={
        "asunto": "Carta de Prueba Membrete",
        "referencia": "CARTA N° 001-2026",
        "destinatario_nombre": "Supervisión de Obra",
        "cuerpo_items": ["Párrafo de prueba con membrete personalizado."]
    })
    assert docx_res.status_code == 200, f"Error generando docx: {docx_res.data}"
    assert len(docx_res.data) > 5000, "Archivo docx generado es demasiado pequeño o está corrupto"
    print("  ✓ Documento .docx generado correctamente con membrete personalizado (Tamaño:", len(docx_res.data), "bytes)")

    # 5. Probar eliminación explícita de membrete (volver al oficial por defecto)
    print("\n[Paso 4] Restableciendo al membrete oficial por defecto...")
    reset_banner_res = client.put("/api/config", json={
        "nombre_sistema": "SistemaGreace",
        "subtitulo_proyecto": "Hospital Leoncio Prado (PRONIS/MINSA)",
        "logo_membrete_word": None
    })
    assert reset_banner_res.status_code == 200
    cfg3 = reset_banner_res.get_json().get("config", {})
    assert cfg3.get("logo_membrete_word") is None, "Membrete no volvió a None"

    # 6. Probar generación de Word con el membrete oficial por defecto (cggc_banner.png)
    print("\n[Paso 5] Generando borrador DOCX con membrete oficial por defecto (cggc_banner.png)...")
    docx_default_res = client.post("/api/cartas/generar-borrador-docx", json={
        "asunto": "Carta de Prueba Membrete Defecto",
        "referencia": "CARTA N° 002-2026",
        "destinatario_nombre": "Supervisión de Obra",
        "cuerpo_items": ["Párrafo de prueba con membrete oficial."]
    })
    assert docx_default_res.status_code == 200, f"Error generando docx por defecto: {docx_default_res.data}"
    assert len(docx_default_res.data) > 5000, "Archivo docx generado es demasiado pequeño"
    print("  ✓ Documento .docx generado correctamente con membrete oficial (Tamaño:", len(docx_default_res.data), "bytes)")

print("\n======================================================================")
print("  ✅ TODAS LAS PRUEBAS DE PERSISTENCIA DE MEMBRETE PASARON CON ÉXITO   ")
print("======================================================================")
