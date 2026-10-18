# Operación segura

## Antes del despliegue

1. Copia `backend/.env.production.example` como `backend/.env.production` fuera de Git.
2. Configura secretos distintos de 32+ caracteres para `AUTH_SECRET` y `OAUTH_TOKEN_ENCRYPTION_KEY`.
3. Ejecuta `pg_dump` y guarda una restauración comprobada antes de `npm run db:migrate:prod`.
4. Verifica que Certbot haya creado los certificados de `agent.saberoconsulting.com` antes de levantar el Compose de producción.

## Corte y rollback

Detén los servicios que procesan mensajes, crea un backup, ejecuta la migración y levanta la nueva imagen. Conserva la imagen anterior y la clave OAuth anterior hasta comprobar login, Google, WhatsApp y Calendar. Para volver atrás, detén la nueva imagen, restaura el backup si hubo una migración incompatible y levanta la imagen anterior con su configuración previa.

## Secretos

Nunca copies `.env` al repositorio ni a logs. Rota `AUTH_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY`, Meta y Google mediante una ventana de mantenimiento. La clave OAuth es obligatoria: no se acepta `DATABASE_URL` como sustituto.
