# Conectar el catálogo real (Exel del Norte)

La tienda se alimenta de la tabla `products`, que llena el runner del proveedor **Exel**.
Todo el código ya está listo. **Lo único que falta es pegar la API key de Exel.**

---

## Pasos (cuando tengan la key)

1. Abre `backend/.env` y pega la key en la línea que ya está preparada:

   ```
   EXEL_API_KEY=          ← pega aquí la key de Exel
   ```

   (Las otras dos líneas ya vienen con los valores por defecto correctos:
   `EXEL_API_BASE=https://api01.exeldelnorte.com.mx` y `EXEL_WAREHOUSE=4`.)

2. Corre estos dos comandos desde la carpeta del proyecto:

   ```bash
   php backend/tools/exel-sync.php        # jala el catálogo real de Exel → BD
   php backend/tools/icecat-enrich.php    # les pone fotos y ficha técnica (Icecat)
   ```

Con eso el catálogo real queda vivo en la tienda. 🎉

> Solo entra **papelería** (decisión de negocio, junta 2026-07-14). Cómputo/accesorios se descartan.
> Prueba sin tocar nada: `php backend/tools/exel-sync.php --dry-run` (reporta, no escribe).
> Feed de prueba sin key: `php backend/tools/exel-sync.php --file=backend/tools/sample-exel-feed.json`

---

## ⚠️ En Windows / local: certificados SSL (falla EN SILENCIO)

Si al pegar la key el runner dice **"0 productos"** o Icecat reporta **"no está en Icecat"**,
casi seguro **NO es la key**: es que el PHP de Laragon no trae el bundle de certificados y
las llamadas HTTPS (Exel/Icecat/Mercado Pago) fallan sin avisar (`errno 60`).

Arréglalo **una sola vez** en `php.ini` de Laragon
(`C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.ini`), descomentando y apuntando:

```
curl.cainfo = "C:\laragon\etc\ssl\cacert.pem"
openssl.cafile="C:\laragon\etc\ssl\cacert.pem"
```

Reinicia el servidor. En el servidor Linux de producción esto **no pasa**.

---

## Notas

- `backend/.env` es **local y gitignored**. En producción, la key va en el `.env` del
  servidor (mismo procedimiento: pegar la key y correr los 2 comandos).
- **`.env` NO se comparte ni se sube al repo** (trae credenciales).
- Para tener el catálogo siempre fresco en producción, conviene un **cron diario** que
  corra `exel-sync.php` (ver `deploy/PRODUCCION.md`).

## Para VENDER de verdad (más allá del catálogo)

Con la key de Exel el catálogo real queda navegable. Para cobrar y notificar pedidos,
además faltan (las consigue el dueño y van en el `.env`):

- **Pagos:** `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` (Mercado Pago).
- **Correos:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` (confirmaciones de pedido).
