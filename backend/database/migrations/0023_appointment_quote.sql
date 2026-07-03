-- 0023 — Citas: cotización (anticipo a fijar por la trabajadora).
-- `needs_quote` marca una cita cuyo trámite NO tiene precio fijo en el catálogo
-- (p. ej. apostille, cita médica): queda "por cotizar". `quoted_at` guarda cuándo
-- la trabajadora fijó el anticipo desde el panel (y avisó al cliente por correo).
-- Espejo de orders (migración 0022). Aditiva y retrocompatible (table_has_column).
-- Rollback: ALTER TABLE appointments DROP COLUMN needs_quote, DROP COLUMN quoted_at;
SET NAMES utf8mb4;

ALTER TABLE appointments
  ADD COLUMN needs_quote TINYINT(1) NOT NULL DEFAULT 0    AFTER amount_total,
  ADD COLUMN quoted_at   TIMESTAMP  NULL     DEFAULT NULL AFTER needs_quote;
