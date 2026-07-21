-- Correo de contacto del pedido de tienda (junta 21-jul-2026):
-- el cliente puede pedir que los avisos de SU COMPRA lleguen a un correo distinto
-- al de su cuenta (p. ej. compra la oficina con la cuenta del dueño). NULL = usar
-- el correo de la cuenta, que es el comportamiento de siempre.
ALTER TABLE shop_orders
  ADD COLUMN contact_email VARCHAR(190) NULL DEFAULT NULL AFTER contact_phone;
