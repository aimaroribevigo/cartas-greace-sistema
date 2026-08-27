-- Esquema SistemaGreace — Control de Cartas (Excel HLP)
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS cartas (
    id INT NOT NULL AUTO_INCREMENT,
    bandeja VARCHAR(40) NOT NULL,
    sentido VARCHAR(20) NOT NULL DEFAULT 'emitida',
    n_orden INT NULL,
    fecha DATE NULL,
    n_documento VARCHAR(255) NOT NULL,
    tipo_documento VARCHAR(80) NULL,
    asunto TEXT NULL,
    especialidad VARCHAR(255) NULL,
    especialidad_norm VARCHAR(120) NULL,
    estado VARCHAR(120) NULL,
    estado_norm VARCHAR(120) NULL,
    referencias TEXT NULL,
    referencia VARCHAR(255) NULL,
    folios VARCHAR(50) NULL,
    cd VARCHAR(20) NULL,
    dirigido_a VARCHAR(255) NULL,
    receptor VARCHAR(255) NULL,
    cargo VARCHAR(255) NULL,
    observacion TEXT NULL,
    area VARCHAR(255) NULL,
    empresa VARCHAR(255) NULL,
    caducidad VARCHAR(20) NULL,
    fecha_respuesta DATE NULL,
    carta_respuesta VARCHAR(255) NULL,
    hilo_id INT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_cartas_bandeja (bandeja),
    KEY idx_cartas_estado (estado_norm),
    KEY idx_cartas_esp (especialidad_norm),
    KEY idx_cartas_fecha (fecha),
    KEY idx_cartas_doc (n_documento),
    KEY idx_cartas_hilo (hilo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hilos_clave (clave),
    KEY idx_hilos_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_alert_log (
    id INT NOT NULL AUTO_INCREMENT,
    alert_date DATE NOT NULL,
    kind VARCHAR(40) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    message_preview VARCHAR(500) NULL,
    provider_response TEXT NULL,
    ok TINYINT(1) NOT NULL DEFAULT 0,
    sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_wa_day_kind_hash (alert_date, kind, payload_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT NOT NULL AUTO_INCREMENT,
    username VARCHAR(80) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    rol VARCHAR(40) NOT NULL DEFAULT 'ingeniero',
    especialidades_json TEXT NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    must_change_password TINYINT(1) NOT NULL DEFAULT 1,
    password_changed_at DATETIME NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_username (username),
    KEY idx_usuarios_rol (rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Legado (seed consultas) — se mantiene por compatibilidad temporal
CREATE TABLE IF NOT EXISTS consultas (
    id INT NOT NULL AUTO_INCREMENT,
    n_consulta INT NOT NULL,
    especialidad VARCHAR(255) NOT NULL,
    ruta_critica VARCHAR(50) NULL,
    ampl_plazo VARCHAR(50) NULL,
    adicional_obra VARCHAR(50) NULL,
    consulta_desc TEXT NULL,
    asiento_n VARCHAR(100) NULL,
    fecha_contratista VARCHAR(50) NULL,
    carta_informe_n VARCHAR(100) NULL,
    plazo_absolucion_elevacion VARCHAR(50) NULL,
    carta_sup_n VARCHAR(150) NULL,
    fecha_real_sup VARCHAR(50) NULL,
    respuesta_supervision VARCHAR(150) NULL,
    plazo_max_absolucion VARCHAR(50) NULL,
    carta_ent_n VARCHAR(100) NULL,
    fecha_real_ent VARCHAR(50) NULL,
    respuesta_entidad TEXT NULL,
    fecha_limite_aprobacion VARCHAR(50) NULL,
    fecha_real_aprobacion VARCHAR(50) NULL,
    estatus_aprobacion VARCHAR(50) NULL,
    estado_consulta VARCHAR(255) NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS resumen (
    id INT NOT NULL AUTO_INCREMENT,
    especialidad VARCHAR(255) NOT NULL,
    total INT NOT NULL DEFAULT 0,
    falta_info INT NOT NULL DEFAULT 0,
    absueltas INT NOT NULL DEFAULT 0,
    no_absuelta INT NOT NULL DEFAULT 0,
    en_tramite_sup INT NOT NULL DEFAULT 0,
    en_tramite_ent INT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_resumen_especialidad (especialidad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
