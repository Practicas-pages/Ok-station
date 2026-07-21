-- "Avísame cuando llegue" (junta 21-jul-2026): el cliente deja su correo en un
-- producto agotado y el SISTEMA le avisa solo cuando el sync de Exel le devuelva
-- existencia (antes ese aviso era manual, por WhatsApp).
-- notified_at NULL = pendiente; con fecha = ya avisado (no se repite).
CREATE TABLE IF NOT EXISTS stock_alerts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NULL,
  email       VARCHAR(190) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alert (product_id, email),
  KEY idx_pending (product_id, notified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
