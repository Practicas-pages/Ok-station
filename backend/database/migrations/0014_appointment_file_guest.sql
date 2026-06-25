-- 0014 — Citas: documentos POR PERSONA.
-- Cada archivo subido se etiqueta con la persona de la cita a la que pertenece
-- (guest_index = posición 0..N-1 dentro de appointments.guests_json, y guest_name
-- para lectura rápida en el panel). Cambios ADITIVOS y retrocompatibles: el código
-- usa table_has_column, así que funciona aunque esta migración aún no se haya corrido.
SET NAMES utf8mb4;

-- Persona (dentro de la cita) a la que pertenece el documento.
ALTER TABLE appointment_files
  ADD COLUMN guest_index TINYINT UNSIGNED NULL AFTER appointment_id,
  ADD COLUMN guest_name  VARCHAR(120)     NULL AFTER guest_index;

-- Permitir documentos de citas SIN sesión (invitados): uploaded_files.user_id
-- pasa a aceptar NULL. La cita la pueden crear invitados (appointments.user_id NULL),
-- así que sus archivos no siempre tienen un usuario asociado.
ALTER TABLE uploaded_files
  MODIFY COLUMN user_id BIGINT UNSIGNED NULL;
