-- 0026 — Agrega 'acta' (Acta de Nacimiento) al ENUM de trámites de citas.
-- La columna appointments.tramite es un ENUM; sin el valor 'acta', el INSERT de una
-- cita de acta fallaba (la transacción hacía rollback y el cliente veía
-- "No se pudo registrar la cita. Inténtalo de nuevo."). Acta ya es un trámite propio
-- con precio por estado (ver migración 0025 y Pricing.php).
-- Idempotente: reescribe el ENUM completo con todos los trámites vigentes.
SET NAMES utf8mb4;

ALTER TABLE appointments
  MODIFY tramite ENUM(
    'pasaporte','visa','sentri','i94',
    'curp','acta','ine','licencia','apostille','medica'
  ) NOT NULL;
