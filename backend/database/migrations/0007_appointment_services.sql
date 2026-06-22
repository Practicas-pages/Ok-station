-- 0007 — Citas: subtipo de pasaporte + cantidad de personas + servicios adicionales.
-- Modelo: cada cita tiene UN servicio principal (tramite, los 4 de siempre) y, opcionalmente,
-- uno o más servicios adicionales (CURP, INE, licencia, apostille, médica) como complementos.
-- Cambios ADITIVOS y retrocompatibles (columnas nuevas nullable / con default).
SET NAMES utf8mb4;

-- Subtipo (solo aplica a pasaporte): mexicano | americano. NULL para los demás.
ALTER TABLE appointments
  ADD COLUMN passport_subtype ENUM('mexicano','americano') NULL AFTER tramite;

-- Cantidad de personas de la cita (mínimo 1). Default 1 = "Solo yo".
ALTER TABLE appointments
  ADD COLUMN party_size TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER passport_subtype;

-- Servicios adicionales (complementos opcionales), como arreglo JSON de slugs.
-- Ej: ["curp","ine"]. NULL o [] si no se eligió ninguno.
ALTER TABLE appointments
  ADD COLUMN additional_services TEXT NULL AFTER party_size;
