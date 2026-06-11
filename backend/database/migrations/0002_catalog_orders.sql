-- 0002 — Catálogo y pedidos (categories, services, orders, uploaded_files, order_items)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug       VARCHAR(60)  NOT NULL,
  name       VARCHAR(120) NOT NULL,
  sort_order INT          NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cat_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  category_id  INT UNSIGNED  NULL,
  name         VARCHAR(140)  NOT NULL,
  description  VARCHAR(400)  NULL,
  base_price   DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit         VARCHAR(40)   NOT NULL DEFAULT 'pieza',
  options_json JSON          NULL,
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_services_cat (category_id),
  KEY idx_services_active (is_active),
  CONSTRAINT fk_services_cat FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  code        VARCHAR(20)     NOT NULL,
  status      ENUM('recibido','en_revision','en_produccion','listo','entregado','cancelado') NOT NULL DEFAULT 'recibido',
  comments    TEXT            NULL,
  staff_notes TEXT            NULL,
  subtotal    DECIMAL(10,2)   NOT NULL DEFAULT 0,
  tax         DECIMAL(10,2)   NOT NULL DEFAULT 0,
  total       DECIMAL(10,2)   NOT NULL DEFAULT 0,
  ticket_path VARCHAR(255)    NULL,                 -- ruta del ticket PDF generado
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_code (code),
  KEY idx_orders_user (user_id),
  KEY idx_orders_status (status),
  KEY idx_orders_created (created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS uploaded_files (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  original_name VARCHAR(255)    NOT NULL,
  stored_path   VARCHAR(255)    NOT NULL,
  mime_type     VARCHAR(100)    NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pages         INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_uf_user (user_id),
  CONSTRAINT fk_uf_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id         BIGINT UNSIGNED NOT NULL,
  service_id       INT UNSIGNED    NULL,
  uploaded_file_id BIGINT UNSIGNED NULL,
  config_json      JSON            NULL,            -- config independiente por archivo
  qty              INT UNSIGNED    NOT NULL DEFAULT 1,
  unit_price       DECIMAL(10,2)   NOT NULL DEFAULT 0,
  line_total       DECIMAL(10,2)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_oi_order (order_id),
  KEY idx_oi_service (service_id),
  KEY idx_oi_file (uploaded_file_id),
  CONSTRAINT fk_oi_order   FOREIGN KEY (order_id)         REFERENCES orders(id)          ON DELETE CASCADE,
  CONSTRAINT fk_oi_service FOREIGN KEY (service_id)       REFERENCES services(id)        ON DELETE SET NULL,
  CONSTRAINT fk_oi_file    FOREIGN KEY (uploaded_file_id) REFERENCES uploaded_files(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
