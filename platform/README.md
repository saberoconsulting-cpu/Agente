# Plataforma de empresas, agente y CRM

Implementación inicial para vender el agente general, el CRM inmobiliario o ambos.
El registro público, la identidad única de usuarios y la doble autorización quedan a cargo
del equipo de autenticación. Los accesos actuales de cada producto siguen funcionando;
todavía no hay inicio de sesión único entre ellos.

## Entorno local del equipo

Con Docker Desktop iniciado y las dependencias de ambos repositorios instaladas, ejecutar
desde `AGENT-AI/platform`:

```sh
npm run local:up
npm run local:check
npm run local:smoke
# Después de guardar un token válido de Meta en backend/.env:
npm run local:whatsapp
# Después de cambiar código de los backends:
npm run local:restart
# Detener conservando las bases y sus volúmenes:
npm run local:down
```

El arranque crea una empresa de desarrollo `sabero` con ambos productos, aplica las migraciones
completas y crea los administradores locales a partir de `ADMIN_EMAIL`/`ADMIN_PASSWORD` del
agente. Los accesos de ambos productos son separados y usan esas mismas credenciales locales.
Los frontends se ejecutan en desarrollo y recargan sus cambios automáticamente.

| Servicio | Dirección local |
| --- | --- |
| Agente | `http://127.0.0.1:5173` |
| CRM | `http://127.0.0.1:5174` |
| API agente | `http://127.0.0.1:3001/api/v1` |
| API CRM | `http://127.0.0.1:3002/api` |
| Plataforma privada | `http://127.0.0.1:3010` |
| PostgreSQL | `127.0.0.1:55432` |
| MongoDB | `127.0.0.1:57017` |

Este entorno usa PostgreSQL 17 Alpine con pgvector compilado y MongoDB 7 para aprovechar las
imágenes locales; el despliegue base sigue usando MongoDB 8. Los datos locales se conservan en
volúmenes Docker. No se copian ni modifican las bases remotas. Antes de actualizar los `.env`
locales se conserva una copia `.env.before-platform-local`; `.env.production` no se modifica.
Los secretos, registros y PID locales quedan en `platform/generated/local`, excluido de Git.

`local:smoke` comprueba pgvector, migraciones, sincronización del contacto e historial MongoDB
consultado desde el CRM. Crea registros temporales exclusivamente en la base local, espera el
ciclo de sincronización y los elimina. No llama a WhatsApp ni al proveedor de IA.

Para recibir webhooks públicos de Meta o probar OAuth fuera del flujo local, el equipo deberá
configurar un túnel HTTPS y sus callback URI. El arranque local no publica servicios en el VPS.
`local:whatsapp` valida el token mediante una consulta de solo lectura y guarda la conexión
cifrada para la empresa local. No cambia la suscripción de la aplicación de Meta ni envía mensajes.

## Distribución de los datos

- PostgreSQL central: empresa, sector, estado, productos habilitados y credenciales de servicio.
- Un PostgreSQL **database** por empresa, con un rol propio sin privilegios de administración.
  El agente utiliza el esquema `agent`, el CRM utiliza `public` y los contactos comunes utilizan
  `platform`. Prisma y TypeORM tienen historiales de migración separados.
- Una base MongoDB por empresa: mensajes entrantes y salientes y eventos originales del canal.
  Solo la plataforma recibe las credenciales de MongoDB. Los productos acceden mediante su API privada.
- Adjuntos: conservar almacenamiento externo; no guardar binarios dentro de los mensajes.

La primera versión despliega procesos/contenedores separados por empresa y producto.
Es una decisión de aislamiento: las consultas actuales del CRM y las consultas SQL directas
del agente utilizan una conexión fija. No se selecciona una base mediante un encabezado público.
Un único servicio central permite acceder únicamente a la empresa y al producto de la credencial.
Los contenedores comparten VPS, pero consumen memoria por separado. Medir antes de dimensionar;
no es un despliegue optimizado para miles de empresas. El registro central permite distribuir
empresas entre servidores más adelante, sin cambiar sus identificadores.

## Preparación

Requiere Node 22+, PostgreSQL 17 con pgvector, MongoDB 8 y dependencias instaladas en
`AGENT-AI/backend`, `crm_inmobiliario/backend` y esta carpeta. Mantener ambos repositorios como
carpetas hermanas, o ajustar las rutas del administrador.

1. Copiar `.env.example` a `.env` y generar `PLATFORM_ENCRYPTION_KEY`. Conservar esa clave en
   el gestor de secretos y en el plan de recuperación: cifra las conexiones empresariales.
2. Crear la base `sabero_control` y un usuario propietario para ejecutar `npm run admin -- init`.
3. Usar una conexión administrativa **solo en la CLI** mediante `PROVISION_DATABASE_URL`.
   El proceso HTTP no debe recibirla.
4. Crear un rol de ejecución central con permiso `CONNECT` a `sabero_control`, `USAGE` sobre
   `public` y `SELECT` sobre `platform_companies`, `platform_products` y
   `platform_service_credentials`. No necesita permiso para crear empresas o activar productos.
5. Copiar `.env.runtime.example` a `.env.runtime`, con hosts internos y el rol de ejecución.
   No publicar el puerto 3010 en Internet; es una API para servidores.

El archivo `compose.yml` sirve como base para infraestructura en un VPS nuevo. No ejecutarlo
sobre instalaciones existentes sin revisar puertos y volúmenes. Necesita `POSTGRES_PASSWORD`,
`MONGO_PASSWORD` y credenciales coherentes con los archivos de entorno. No crea automáticamente
el rol de ejecución. PostgreSQL y MongoDB quedan publicados solo en loopback para administración.

## Empresa nueva y activación posterior

Desde esta carpeta:

```sh
npm ci
npm run admin -- init
npm run admin -- create empresa-juan "Inmobiliaria de Juan" real-estate
npm run admin -- activate empresa-juan agent
# Cuando contrate el CRM:
npm run admin -- activate empresa-juan crm
```

Una empresa de cualquier sector puede contratar el agente. El CRM exige sector `real-estate`.
Activar un producto aplica sus migraciones en **la misma base empresarial**, conserva contactos
y mantiene los tokens y las opciones existentes en los archivos generados. El estado de producto
solo pasa a activo cuando su migración finaliza. El aprovisionamiento fallido se conserva para
diagnóstico; no se borra una base parcialmente creada. Resolver el fallo antes de reintentar;
no reactivar manualmente una empresa incompleta.

Se generan `generated/empresa-juan/compose.json`, `agent.env`, `crm.env` y una configuración
Nginx de referencia. Los entornos contienen secretos y están excluidos de Git.

Antes de iniciar los contenedores:

- Completar Meta, Google, proveedor de IA, dominios y almacenamiento en los entornos del producto.
  El agente valida claves obligatorias al arrancar. Configurar `WEBHOOK_SIGNATURE_REQUIRED=true`.
- Usar un webhook de Meta distinto por empresa, dirigido al backend de su agente. Un número
  desconocido se rechaza en modo administrado; no cae en las credenciales de otra empresa.
- Crear los usuarios mediante el procedimiento del equipo de autenticación o la CLI existente
  del agente para pruebas internas. No se crean usuarios ni proyectos de demostración en el CRM.
- Configurar DNS, TLS y proxy. El ejemplo Nginx es HTTP interno: integrarlo con el proxy TLS
  existente conectado a la red `sabero`. Las rutas `/api/` deben llegar directamente al backend;
  así los frontends existentes pueden utilizar el mismo origen. La plataforma central no se expone.
- Revisar `FRONTEND_URL` y los redirect URI de OAuth para cada dominio.

```sh
docker compose -f generated/empresa-juan/compose.json up -d --build
```

Este comando no se ha ejecutado como parte del cambio. No se modifican bases ni `.env.production`
existentes. Para adaptar datos anteriores se requiere una migración explícita con respaldo;
crear una empresa nueva no importa automáticamente los datos del despliegue anterior.

## Comunicación y soporte

Los contactos se enlazan por teléfono internacional normalizado; nunca por nombre. No se
fusionan teléfonos ambiguos. El CRM administra nombre, correo y teléfono cuando ya está enlazado;
el agente aporta contactos nuevos y completa campos faltantes. Una colisión de identidad
produce conflicto y requiere revisión, en vez de fusionar personas silenciosamente.

Los triggers de cada producto escriben una cola persistente de cambios de contacto dentro de
la transacción local. Los adaptadores procesan hasta 100 cambios cada 60 segundos y confirman
solo la versión sincronizada. Los cambios recibidos pendientes se conservan en
`platform.contact_inbox`. Una caída se reintenta sin recrear la empresa o duplicar el contacto.
Los contactos importados al CRM quedan sin asesor para que un administrador los asigne.
No se sincronizan eliminaciones; deben resolverse mediante una política de archivado posterior.
Los contactos que fallan quedan pendientes: revisar y corregir los conflictos antes de que
ocupen un lote completo. Esta primera versión no incluye una consola de resolución de conflictos.

Consultas de soporte dentro de una base empresarial:

```sql
SELECT product, count(*) FROM platform.contact_outbox GROUP BY product;
SELECT product, count(*) FROM platform.contact_inbox GROUP BY product;
```

La API privada requiere `Authorization: Bearer <token de servicio>` y `X-Company-Id`:

| Endpoint | Uso |
| --- | --- |
| `GET /v1/company` | Estado y productos de la empresa autenticada |
| `POST /v1/contacts` | Enlazar o actualizar el contacto del producto autenticado |
| `GET /v1/contacts` | Listado para soporte con cursor `after` |
| `GET /v1/contact-inbox` | Cambios de contactos pendientes para el producto |
| `POST /v1/contact-inbox/ack` | Confirmación por ID y versión |
| `POST /v1/messages` | Guardar mensaje; exclusivo del agente |
| `GET /v1/messages` | Historial por conversación con cursor |
| `GET /v1/contact-messages` | Historial del contacto enlazado |
| `POST /v1/messages/summary` | Conteo y última fecha, con filtro de dirección |

Los mensajes usan índices por conversación/fecha/ID y unicidad del identificador del proveedor
dentro de la base de cada empresa. La paginación ordena también por ID para no perder mensajes
con la misma fecha. El agente consulta MongoDB para la ventana de 24 horas de WhatsApp.
Su endpoint anterior conserva el formato de lista; `/api/v1/conversations/:id/messages/page`
devuelve además `next_cursor`. El CRM ofrece `/api/clients/:id/messages`, con el mismo control
de permisos que la ficha del cliente. No se ha añadido una pantalla nueva de historial al CRM.

Suspender una empresa:

```sh
npm run admin -- suspend empresa-juan
npm run admin -- resume empresa-juan
```

La API central rechaza sus tokens inmediatamente. Los backends administrados comprueban
habilitación antes de servir solicitudes y enviar WhatsApp. También detener los contenedores
si se necesita detener cualquier tarea local o sesión WebSocket ya abierta.

Respaldar fuera del VPS: PostgreSQL central, cada base empresarial, cada base MongoDB,
adjuntos y secretos. Separar una base por cliente permite restaurarla individualmente, pero
no sustituye los límites de CPU/disco ni proporciona alta disponibilidad del VPS.

## Contrato para el equipo de autenticación

La futura cuenta común debe resolver `subject`, empresa, membresía y roles desde una identidad
validada. La activación comercial no debe depender de un `company_id` enviado libremente por
el navegador. El registro validado llamará al aprovisionador desde un proceso administrativo;
nunca entregar `PROVISION_DATABASE_URL` o los tokens internos al frontend. La capa de identidad
única y doble autorización sigue pendiente: los tokens actuales del agente y CRM son distintos.

## Verificación

```sh
npm test
# Integración real sobre servidores de prueba desechables:
TEST_POSTGRES_URL=postgresql://test_user@127.0.0.1:55439/postgres \
TEST_MONGODB_URI=mongodb://127.0.0.1:57439 npm test
```

La integración crea y elimina bases con prefijo `platform_test_`, comprueba aislamiento,
activación de productos, identidad de contactos, confirmaciones concurrentes, deduplicación,
paginación de mensajes, migraciones del CRM e importación/publicación con su adaptador real.
Sin esas variables, la integración se marca omitida y solo se ejecutan las pruebas unitarias.
La migración completa del agente requiere pgvector; verificar además el despliegue Docker y
el circuito real de WhatsApp/OAuth en un entorno de ensayo antes de publicar.
En despliegues anteriores del CRM, aplicar también la migración `SharedContact1710000000045`
antes de ejecutar el backend actualizado, aunque la integración central esté deshabilitada.

Referencias: [esquemas en Prisma PostgreSQL](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql),
[índices únicos parciales en MongoDB](https://www.mongodb.com/docs/v8.0/core/index-partial/).
