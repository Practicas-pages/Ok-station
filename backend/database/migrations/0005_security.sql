-- 0005 — Seguridad: control de intentos de inicio de sesión (anti fuerza bruta)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip           VARCHAR(45)     NOT NULL,
  email        VARCHAR(190)    NOT NULL,
  attempts     INT UNSIGNED    NOT NULL DEFAULT 0,
  locked_until TIMESTAMP       NULL,
  updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_ip_email (ip, email),
  KEY idx_attempt_locked (locked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
