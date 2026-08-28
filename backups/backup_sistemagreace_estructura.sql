
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `cartas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cartas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bandeja` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sentido` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'emitida',
  `n_orden` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `n_documento` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo_documento` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asunto` text COLLATE utf8mb4_unicode_ci,
  `especialidad` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `especialidad_norm` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado_norm` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referencias` text COLLATE utf8mb4_unicode_ci,
  `referencia` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `folios` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cd` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dirigido_a` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receptor` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cargo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observacion` text COLLATE utf8mb4_unicode_ci,
  `area` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `empresa` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `caducidad` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_respuesta` date DEFAULT NULL,
  `carta_respuesta` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hilo_id` int DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cartas_bandeja` (`bandeja`),
  KEY `idx_cartas_estado` (`estado_norm`),
  KEY `idx_cartas_esp` (`especialidad_norm`),
  KEY `idx_cartas_fecha` (`fecha`),
  KEY `idx_cartas_doc` (`n_documento`),
  KEY `idx_cartas_hilo` (`hilo_id`),
  KEY `idx_cartas_referencia` (`referencia`(80)),
  KEY `idx_cartas_bandeja_fecha` (`bandeja`,`fecha`),
  KEY `idx_cartas_estado_fecha` (`estado_norm`,`fecha`),
  KEY `idx_cartas_esp_fecha` (`especialidad_norm`,`fecha`),
  KEY `idx_cartas_sentido_fecha` (`sentido`,`fecha`),
  CONSTRAINT `fk_cartas_hilo` FOREIGN KEY (`hilo_id`) REFERENCES `hilos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8029 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `configuracion_sistema`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `configuracion_sistema` (
  `id` int NOT NULL DEFAULT '1',
  `nombre_sistema` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SistemaGreace',
  `subtitulo_proyecto` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Hospital Leoncio Prado (PRONIS/MINSA)',
  `logo_url` mediumtext COLLATE utf8mb4_unicode_ci,
  `favicon_url` mediumtext COLLATE utf8mb4_unicode_ci,
  `dias_vencida` int NOT NULL DEFAULT '15',
  `dias_por_vencer` int NOT NULL DEFAULT '10',
  `dias_hilo` int NOT NULL DEFAULT '5',
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `plazo_sup_dias` int NOT NULL DEFAULT '5',
  `plazo_entidad_dias` int NOT NULL DEFAULT '15',
  `plazo_muni_dias` int NOT NULL DEFAULT '15',
  `plazo_jrd_dias` int NOT NULL DEFAULT '15',
  `plazo_ro_dias` int NOT NULL DEFAULT '5',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `consultas`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `consultas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `n_consulta` int NOT NULL,
  `especialidad` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ruta_critica` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ampl_plazo` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `adicional_obra` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consulta_desc` text COLLATE utf8mb4_unicode_ci,
  `asiento_n` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_contratista` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `carta_informe_n` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `plazo_absolucion_elevacion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `carta_sup_n` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_real_sup` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `respuesta_supervision` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `plazo_max_absolucion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `carta_ent_n` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_real_ent` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `respuesta_entidad` text COLLATE utf8mb4_unicode_ci,
  `fecha_limite_aprobacion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_real_aprobacion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estatus_aprobacion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado_consulta` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=60 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `hilos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hilos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clave` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `especialidad_norm` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'abierto',
  `fecha_inicio` date DEFAULT NULL,
  `fecha_cierre` date DEFAULT NULL,
  `dias_congelados` int DEFAULT NULL,
  `n_cartas` int NOT NULL DEFAULT '0',
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hilos_clave` (`clave`),
  KEY `idx_hilos_estado` (`estado`)
) ENGINE=InnoDB AUTO_INCREMENT=962 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `import_meta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `import_meta` (
  `id` int NOT NULL,
  `imported_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `source_file` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sheets_json` json DEFAULT NULL,
  `total_rows` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `resumen`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `resumen` (
  `id` int NOT NULL AUTO_INCREMENT,
  `especialidad` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total` int NOT NULL DEFAULT '0',
  `falta_info` int NOT NULL DEFAULT '0',
  `absueltas` int NOT NULL DEFAULT '0',
  `no_absuelta` int NOT NULL DEFAULT '0',
  `en_tramite_sup` int NOT NULL DEFAULT '0',
  `en_tramite_ent` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_resumen_especialidad` (`especialidad`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `usuarios`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rol` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ingeniero',
  `especialidades_json` text COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `must_change_password` tinyint(1) NOT NULL DEFAULT '1',
  `password_changed_at` datetime DEFAULT NULL,
  `creado_en` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `intentos_fallidos` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_username` (`username`),
  KEY `idx_usuarios_rol` (`rol`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `whatsapp_alert_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `whatsapp_alert_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alert_date` date NOT NULL,
  `kind` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_preview` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider_response` text COLLATE utf8mb4_unicode_ci,
  `ok` tinyint(1) NOT NULL DEFAULT '0',
  `sent_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_wa_day_kind_hash` (`alert_date`,`kind`,`payload_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `whatsapp_notif_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `whatsapp_notif_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alert_date` date NOT NULL,
  `kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'plazos',
  `payload_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `message_preview` text COLLATE utf8mb4_unicode_ci,
  `provider_response` text COLLATE utf8mb4_unicode_ci,
  `ok` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_date_kind_hash` (`alert_date`,`kind`,`payload_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

