import re
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import app, get_db

with open('docker/mysql/init/02_seed_data.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

m = re.search(r"INSERT INTO `configuracion_sistema` VALUES \((.+?)\);", sql)
if m:
    val_str = m.group(1)
    with app.app_context():
        db = get_db()
        with db.cursor() as cur:
            cur.execute("DESCRIBE configuracion_sistema")
            cols = cur.fetchall()
            print("Table columns:", [c['Field'] for c in cols])
            # The seed data in 02_seed_data had fewer columns before logo_membrete_word was added.
            # Columns in seed: id, nombre_sistema, subtitulo_proyecto, logo_url, favicon_url, dias_vencida, dias_por_vencer, dias_hilo, actualizado_en, plazo_sup_dias, plazo_entidad_dias, plazo_muni_dias, plazo_jrd_dias, plazo_ro_dias
            cur.execute(f"INSERT INTO configuracion_sistema (id, nombre_sistema, subtitulo_proyecto, logo_url, favicon_url, dias_vencida, dias_por_vencer, dias_hilo, actualizado_en, plazo_sup_dias, plazo_entidad_dias, plazo_muni_dias, plazo_jrd_dias, plazo_ro_dias) VALUES ({val_str}) ON DUPLICATE KEY UPDATE logo_url=VALUES(logo_url), favicon_url=VALUES(favicon_url)")
            db.commit()
            cur.execute("SELECT id, nombre_sistema, LENGTH(logo_url), LENGTH(favicon_url) FROM configuracion_sistema WHERE id=1")
            row = cur.fetchone()
            print("Resultado:", row)
