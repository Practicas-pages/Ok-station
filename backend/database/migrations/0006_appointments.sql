-- 0006 — Citas (appointments): reservación en el servidor + disponibilidad por día y hora.
-- Reemplaza el flujo de WhatsApp. La disponibilidad se valida en el servidor.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS appointments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(20)     NOT NULL,
  user_id       BIGINT UNSIGNED NULL,                 -- cuenta asociada (si reservó con sesión)
  tramite       ENUM('pasaporte','visa','sentri','i94') NOT NULL,
  appt_date     DATE            NOT NULL,
  appt_time     TIME            NOT NULL,
  status        ENUM('pendiente','confirmada','cancelada','completada','no_show')
                               NOT NULL DEFAULT 'pendiente',
  contact_name  VARCHAR(120)    NOT NULL,
  contact_phone VARCHAR(40)     NOT NULL,
  contact_email VARCHAR(190)    NULL,
  contact_pref  ENUM('whatsapp','llamada','correo') NULL,
  notes         TEXT            NULL,                 -- notas del cliente
  staff_notes   TEXT            NULL,                 -- notas internas (no visibles al cliente)
  created_ip    VARCHAR(45)     NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_appt_code (code),
  KEY idx_appt_user (user_id),
  KEY idx_appt_date (appt_date),
  KEY idx_appt_status (status),
  KEY idx_appt_slot (appt_date, appt_time),
  CONSTRAINT fk_appt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────── Permisos de citas ───────────
INSERT INTO permissions (slug, name) VALUES
  ('appointments.view','Ver citas'),
  ('appointments.update_status','Actualizar estado de citas'),
  ('appointments.manage','Gestionar disponibilidad de citas')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Empleado: ver citas y cambiar su estado.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug='empleado'
  AND p.slug IN ('appointments.view','appointments.update_status')
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Administrador: todos los permisos (incluye los nuevos).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.slug='administrador'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- ─────────── Configuración de disponibilidad (editable desde el panel) ───────────
-- weekly_hours: claves 0=Dom .. 6=Sáb, cada una con las horas disponibles (HH:MM).
-- Por defecto: L–V 09–13 y 16–18, Sáb 09–13, Dom cerrado.
INSERT INTO settings (`key`, `value`) VALUES
  ('appt.weekly_hours','{"0":[],"1":["09:00","10:00","11:00","12:00","13:00","16:00","17:00","18:00"],"2":["09:00","10:00","11:00","12:00","13:00","16:00","17:00","18:00"],"3":["09:00","10:00","11:00","12:00","13:00","16:00","17:00","18:00"],"4":["09:00","10:00","11:00","12:00","13:00","16:00","17:00","18:00"],"5":["09:00","10:00","11:00","12:00","13:00","16:00","17:00","18:00"],"6":["09:00","10:00","11:00","12:00","13:00"]}'),
  ('appt.capacity','2'),
  ('appt.blackout_dates','[]'),
  ('appt.max_advance_days','60')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
