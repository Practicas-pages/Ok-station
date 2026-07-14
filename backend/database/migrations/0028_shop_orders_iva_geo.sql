-- 0028 — IVA por geolocalización en los pedidos de tienda.
-- Guarda la tasa de IVA aplicada y el estado de entrega, para auditoría fiscal
-- (Baja California = 8% frontera; resto del país = 16%). Aditivo, no rompe nada.
ALTER TABLE shop_orders
  ADD COLUMN iva_rate   DECIMAL(5,4) NOT NULL DEFAULT 0.0800 AFTER tax,
  ADD COLUMN ship_state VARCHAR(60)  NULL                    AFTER ship_address;
