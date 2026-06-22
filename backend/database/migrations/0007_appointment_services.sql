-- 0007 — Citas: ampliar catálogo de servicios + subtipo de pasaporte + cantidad de personas.
-- Cada servicio es INDEPENDIENTE: una cita = UN servicio (igual que pasaporte/visa/sentri/i94).
-- El panel "Más servicios" solo agrega más opciones del mismo grupo (no son complementos).
-- Cambios ADITIVOS y retrocompatibles.
SET NAMES utf8mb4;

-- 1) Catálogo completo de servicios agendables (9). Antes: solo los 4 primeros.
ALTER TABLE appointments
  MODIFY tramite ENUM(
    'pasaporte','visa','sentri','i94',
    'curp','ine','licencia','apostille','medica'
  ) NOT NULL;

-- 2) Subtipo (solo aplica a pasaporte): mexicano | americano. NULL para los demás.
ALTER TABLE appointments
  ADD COLUMN passport_subtype ENUM('mexicano','americano') NULL AFTER tramite;

-- 3) Cantidad de personas de la cita (mínimo 1). Default 1 = "Solo yo".
ALTER TABLE appointments
  ADD COLUMN party_size TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER passport_subtype;
