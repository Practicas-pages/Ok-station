-- 0019 — Permite guardar documentos de citas de INVITADO (sin sesión).
--
-- CAUSA del HTTP 500 al subir documentos en CITAS (mientras PEDIDOS sí funcionaba):
--   `uploaded_files.user_id` era BIGINT UNSIGNED NOT NULL, pero una cita de
--   invitado inserta user_id = NULL → violaba la restricción NOT NULL →
--   PDOException → 500 (justo después de mover el archivo, antes de registrarlo).
--   Los PEDIDOS nunca fallaban porque exigen sesión (user_id siempre válido).
--
-- SOLUCIÓN: hacer user_id NULLABLE. La llave foránea fk_uf_user se mantiene
--   (las filas con user_id = NULL simplemente omiten la verificación de la FK).
--   La autorización en appointments/file.php usa el user_id de la CITA, no del
--   archivo, así que los documentos de invitado quedan accesibles solo al staff.
SET NAMES utf8mb4;

ALTER TABLE uploaded_files
  MODIFY user_id BIGINT UNSIGNED NULL;
