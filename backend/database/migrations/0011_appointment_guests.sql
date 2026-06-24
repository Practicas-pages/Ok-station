-- 0011 — Citas: datos de CADA persona que asistirá (requisitos por persona).
-- Se guarda un JSON con [{name, dob, doctype}] por cita. doctype solo aplica a
-- pasaporte/visa/sentri: primera | renov_con | renov_sin. Cambio ADITIVO y
-- retrocompatible: el código detecta si la columna existe (table_has_column) y
-- funciona aunque esta migración aún no se haya corrido.
SET NAMES utf8mb4;

ALTER TABLE appointments
  ADD COLUMN guests_json TEXT NULL AFTER party_size;
