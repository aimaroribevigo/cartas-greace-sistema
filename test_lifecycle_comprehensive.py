# -*- coding: utf-8 -*-
"""Suite de Pruebas E2E y de Integración Completa para el Ciclo de Vida de Cartas y Trámites."""
import os
import sys
import unittest
import pymysql
from datetime import date, timedelta

from app import app, get_db
from hilos import rebuild_hilos_fast, normalize_doc_key, try_close_referenced_cartas
from normalizers import normalize_estado, infer_estado_from_row, is_estado_abierto


class TestCartasLifecycleComprehensive(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.app_ctx = app.app_context()
        cls.app_ctx.push()
        cls.conn = get_db()
        # Limpiar datos de pruebas previas si existieran
        with cls.conn.cursor() as cur:
            cur.execute("DELETE FROM cartas WHERE n_documento LIKE 'TEST-E2E-%'")
        cls.conn.commit()
        rebuild_hilos_fast(cls.conn)

    @classmethod
    def tearDownClass(cls):
        # Limpiar datos creados en las pruebas
        with cls.conn.cursor() as cur:
            cur.execute("DELETE FROM cartas WHERE n_documento LIKE 'TEST-E2E-%'")
        cls.conn.commit()
        rebuild_hilos_fast(cls.conn)
        cls.app_ctx.pop()

    def _create_carta(self, data):
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO cartas (
                    bandeja, sentido, n_documento, tipo_documento, fecha,
                    especialidad, especialidad_norm, asunto, observacion,
                    referencia, referencias, receptor, dirigido_a, area,
                    estado, estado_norm, caducidad, creado_en, actualizado_en
                ) VALUES (
                    %(bandeja)s, %(sentido)s, %(n_documento)s, %(tipo_documento)s, %(fecha)s,
                    %(especialidad)s, %(especialidad_norm)s, %(asunto)s, %(observacion)s,
                    %(referencia)s, %(referencias)s, %(receptor)s, %(dirigido_a)s, %(area)s,
                    %(estado)s, %(estado_norm)s, %(caducidad)s, NOW(), NOW()
                )
            """, {
                'bandeja': data.get('bandeja', 'residente'),
                'sentido': data.get('sentido', 'emitida'),
                'n_documento': data['n_documento'],
                'tipo_documento': data.get('tipo_documento', 'CARTA'),
                'fecha': data.get('fecha', date(2026, 9, 1)),
                'especialidad': data.get('especialidad', 'ESTRUCTURAS'),
                'especialidad_norm': data.get('especialidad_norm', 'ESTRUCTURAS'),
                'asunto': data.get('asunto', 'ASUNTO DE PRUEBA'),
                'observacion': data.get('observacion', ''),
                'referencia': data.get('referencia', None),
                'referencias': data.get('referencias', None),
                'receptor': data.get('receptor', 'RESIDENTE'),
                'dirigido_a': data.get('dirigido_a', 'SUPERVISOR'),
                'area': data.get('area', 'Supervisión'),
                'estado': data.get('estado', 'ABIERTO'),
                'estado_norm': normalize_estado(data.get('estado', 'ABIERTO')),
                'caducidad': data.get('caducidad', None)
            })
            cid = cur.lastrowid
        self.conn.commit()

        if data.get('cerrar_referenciadas', False) and data.get('referencia'):
            try_close_referenced_cartas(self.conn, data, True)

        rebuild_hilos_fast(self.conn)
        return cid

    def _get_carta(self, cid):
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM cartas WHERE id = %s", (cid,))
            return cur.fetchone()

    # -------------------------------------------------------------
    # 1. HILO COMPLETO DE CONSULTA / RFI (4 PASOS)
    # -------------------------------------------------------------
    def test_01_full_4_step_consultation_thread(self):
        print("\n--- Test 1: Hilo de Consulta RFI (4 Pasos) ---")
        # Paso 1: RO emite consulta técnica
        id1 = self._create_carta({
            'n_documento': 'TEST-E2E-RFI-001',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'receptor': 'RESIDENTE',
            'dirigido_a': 'Supervisión',
            'fecha': date(2026, 9, 1),
            'asunto': 'CONSULTA TÉCNICA N°99 - VERIFICACIÓN ESTRUCTURAL DE VIGAS PRINCIPALES',
            'especialidad': 'ESTRUCTURAS',
            'estado': 'ABIERTO'
        })
        c1 = self._get_carta(id1)
        self.assertEqual(c1['estado_norm'], 'ABIERTO')
        self.assertTrue(is_estado_abierto(c1['estado_norm']))

        # Paso 2: Supervisión traslada consulta a Pronis
        id2 = self._create_carta({
            'n_documento': 'TEST-E2E-RFI-002',
            'bandeja': 'recibida_sup',
            'sentido': 'recibida',
            'receptor': 'SUPERVISOR',
            'dirigido_a': 'Pronis',
            'fecha': date(2026, 9, 2),
            'referencia': 'TEST-E2E-RFI-001',
            'asunto': 'TRASLADO DE CONSULTA TÉCNICA N°99 A LA ENTIDAD',
            'especialidad': 'ESTRUCTURAS',
            'estado': 'PENDIENTE ENTIDAD'
        })

        # Paso 3: Pronis responde a Supervisión
        id3 = self._create_carta({
            'n_documento': 'TEST-E2E-RFI-003',
            'tipo_documento': 'OFICIO',
            'bandeja': 'recibida_pronis',
            'sentido': 'recibida',
            'receptor': 'PRONIS',
            'dirigido_a': 'Supervisión',
            'fecha': date(2026, 9, 4),
            'referencia': 'TEST-E2E-RFI-002',
            'asunto': 'PRONUNCIAMIENTO Y ABSOLUCIÓN DE CONSULTA N°99',
            'especialidad': 'ESTRUCTURAS',
            'estado': 'ABSUELTA POR ENTIDAD'
        })

        # Paso 4: Supervisión notifica y cierra trámite con el Residente
        id4 = self._create_carta({
            'n_documento': 'TEST-E2E-RFI-004',
            'bandeja': 'recibida_sup',
            'sentido': 'recibida',
            'receptor': 'SUPERVISOR',
            'dirigido_a': 'Residente (RO)',
            'fecha': date(2026, 9, 5),
            'referencia': 'TEST-E2E-RFI-003',
            'asunto': 'NOTIFICA ABSOLUCIÓN DE CONSULTA TÉCNICA N°99',
            'especialidad': 'ESTRUCTURAS',
            'estado': 'CERRADO',
            'cerrar_referenciadas': True
        })

        # Verificaciones de Integridad
        c1 = self._get_carta(id1)
        c2 = self._get_carta(id2)
        c3 = self._get_carta(id3)
        c4 = self._get_carta(id4)

        # 1. Mismo hilo
        self.assertIsNotNone(c1['hilo_id'])
        self.assertEqual(c1['hilo_id'], c2['hilo_id'])
        self.assertEqual(c2['hilo_id'], c3['hilo_id'])
        self.assertEqual(c3['hilo_id'], c4['hilo_id'])

        # 2. Cierre en cascada de cartas intermedias
        self.assertFalse(is_estado_abierto(c1['estado_norm']), f"Carta 1 debería estar cerrada: {c1['estado_norm']}")
        self.assertFalse(is_estado_abierto(c2['estado_norm']), f"Carta 2 debería estar cerrada: {c2['estado_norm']}")
        self.assertFalse(is_estado_abierto(c3['estado_norm']), f"Carta 3 debería estar cerrada: {c3['estado_norm']}")
        self.assertEqual(c4['estado_norm'], 'CERRADO')
        print(f"✓ Hilo RFI #{c1['hilo_id']} validado con éxito: 4 cartas vinculadas y cerradas correctamente.")

    # -------------------------------------------------------------
    # 2. HILO DE OBSERVACIÓN Y SUBSANACIÓN
    # -------------------------------------------------------------
    def test_02_observation_and_subsanacion_flow(self):
        print("\n--- Test 2: Hilo de Observación y Subsanación ---")
        id1 = self._create_carta({
            'n_documento': 'TEST-E2E-VAL-001',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'fecha': date(2026, 9, 1),
            'asunto': 'PRESENTACIÓN DE VALORIZACIÓN N°15 - OBRA PRINCIPAL',
            'especialidad': 'COSTOS',
            'estado': 'ABIERTO'
        })

        id2 = self._create_carta({
            'n_documento': 'TEST-E2E-VAL-002',
            'bandeja': 'recibida_sup',
            'sentido': 'recibida',
            'fecha': date(2026, 9, 3),
            'referencia': 'TEST-E2E-VAL-001',
            'asunto': 'OBSERVACIONES A LA VALORIZACIÓN N°15',
            'especialidad': 'COSTOS',
            'estado': 'OBSERVADO'
        })

        id3 = self._create_carta({
            'n_documento': 'TEST-E2E-VAL-003',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'fecha': date(2026, 9, 5),
            'referencia': 'TEST-E2E-VAL-002',
            'asunto': 'LEVANTAMIENTO Y SUBSANACIÓN DE OBSERVACIONES A VALORIZACIÓN N°15',
            'especialidad': 'COSTOS',
            'estado': 'SUBSANADO'
        })

        id4 = self._create_carta({
            'n_documento': 'TEST-E2E-VAL-004',
            'bandeja': 'recibida_sup',
            'sentido': 'recibida',
            'fecha': date(2026, 9, 7),
            'referencia': 'TEST-E2E-VAL-003',
            'asunto': 'APROBACIÓN Y CONFORMIDAD DE VALORIZACIÓN N°15',
            'especialidad': 'COSTOS',
            'estado': 'ABSUELTA POR SUPERVISOR',
            'cerrar_referenciadas': True
        })

        c1 = self._get_carta(id1)
        c2 = self._get_carta(id2)
        c3 = self._get_carta(id3)
        c4 = self._get_carta(id4)

        self.assertEqual(c1['hilo_id'], c4['hilo_id'])
        self.assertFalse(is_estado_abierto(c1['estado_norm']))
        self.assertFalse(is_estado_abierto(c2['estado_norm']))
        self.assertFalse(is_estado_abierto(c3['estado_norm']))
        self.assertEqual(c4['estado_norm'], 'ABSUELTA POR SUPERVISOR')
        print(f"✓ Hilo Subsanación #{c1['hilo_id']} validado con éxito: resuelto como ABSUELTA POR SUPERVISOR.")

    # -------------------------------------------------------------
    # 3. INFERENCIA INTELIGENTE DE ESTADOS (SIN ESTADO -> REAL)
    # -------------------------------------------------------------
    def test_03_informative_and_anulada_inference(self):
        print("\n--- Test 3: Inferencia de Estados (Informativas y Anuladas) ---")
        # Caso A: Oficio solo informativo / para conocimiento
        id_info = self._create_carta({
            'n_documento': 'TEST-E2E-INF-001',
            'tipo_documento': 'OFICIO',
            'bandeja': 'recibida_otros',
            'sentido': 'recibida',
            'fecha': date(2026, 9, 1),
            'asunto': 'HACE DE CONOCIMIENTO CRONOGRAMA DE MANTENIMIENTO ELÉCTRICO',
            'especialidad': 'INST. ELECTRICAS',
            'estado': infer_estado_from_row(None, 'HACE DE CONOCIMIENTO CRONOGRAMA DE MANTENIMIENTO ELÉCTRICO', 'TEST-E2E-INF-001', 'recibida_otros')
        })
        c_info = self._get_carta(id_info)
        self.assertEqual(c_info['estado_norm'], 'PARA CONOCIMIENTO')
        self.assertFalse(is_estado_abierto(c_info['estado_norm']))

        # Caso B: Carta no emitida
        id_anul = self._create_carta({
            'n_documento': 'TEST-E2E-ANU-001',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'fecha': date(2026, 9, 1),
            'asunto': 'NO HA SIDO EMITIDA POR MODIFICACIÓN DE SUSTENTO',
            'especialidad': 'GENERAL',
            'estado': infer_estado_from_row(None, 'NO HA SIDO EMITIDA POR MODIFICACIÓN DE SUSTENTO', 'TEST-E2E-ANU-001', 'residente')
        })
        c_anul = self._get_carta(id_anul)
        self.assertEqual(c_anul['estado_norm'], 'ANULADA')
        self.assertFalse(is_estado_abierto(c_anul['estado_norm']))
        print("✓ Inferencia de PARA CONOCIMIENTO y ANULADA verificada correctamente.")

    # -------------------------------------------------------------
    # 4. TRÁMITE MUNICIPAL (AUTORIZACIONES Y PERMISOS)
    # -------------------------------------------------------------
    def test_04_municipalidad_flow(self):
        print("\n--- Test 4: Trámite Municipal de Autorización ---")
        id1 = self._create_carta({
            'n_documento': 'TEST-E2E-MUN-001',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'receptor': 'MESA DE PARTES MPSC',
            'dirigido_a': 'Municipalidad',
            'fecha': date(2026, 9, 1),
            'asunto': 'SOLICITA AUTORIZACIÓN DE INTERFERENCIA DE VÍAS PARA REDES DE AGUA',
            'especialidad': 'INST. SANITARIAS',
            'estado': 'ABIERTO'
        })

        id2 = self._create_carta({
            'n_documento': 'TEST-E2E-MUN-002',
            'tipo_documento': 'OFICIO',
            'bandeja': 'recibida_mpsc',
            'sentido': 'recibida',
            'receptor': 'CGGC',
            'dirigido_a': 'CGGC',
            'fecha': date(2026, 9, 4),
            'referencia': 'TEST-E2E-MUN-001',
            'asunto': 'AUTORIZACIÓN DE INTERFERENCIA DE VÍAS N°045-2026',
            'especialidad': 'INST. SANITARIAS',
            'estado': infer_estado_from_row(None, 'AUTORIZACIÓN DE INTERFERENCIA DE VÍAS N°045-2026', 'TEST-E2E-MUN-002', 'recibida_mpsc'),
            'cerrar_referenciadas': True
        })

        c1 = self._get_carta(id1)
        c2 = self._get_carta(id2)
        self.assertEqual(c1['hilo_id'], c2['hilo_id'])
        self.assertEqual(c2['estado_norm'], 'CERRADO')
        self.assertFalse(is_estado_abierto(c1['estado_norm']))
        print(f"✓ Trámite municipal #{c1['hilo_id']} validado con éxito.")

    # -------------------------------------------------------------
    # 5. TRÁMITE LEGAL / AMPLIACIÓN DE PLAZO (RL <-> PRONIS)
    # -------------------------------------------------------------
    def test_05_legal_ampliacion_plazo_flow(self):
        print("\n--- Test 5: Trámite Legal / Ampliación de Plazo ---")
        id1 = self._create_carta({
            'n_documento': 'TEST-E2E-LEG-001',
            'bandeja': 'rl',
            'sentido': 'emitida',
            'receptor': 'REPRESENTANTE LEGAL',
            'dirigido_a': 'Pronis',
            'fecha': date(2026, 9, 1),
            'asunto': 'SOLICITUD DE AMPLIACIÓN DE PLAZO CONTRACTUAL N°08',
            'especialidad': 'ADM. DE CONTRATOS',
            'estado': 'ABIERTO'
        })

        id2 = self._create_carta({
            'n_documento': 'TEST-E2E-LEG-002',
            'tipo_documento': 'CARTA',
            'bandeja': 'recibida_pronis',
            'sentido': 'recibida',
            'receptor': 'PRONIS',
            'dirigido_a': 'Representante Legal',
            'fecha': date(2026, 9, 6),
            'referencia': 'TEST-E2E-LEG-001',
            'asunto': 'PRONUNCIAMIENTO RESPECTO A SOLICITUD DE AMPLIACIÓN DE PLAZO N°08',
            'especialidad': 'ADM. DE CONTRATOS',
            'estado': 'ABSUELTO ENTIDAD',
            'cerrar_referenciadas': True
        })

        c1 = self._get_carta(id1)
        c2 = self._get_carta(id2)
        self.assertEqual(c1['hilo_id'], c2['hilo_id'])
        self.assertFalse(is_estado_abierto(c1['estado_norm']))
        self.assertEqual(c2['estado_norm'], 'ABSUELTO ENTIDAD')
        print(f"✓ Trámite legal #{c1['hilo_id']} validado con éxito.")

    # -------------------------------------------------------------
    # 6. REAPERTURA Y EXTENSIÓN DINÁMICA DE HILO (PASO 5)
    # -------------------------------------------------------------
    def test_06_reopening_and_chain_extension(self):
        print("\n--- Test 6: Reapertura y Extensión Dinámica de Hilo ---")
        # En el Test 1 teníamos 4 cartas. Reabrimos la 4ta para continuar el trámite
        with self.conn.cursor() as cur:
            cur.execute("SELECT id FROM cartas WHERE n_documento = 'TEST-E2E-RFI-004'")
            r4 = cur.fetchone()
            self.assertIsNotNone(r4)
            id4 = r4['id']

            # Cambiamos estado de la última carta a PENDIENTE CGGC (reapertura)
            cur.execute("UPDATE cartas SET estado = 'PENDIENTE CGGC', estado_norm = 'PENDIENTE CGGC' WHERE id = %s", (id4,))
        self.conn.commit()

        # Emitimos Carta 5 (Respuesta de CGGC a la 4ta)
        id5 = self._create_carta({
            'n_documento': 'TEST-E2E-RFI-005',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'receptor': 'RESIDENTE',
            'dirigido_a': 'Supervisión',
            'fecha': date(2026, 9, 8),
            'referencia': 'TEST-E2E-RFI-004',
            'asunto': 'INFORME COMPLEMENTARIO DE ABSOLUCIÓN DE CONSULTA N°99',
            'especialidad': 'ESTRUCTURAS',
            'estado': 'CERRADO',
            'cerrar_referenciadas': True
        })

        c4 = self._get_carta(id4)
        c5 = self._get_carta(id5)
        self.assertEqual(c4['hilo_id'], c5['hilo_id'])
        self.assertFalse(is_estado_abierto(c4['estado_norm']))
        self.assertEqual(c5['estado_norm'], 'CERRADO')
        print(f"✓ Reapertura y extensión a 5 cartas en hilo #{c4['hilo_id']} validada con éxito.")

    # -------------------------------------------------------------
    # 7. ELIMINACIÓN Y REPARACIÓN AUTOMÁTICA DEL HILO
    # -------------------------------------------------------------
    def test_07_deletion_and_hilo_healing(self):
        print("\n--- Test 7: Eliminación y Reparación Automática ---")
        with self.conn.cursor() as cur:
            cur.execute("SELECT id, hilo_id FROM cartas WHERE n_documento = 'TEST-E2E-RFI-005'")
            r5 = cur.fetchone()
            self.assertIsNotNone(r5)
            id5 = r5['id']
            hid = r5['hilo_id']

            # Eliminamos la 5ta carta
            cur.execute("DELETE FROM cartas WHERE id = %s", (id5,))
        self.conn.commit()

        rebuild_hilos_fast(self.conn)

        # Verificamos que las 4 cartas originales sigan unidas en el hilo
        with self.conn.cursor() as cur:
            cur.execute("SELECT id, n_documento, hilo_id FROM cartas WHERE n_documento LIKE 'TEST-E2E-RFI-%' ORDER BY fecha ASC")
            cartas = cur.fetchall()
            self.assertEqual(len(cartas), 4)
            hids = set(x['hilo_id'] for x in cartas)
            self.assertEqual(len(hids), 1, "Todas las 4 cartas restantes deben mantener el mismo hilo_id")
        print("✓ Eliminación y cicatrización del hilo validada con éxito.")

    # -------------------------------------------------------------
    # 8. HILO DE REITERATIVO Y REINGRESO
    # -------------------------------------------------------------
    def test_08_reingreso_and_reiterado_flow(self):
        print("\n--- Test 8: Hilo de Reiterativo / Reingreso ---")
        id1 = self._create_carta({
            'n_documento': 'TEST-E2E-REIT-001',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'fecha': date(2026, 9, 1),
            'asunto': 'SOLICITUD DE REVISIÓN DE ADICIONAL DE OBRA N°03',
            'especialidad': 'COSTOS',
            'estado': 'ABIERTO'
        })

        id2 = self._create_carta({
            'n_documento': 'TEST-E2E-REIT-002',
            'bandeja': 'residente',
            'sentido': 'emitida',
            'fecha': date(2026, 9, 5),
            'referencia': 'TEST-E2E-REIT-001',
            'asunto': 'REITERA SOLICITUD DE PRONUNCIAMIENTO DE ADICIONAL DE OBRA N°03 - URGENTE',
            'especialidad': 'COSTOS',
            'estado': 'REITERADO'
        })

        id3 = self._create_carta({
            'n_documento': 'TEST-E2E-REIT-003',
            'bandeja': 'recibida_sup',
            'sentido': 'recibida',
            'fecha': date(2026, 9, 8),
            'referencia': 'TEST-E2E-REIT-002',
            'asunto': 'PRONUNCIAMIENTO RESPECTO A ADICIONAL DE OBRA N°03',
            'especialidad': 'COSTOS',
            'estado': 'ABSUELTA POR SUPERVISOR',
            'cerrar_referenciadas': True
        })

        c1 = self._get_carta(id1)
        c2 = self._get_carta(id2)
        c3 = self._get_carta(id3)
        self.assertEqual(c1['hilo_id'], c3['hilo_id'])
        self.assertFalse(is_estado_abierto(c1['estado_norm']))
        self.assertFalse(is_estado_abierto(c2['estado_norm']))
        self.assertEqual(c3['estado_norm'], 'ABSUELTA POR SUPERVISOR')
        print(f"✓ Hilo Reiterativo #{c1['hilo_id']} validado con éxito.")

    # -------------------------------------------------------------
    # 9. GENERACIÓN DE BORRADOR WORD (.DOCX) PARA RESPUESTAS
    # -------------------------------------------------------------
    def test_09_docx_generation_for_response(self):
        print("\n--- Test 9: Generación de Borrador Word (.docx) ---")
        from generador_word import generar_carta_docx
        doc_stream = generar_carta_docx({
            "tipo_documento": "CARTA",
            "n_documento": "CARTA N°TEST-DOCX-001",
            "fecha": "2026-09-01",
            "dirigido_a": "Supervisión",
            "receptor": "RESIDENTE",
            "referencia": "TEST-E2E-RFI-001",
            "asunto": "RESPUESTA A CONSULTA TÉCNICA N°99",
            "observacion": "Por medio de la presente, se hace llegar el informe de sustento técnico correspondiente...",
            "especialidad": "ESTRUCTURAS"
        })
        doc_bytes = doc_stream.getvalue() if hasattr(doc_stream, 'getvalue') else doc_stream
        self.assertIsNotNone(doc_bytes)
        self.assertGreater(len(doc_bytes), 1000, "El archivo .docx generado debe tener contenido binario válido")
        print(f"✓ Documento Word generado exitosamente ({len(doc_bytes)} bytes).")

    # -------------------------------------------------------------
    # 10. CONSISTENCIA DE PENDIENTES Y SALDOS
    # -------------------------------------------------------------
    def test_10_pendientes_and_saldos_consistency(self):
        print("\n--- Test 10: Consistencia de Pendientes y Saldos ---")
        with self.conn.cursor() as cur:
            # Crear una carta con deuda abierta
            id_open = self._create_carta({
                'n_documento': 'TEST-E2E-DEBT-001',
                'bandeja': 'recibida_sup',
                'sentido': 'recibida',
                'receptor': 'SUPERVISOR',
                'dirigido_a': 'Residente (RO)',
                'fecha': date(2026, 8, 20),
                'asunto': 'SOLICITA PRESENTACIÓN DE PLAN DE TRABAJO SEMANAL',
                'especialidad': 'GENERAL',
                'estado': 'ABIERTO'
            })

            # Crear una carta cerrada
            id_closed = self._create_carta({
                'n_documento': 'TEST-E2E-DEBT-002',
                'bandeja': 'recibida_sup',
                'sentido': 'recibida',
                'receptor': 'SUPERVISOR',
                'dirigido_a': 'Residente (RO)',
                'fecha': date(2026, 8, 20),
                'asunto': 'PLAN DE TRABAJO APROBADO',
                'especialidad': 'GENERAL',
                'estado': 'CERRADO'
            })

        c_open = self._get_carta(id_open)
        c_closed = self._get_carta(id_closed)
        self.assertTrue(is_estado_abierto(c_open['estado_norm']))
        self.assertFalse(is_estado_abierto(c_closed['estado_norm']))
        print("✓ Estados abiertos y cerrados evaluados con estricta consistencia en saldos.")


if __name__ == '__main__':
    unittest.main()
