-- 0017 — Confirmación del cliente por correo (citas y pedidos).
-- El cliente recibe un correo con su TICKET y un botón "Confirmar". Al dar clic
-- (enlace con token único), se marca `client_confirmed_at`. El trabajador SIGUE
-- siendo quien cambia el ESTADO desde el panel (este flag es solo una señal).
-- Cambios ADITIVOS y retrocompatibles: nada existente se modifica.
SET NAMES utf8mb4;

-- ── Citas ──
ALTER TABLE appointments
  ADD COLUMN confirm_token       CHAR(40)  NULL,   -- token secreto del enlace de confirmación
  ADD COLUMN client_confirmed_at TIMESTAMP NULL,   -- cuándo confirmó el cliente desde el correo
  ADD KEY idx_appt_confirm_token (confirm_token);

-- ── Pedidos ──
ALTER TABLE orders
  ADD COLUMN confirm_token       CHAR(40)  NULL,
  ADD COLUMN client_confirmed_at TIMESTAMP NULL,
  ADD KEY idx_order_confirm_token (confirm_token);
