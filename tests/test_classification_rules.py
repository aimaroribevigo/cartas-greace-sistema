import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
# -*- coding: utf-8 -*-
"""Pruebas unitarias de las reglas de clasificación: Absolución (cerrado) y Comunicados de Ensayos (comunicación)."""
import unittest
from datetime import date

from core.clasificacion import (
    classify_carta,
    is_absolucion,
    is_solo_comunicacion,
    analyze_semantic_intent,
    build_pendientes,
    DEUDA_DEBO,
    DEUDA_ME_DEBEN,
    DEUDA_NINGUNA,
    NATURALEZA_COMUNICACION,
    NATURALEZA_RESPUESTA,
)
from core.normalizers import (
    normalize_estado,
    is_estado_abierto,
    infer_estado_from_row,
    CLOSED_STATES,
)


class TestClassificationRules(unittest.TestCase):

    # ═══════════════════════════════════════════════════════
    # 1. CASOS DE ABSOLUCIÓN ("absuelven", "absuelto", "absolución de consulta")
    # ═══════════════════════════════════════════════════════

    def test_01_informe_pronis_absolucion_consulta(self):
        """INFORME N°021-2024-MINSA-PRONIS-UED-JEMC: Absolución de consulta emitida por PRONIS es cerrada sin deuda."""
        carta = {
            "n_documento": "INFORME N°021-2024-MINSA-PRONIS-UED-JEMC",
            "bandeja": "recibida_pronis",
            "sentido": "recibida",
            "fecha": "2024-04-02",
            "asunto": "ABSOLUCIÓN DE CONSULTA RESPECTO A SOSTENIMIENTO TEMPORAL CON TABLESTACADO COLINDANTE COM AGENCIA AGRARIA",
            "especialidad": "ESTRUCTURAS",
            "estado": "PENDIENTE ENTIDAD",  # texto residual en excel
        }
        self.assertTrue(is_absolucion(carta))
        cl = classify_carta(carta)
        self.assertFalse(cl["abierta"], "Una absolución debe considerarse CERRADA (abierta=False)")
        self.assertEqual(cl["deuda"], DEUDA_NINGUNA, "No debe generar deuda de respuesta")
        self.assertIn("ABSUELT", cl["estado_norm"])
        
        sem = analyze_semantic_intent(carta)
        self.assertEqual(sem["categoria"], "absolucion")
        self.assertFalse(sem["exige_respuesta"])

    def test_02_absuelven_consulta_variations(self):
        """Diferentes formas de redactar absoluciones deben considerarse cerradas."""
        asuntos = [
            "ABSUELVEN CONSULTA TÉCNICA N° 15 SOBRE INSTALACIONES ELÉCTRICAS",
            "ABSUELVE CONSULTA N° 08 DEL RESIDENTE DE OBRA",
            "NOTIFICA CONSULTA ABSUELTA POR EL PROYECTISTA",
            "PRONUNCIAMIENTO Y ABSOLUCIÓN DE CONSULTA N° 99",
            "ATENCIÓN DE CONSULTA TÉCNICA N° 04",
        ]
        for asunto in asuntos:
            carta = {
                "n_documento": "CARTA N° 100-2026-SUP",
                "bandeja": "recibida_sup",
                "sentido": "recibida",
                "asunto": asunto,
                "estado": "ABIERTO",
            }
            self.assertTrue(is_absolucion(carta), f"Fallo al detectar absolución en: {asunto}")
            cl = classify_carta(carta)
            self.assertFalse(cl["abierta"], f"Debe ser cerrada para: {asunto}")
            self.assertEqual(cl["deuda"], DEUDA_NINGUNA, f"Debe tener deuda ninguna para: {asunto}")

    def test_03_estados_normalizados_absuelto(self):
        """Todos los alias de ABSUELTO deben ser reconocidos como cerrados."""
        for est in [
            "ABSUELTO",
            "ABSUELTA",
            "ABSUELTO SUPERVISION",
            "ABSUELTO ENTIDAD",
            "ABSUELTA POR SUPERVISOR",
            "ABSUELTA POR ENTIDAD",
            "ABSOLUCIÓN DE CONSULTA",
            "ABSUELVE CONSULTA",
        ]:
            norm = normalize_estado(est)
            self.assertFalse(is_estado_abierto(norm), f"{est} normalizado a {norm} debe ser cerrado")
            self.assertIn(norm, CLOSED_STATES)

    # ═══════════════════════════════════════════════════════
    # 2. CASOS DE COMUNICADOS Y PRESENTACIÓN DE ENSAYOS
    # ═══════════════════════════════════════════════════════

    def test_04_carta_presentacion_ensayos_calidad(self):
        """CARTA N°002-2026-CCC/JQG: Requerimiento / comunicado de presentación de ensayos es informativo."""
        carta = {
            "n_documento": "CARTA N°002-2026-CCC/JQG",
            "bandeja": "recibida_sup",
            "sentido": "recibida",
            "fecha": "2026-01-02",
            "asunto": "REITERACIÓN CONSECUTIVA EN PRESENTACIÓN DE ENSAYOS DE CONTROL DE CALIDAD PENDIENTES POR PARTE DEL CONTRATISTA",
            "especialidad": "CALIDAD",
            "estado": "PARA RESPUESTA",
        }
        self.assertTrue(is_solo_comunicacion(carta), "Debe detectarse como solo comunicación")
        cl = classify_carta(carta)
        self.assertEqual(cl["naturaleza"], NATURALEZA_COMUNICACION)
        self.assertEqual(cl["deuda"], DEUDA_NINGUNA, "No debe generar deuda debo en pendientes")
        self.assertTrue(cl["solo_comunicacion"])
        
        sem = analyze_semantic_intent(carta)
        self.assertFalse(sem["exige_respuesta"], "Los ensayos no exigen deuda de respuesta perentoria")

    def test_05_solicitud_ensayos_tuberia_cobre(self):
        """Ejemplo explícito del usuario: 'se solicita presentación de los ensayos de tuberia cobre'."""
        carta = {
            "n_documento": "CARTA N° 055-2026-SUP",
            "bandeja": "recibida_sup",
            "sentido": "recibida",
            "asunto": "SE SOLICITA PRESENTACIÓN DE LOS ENSAYOS DE TUBERIA COBRE",
            "estado": "ABIERTO",
        }
        self.assertTrue(is_solo_comunicacion(carta))
        cl = classify_carta(carta)
        self.assertEqual(cl["deuda"], DEUDA_NINGUNA)
        self.assertEqual(cl["naturaleza"], NATURALEZA_COMUNICACION)

    def test_06_comunicados_generales_y_circulares(self):
        """Cartas de comunicación general, circulares o informativas."""
        asuntos = [
            "CARTA CIRCULAR N° 01: COMUNICA FERIADO NO LABORABLE",
            "COMUNICA INICIO DE TRABAJOS DE EXCAVACIÓN",
            "PONE EN CONOCIMIENTO VISITA DE INSPECCIÓN DE PRONIS",
            "REMISIÓN DE CERTIFICADOS DE CALIDAD Y PROTOCOLOS",
            "PRESENTACIÓN DE RESULTADOS DE ENSAYOS DE DENSIDAD DE CAMPO",
        ]
        for asunto in asuntos:
            carta = {
                "n_documento": "DOC-COM-01",
                "bandeja": "recibida_sup",
                "sentido": "recibida",
                "asunto": asunto,
                "estado": "ABIERTO",
            }
            self.assertTrue(is_solo_comunicacion(carta), f"Fallo en: {asunto}")
            cl = classify_carta(carta)
            self.assertEqual(cl["deuda"], DEUDA_NINGUNA, f"Debe tener deuda ninguna: {asunto}")

    # ═══════════════════════════════════════════════════════
    # 3. TRÁMITES CONTRACTUALES REALES (SÍ DEBEN GENERAR DEUDA)
    # ═══════════════════════════════════════════════════════

    def test_07_consulta_tecnica_genuina_exige_respuesta(self):
        """Una consulta técnica recibida abierta sí debe generar deuda 'debo'."""
        carta = {
            "n_documento": "CARTA N° 010-2026-SUP",
            "bandeja": "recibida_sup",
            "sentido": "recibida",
            "asunto": "CONSULTA N° 05 - INCOMPATIBILIDAD EN PLANOS DE ESTRUCTURAS",
            "estado": "PARA RESPUESTA",
            "especialidad": "ESTRUCTURAS",
        }
        self.assertFalse(is_absolucion(carta))
        self.assertFalse(is_solo_comunicacion(carta))
        cl = classify_carta(carta)
        self.assertTrue(cl["abierta"])
        self.assertEqual(cl["deuda"], DEUDA_DEBO)
        self.assertEqual(cl["naturaleza"], NATURALEZA_RESPUESTA)
        
        sem = analyze_semantic_intent(carta)
        self.assertEqual(sem["categoria"], "consulta_rfi")
        self.assertTrue(sem["exige_respuesta"])

    def test_08_solicitud_aprobacion_emitida_exige_respuesta(self):
        """Una solicitud de aprobación emitida hacia Supervisión genera deuda 'me_deben'."""
        carta = {
            "n_documento": "CARTA N° 020-2026-RO",
            "bandeja": "residente",
            "sentido": "emitida",
            "asunto": "SOLICITUD DE APROBACIÓN DE ADICIONAL DE OBRA N° 02",
            "estado": "PENDIENTE SUPERVISION",
            "especialidad": "ADM. DE CONTRATOS",
        }
        cl = classify_carta(carta)
        self.assertTrue(cl["abierta"])
        self.assertEqual(cl["deuda"], DEUDA_ME_DEBEN)
        self.assertEqual(cl["naturaleza"], NATURALEZA_RESPUESTA)

    def test_09_build_pendientes_counts(self):
        """Verifica que build_pendientes agrupe correctamente en 'debo', 'me_deben' y 'comunicacion'."""
        cartas = [
            # 1. Absolución (Cerrada -> no entra a debo ni me_deben)
            {
                "id": 1,
                "n_documento": "INFORME N°021-2024-MINSA-PRONIS-UED-JEMC",
                "bandeja": "recibida_pronis",
                "asunto": "ABSOLUCIÓN DE CONSULTA RESPECTO A SOSTENIMIENTO",
                "estado": "PENDIENTE ENTIDAD",
            },
            # 2. Comunicado de ensayos (Comunicación -> va a comunicacion, no a debo)
            {
                "id": 2,
                "n_documento": "CARTA N°002-2026-CCC/JQG",
                "bandeja": "recibida_sup",
                "asunto": "REITERACIÓN CONSECUTIVA EN PRESENTACIÓN DE ENSAYOS DE CONTROL DE CALIDAD",
                "estado": "PARA RESPUESTA",
            },
            # 3. Consulta técnica real recibida (Abierta -> entra a debo)
            {
                "id": 3,
                "n_documento": "CARTA N°003-2026-SUP",
                "bandeja": "recibida_sup",
                "asunto": "CONSULTA TÉCNICA N° 01 SOBRE MURO DE CONTENCIÓN",
                "estado": "PARA RESPUESTA",
            },
            # 4. Solicitud emitida abierta (Abierta -> entra a me_deben)
            {
                "id": 4,
                "n_documento": "CARTA N°004-2026-RO",
                "bandeja": "residente",
                "asunto": "SOLICITUD DE PRONUNCIAMIENTO SOBRE AMPLIACIÓN DE PLAZO",
                "estado": "PENDIENTE SUPERVISION",
            },
        ]
        
        pend = build_pendientes(cartas)
        self.assertEqual(pend["counts"]["debo"], 1, "Solo la consulta técnica debe estar en 'debo'")
        self.assertEqual(pend["counts"]["me_deben"], 1, "Solo la solicitud emitida debe estar en 'me_deben'")
        self.assertEqual(pend["counts"]["comunicacion"], 1, "El comunicado de ensayos debe estar en 'comunicacion'")
        
        debo_ids = [item["id"] for item in pend["debo"]["items"]]
        self.assertIn(3, debo_ids)
        self.assertNotIn(1, debo_ids, "La absolución NUNCA debe estar en debo")
        self.assertNotIn(2, debo_ids, "El comunicado de ensayos NUNCA debe estar en debo")

    def test_10_actas_afectaciones_archivadores_recalibraciones(self):
        """Casos de actas de coordinación, afectaciones, devolución de archivadores y recalibración de equipos."""
        casos = [
            ("CARTA N°449-2025-CCC/JQG", "ALCANZAR ACTA DE ACUERDOS N°02 REUNION DE COORDINACION"),
            ("CARTA N°564-2025-CCC/JQG", "COMUNICACIÓN DE AFECTACIONES COLINDANTES A LA ZONA DE EJECUCION"),
            ("CARTA N°591-2025-CCC/JQG", "DEVOLUCION DE 03 ARCHIVADORES DEL EXPEDIENTE DE LA REPRESENTACION ADICIONAL"),
            ("CARTA N°741-2025-CCC/JQG", "SE SOLICITA AL CONTRATISTA LA PRESENTACIÓN DE LOS CERTIFICADOS DE RECALIBRACIÓN DE LOS EQUIPOS DE LABORATORIO"),
            ("CARTA N°396-2025-CCC/JQG", "SOLICITUD DE FICHAS TECNICAD DE INSTALACIONES MECANICAS"),
            ("CARTA N°657-2025-CCC/JQG", "ALERTA TEMPRANA EMPOZAMIENTO DE AGUA EN ZONA DE INSTALACIÓN"),
        ]
        for doc, asunto in casos:
            carta = {"n_documento": doc, "asunto": asunto, "bandeja": "recibida_sup", "estado": "PARA RESPUESTA"}
            self.assertTrue(is_solo_comunicacion(carta), f"Fallo al detectar solo comunicación en: {asunto}")
            cl = classify_carta(carta)
            self.assertEqual(cl["deuda"], DEUDA_NINGUNA, f"No debe generar deuda para: {asunto}")

    def test_11_infer_estado_from_row_all_keywords(self):
        """infer_estado_from_row debe clasificar con total precisión para importación de Excel."""
        self.assertEqual(infer_estado_from_row(None, "PRONUNCIAMIENTO A LA ABSOLUCION DE CONSULTA", "", "recibida_sup"), "ABSUELTO SUPERVISION")
        self.assertEqual(infer_estado_from_row(None, "SE SOLICITA PRESENTACIÓN DE LOS ENSAYOS DE TUBERIA COBRE", "", "recibida_sup"), "PARA CONOCIMIENTO")
        self.assertEqual(infer_estado_from_row(None, "DEVOLUCION DE 03 ARCHIVADORES DEL EXPEDIENTE", "", "recibida_sup"), "PARA CONOCIMIENTO")
        self.assertEqual(infer_estado_from_row(None, "REUBICACIÓN DE POSTES Y SEMAFORO", "", "residente"), "PENDIENTE MUNICIPALIDAD")
        self.assertEqual(infer_estado_from_row(None, "NO HA SIDO EMITIDA", "", "residente"), "ANULADA")


if __name__ == "__main__":
    unittest.main()
