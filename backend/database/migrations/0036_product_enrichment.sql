-- ============================================================================
-- 0036 — Bitácora de enriquecimiento: QUÉ fuente se intentó y CÓMO le fue
-- ----------------------------------------------------------------------------
-- El problema que resuelve, en concreto:
--
-- Cuando Icecat no encontraba un producto, ProductEnricher escribía
-- `products.enriched_at = NOW()` y nada más. Y el runner selecciona candidatos con
-- `WHERE enriched_at IS NULL`. Resultado: un producto que Icecat NO pudo enriquecer
-- queda marcado igual que uno enriquecido con éxito, y NADIE lo vuelve a mirar —
-- ni Icecat más adelante, ni ninguna fuente nueva. Es un callejón sin salida y es
-- justo el que impide agregar una tercera fuente (las páginas de los fabricantes):
-- los productos que más la necesitan son precisamente los que ya están marcados.
--
-- Aquí se registra un renglón por (producto, fuente), así se puede contestar:
--   · ¿Ya le preguntamos a Icecat? ¿Qué dijo?
--   · ¿Al fabricante? ¿Encontró página? ¿Cuál?
--   · ¿Cuándo conviene reintentar?
--   · ¿Qué campos aportó cada quien? (procedencia por campo)
--
-- ADITIVA Y REVERSIBLE: no toca `products` ni `product_images`. `enriched_at` se
-- queda como está para no romper nada; esta tabla lo complementa, no lo sustituye.
-- Para deshacer basta con DROP TABLE product_enrichment.
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_enrichment (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  INT UNSIGNED    NOT NULL,

  -- 'icecat', 'fabricante:3m', 'fabricante:acco'… Texto y no ENUM a propósito:
  -- cada marca nueva sería una migración, y van a ir apareciendo de a poco.
  source      VARCHAR(32)     NOT NULL,

  -- ok           = aportó algo (ver `fields`)
  -- sin_datos    = respondió bien pero no tiene este producto. NO es un error.
  -- error        = falla temporal (red, 429, timeout). Se reintenta.
  -- revision     = encontró algo pero NO se pudo comprobar que sea el mismo
  --                producto. Requiere que una persona lo confirme; jamás se
  --                publica una imagen "parecida" por si acaso.
  -- rechazado    = se comprobó que NO corresponde (otra variante, otro color…).
  status      ENUM('ok','sin_datos','error','revision','rechazado') NOT NULL,

  -- Qué aportó: 'imagen', 'descripcion', 'ficha' o combinación separada por coma.
  -- Es la PROCEDENCIA por campo, que hoy solo existe a medias (product_images.source
  -- es fiable, pero de la descripción no se sabe si la puso Exel o Icecat).
  fields      VARCHAR(80)     NULL,

  source_url  VARCHAR(500)    NULL,   -- de dónde salió, para poder auditarlo después
  match_key   VARCHAR(120)    NULL,   -- con qué se hizo el match (MPN/EAN usado)
  confidence  TINYINT UNSIGNED NULL,  -- 0-100; por debajo del umbral va a revisión
  detail      VARCHAR(255)    NULL,   -- mensaje de error o motivo del rechazo

  tried_at    DATETIME        NOT NULL,
  -- Cuándo tiene sentido volver a preguntar. NULL = no reintentar (sin_datos
  -- definitivo o ya resuelto). Así el reintento es un dato, no una regla escondida
  -- en el código de cada runner.
  retry_after DATETIME        NULL,

  PRIMARY KEY (id),
  -- Un renglón por producto y fuente: el intento nuevo PISA al viejo (UPSERT), que
  -- es lo que interesa. El histórico completo no vale la pena para ~5,000 productos.
  UNIQUE KEY uq_pe_product_source (product_id, source),
  -- Para la cola de trabajo: "dame lo que toca reintentar" y "dame lo que espera
  -- revisión manual" son las dos consultas que se van a hacer todo el tiempo.
  KEY idx_pe_cola (status, retry_after),
  CONSTRAINT fk_pe_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Rescate de los que ya estaban en el callejón ────────────────────────────
-- Los productos con enriched_at puesto ya fueron consultados a Icecat. Se les crea
-- su renglón para no volver a gastarles cuota, PERO distinguiendo el resultado:
--   · Si tiene ficha o foto de Icecat → 'ok', ya aportó.
--   · Si no tiene nada → 'sin_datos', y queda LIBRE para que otra fuente lo tome.
-- Sin este rescate, los ~miles que Icecat no encontró seguirían invisibles para el
-- conector de fabricantes, que es exactamente a quienes debe atender.
-- OJO con retry_after: si se dejara NULL en los 'sin_datos', esos productos
-- seguirían fuera de toda cola y la migración no habría servido de nada — es
-- exactamente el bug que vino a arreglar, reintroducido por la puerta de atrás.
-- Se calcula desde su enriched_at + 30 días, la MISMA política que aplica EnrichLog
-- en caliente: los intentados hace mucho vuelven a la cola de inmediato, los
-- recientes esperan su turno. Los 'ok' sí quedan en NULL: ya aportaron.
INSERT IGNORE INTO product_enrichment (product_id, source, status, fields, tried_at, retry_after)
SELECT p.id,
       'icecat',
       CASE WHEN aporto.si = 1 THEN 'ok' ELSE 'sin_datos' END,
       CASE WHEN p.specs_json IS NOT NULL THEN 'ficha' ELSE NULL END,
       COALESCE(p.enriched_at, NOW()),
       CASE WHEN aporto.si = 1 THEN NULL
            ELSE DATE_ADD(COALESCE(p.enriched_at, NOW()), INTERVAL 30 DAY) END
  FROM products p
  JOIN (SELECT p2.id,
               (p2.specs_json IS NOT NULL
                OR EXISTS (SELECT 1 FROM product_images i
                            WHERE i.product_id = p2.id AND i.source = 'icecat')) AS si
          FROM products p2) AS aporto ON aporto.id = p.id
 WHERE p.enriched_at IS NOT NULL;
