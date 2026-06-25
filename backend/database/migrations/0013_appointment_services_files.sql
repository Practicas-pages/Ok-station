-- 0013 — Citas: servicios adicionales (venta cruzada) y documentos subidos por el cliente.
-- Cambios ADITIVOS y retrocompatibles: el código usa table_has_column y detecta la
-- tabla appointment_files; funciona aunque esta migración aún no se haya corrido.
SET NAMES utf8mb4;

-- Servicios adicionales que el cliente marcó en el wizard: JSON [{key, label}].
ALTER TABLE appointments
  ADD COLUMN services_json TEXT NULL AFTER guests_json;

-- Documentos que el cliente adjunta a su cita. Reutiliza uploaded_files para el
-- almacenamiento real (ruta, mime, tamaño) y enlaza cada archivo con su cita y el
-- tipo de documento (doc_key/doc_label, p. ej. acta / "Acta de nacimiento").
CREATE TABLE IF NOT EXISTS appointment_files (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id   BIGINT UNSIGNED NOT NULL,
  uploaded_file_id BIGINT UNSIGNED NOT NULL,
  doc_key          VARCHAR(40)  NOT NULL,
  doc_label        VARCHAR(120) NOT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_apptfile_appt (appointment_id),
  KEY idx_apptfile_file (uploaded_file_id),
  CONSTRAINT fk_apptfile_appt FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_apptfile_file FOREIGN KEY (uploaded_file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
