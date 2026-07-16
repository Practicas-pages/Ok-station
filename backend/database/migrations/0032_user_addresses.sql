-- 0032 — Libreta de direcciones del cliente (varias por cuenta, una predeterminada).
-- La tienda la usa para "Entrega en {ciudad} {CP}" en su barra y para el envío del
-- pedido. users.address se queda como estaba (texto libre heredado de pedidos/citas):
-- NO se toca para no romper lo existente; esta tabla es la fuente ESTRUCTURADA.
-- Campos pensados para entregar de verdad en México: la colonia es indispensable
-- (no se deduce del CP sin un catálogo SEPOMEX, que no tenemos).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS user_addresses (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,            -- users.id es BIGINT UNSIGNED

  -- ── Quién recibe ──
  recipient    VARCHAR(160) NOT NULL,               -- puede no ser el titular de la cuenta
  phone        VARCHAR(40)  NOT NULL,               -- el repartidor lo usa al llegar

  -- ── Domicilio ──
  street       VARCHAR(200) NOT NULL,               -- calle
  ext_num      VARCHAR(30)  NOT NULL,               -- número exterior
  int_num      VARCHAR(30)  NULL,                   -- interior / depto (opcional)
  neighborhood VARCHAR(160) NOT NULL,               -- colonia
  city         VARCHAR(120) NOT NULL,
  state        VARCHAR(60)  NOT NULL,               -- decide el IVA (8% en BC, 16% resto)
  postal_code  VARCHAR(5)   NOT NULL,               -- CP mexicano: 5 dígitos

  -- ── Ayuda para entregar ──
  notes        VARCHAR(255) NULL,                   -- "casa azul, portón negro, entre X y Y"

  is_default   TINYINT(1)   NOT NULL DEFAULT 0,     -- la que se propone en el checkout
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_ua_user (user_id),
  KEY idx_ua_default (user_id, is_default),         -- buscar "la predeterminada de X"
  KEY idx_ua_postal (postal_code),                  -- a futuro: tarifas de envío por zona
  CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nota: "solo una predeterminada por usuario" se garantiza en el CÓDIGO (transacción
-- que pone is_default=0 al resto antes de marcar la nueva). MySQL no permite un
-- UNIQUE parcial (WHERE is_default=1), y un UNIQUE(user_id,is_default) impediría
-- tener dos direcciones NO predeterminadas.
