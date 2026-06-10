-- ============================================================
-- OK.station — Esquema de base de datos (MySQL / MariaDB)
-- Para CloudPanel: crea una base de datos y un usuario, luego
-- importa este archivo (phpMyAdmin → Importar, o vía consola).
--
-- Incluye la tabla usada en la Fase 1 (cuentas) y deja PREPARADAS
-- las tablas de fases siguientes (pedidos, archivos, reseñas) para
-- "vincular todo" sin re-migrar.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ─────────────────────────────────────────────
-- FASE 1 — Cuentas
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name     VARCHAR(120)    NOT NULL,
  
  email         VARCHAR(190)    NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,
  phone         VARCHAR(40)     NOT NULL,
  address       VARCHAR(255)    NULL,
  role          ENUM('cliente','staff','admin') NOT NULL DEFAULT 'cliente',
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64)        NOT NULL,        -- SHA-256 del token (nunca se guarda el token en claro)
  expires_at  TIMESTAMP       NOT NULL,
  used_at     TIMESTAMP       NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pr_user (user_id),
  KEY idx_pr_token (token_hash),
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- FASE 2 — Pedidos de impresión (PREPARADO)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(20)     NOT NULL,       -- folio visible, p.ej. OKS-2026-000123
  status        ENUM('recibido','en_revision','en_produccion','listo','entregado','cancelado')
                                NOT NULL DEFAULT 'recibido',
  comments      TEXT            NULL,
  subtotal      DECIMAL(10,2)   NOT NULL DEFAULT 0,
  tax           DECIMAL(10,2)   NOT NULL DEFAULT 0,
  total         DECIMAL(10,2)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_code (code),
  KEY idx_orders_user (user_id),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_files (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id      BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255)    NOT NULL,
  stored_path   VARCHAR(255)    NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pages         INT UNSIGNED    NOT NULL DEFAULT 0,
  -- Configuración INDEPENDIENTE por archivo (se guarda como JSON para flexibilidad):
  -- { copies, size, custom_w, custom_h, quality, dpi, scale, color_mode,
  --   paper, finishes[], orientation, sides, page_range }
  config_json   JSON            NULL,
  line_total    DECIMAL(10,2)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_of_order (order_id),
  CONSTRAINT fk_of_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- FASE 3 — Reseñas (PREPARADO)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  rating      TINYINT UNSIGNED NOT NULL,        -- 1..5
  comment     TEXT            NOT NULL,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reviews_user (user_id),
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
