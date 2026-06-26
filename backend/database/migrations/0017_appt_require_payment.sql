-- 0017 — Trámites que EXIGEN anticipo del 100% para confirmar la cita.
-- Por defecto: visa y pasaporte. Editable desde el panel (settings appt.require_payment).
-- Una cita de estos trámites no puede pasar a 'confirmada' sin payment_status='pagado'
-- (se impone en backend/api/admin/appointment-status.php). Cambio ADITIVO.
SET NAMES utf8mb4;

INSERT INTO settings (`key`, `value`) VALUES
  ('appt.require_payment', '["visa","pasaporte"]')
ON DUPLICATE KEY UPDATE `value` = `value`;
