# Revisión de WhatsApp Embedded Signup

Fecha: 2026-11-17. Alcance: código local y configuración de producción del repositorio.
Implementación desplegada por el usuario el 2026-11-17 y comprobada después contra
el sitio público. Inicio y planes devuelven HTTP 200; salud y disponibilidad de base
devuelven HTTP 200; inicio de sesión y consulta de propietario funcionan. La API de
WhatsApp devuelve el Configuration ID esperado, `enabled=true` y `missing=[]`.
Google sigue conectado. La empresa `saberoconsulting` no tiene aún números vinculados.
El alta y la mensajería real con dos números siguen pendientes por falta de números
de prueba, según lo indicado por el usuario. No se certifica todavía ese paso.

## Configuración

- Aplicación: `1086951707051587`.
- Configuración «Sabero WhatsApp»: `1813565349855807`.
- Guardada como `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` en `backend/.env.production`.
- `docker-compose.production.yml` carga ese archivo en backend y worker. Un reinicio
  simple no incorpora cambios de `env_file`: hay que recrear los contenedores con el
  procedimiento del despliegue. Los cambios de código también requieren reconstruir
  las imágenes correspondientes.

## Revisado y corregido

- El controlador exige una sesión de propietario; la empresa se obtiene de la sesión.
  El guard valida CSRF y establece el contexto de la base empresarial.
- El navegador usa `config_id` y solicita un código. El secreto y el intercambio del
  código se mantienen en el servidor. Solo se aceptan mensajes de orígenes HTTPS de
  Facebook; ahora se ignoran eventos si no hay una vinculación en curso.
- El backend valida token, aplicación emisora, permisos de gestión y mensajería,
  acceso al WABA y pertenencia del número al WABA, incluida paginación.
- Se rechaza una conexión detectada en otra empresa antes de suscribir la aplicación
  y guardar el token cifrado. La lista pública no devuelve tokens.
- La búsqueda de números entrantes recorre las bases de empresas activas y rechaza
  coincidencias ambiguas. Los números desconocidos ya no se asignan a la empresa por
  defecto; se conserva únicamente el número global configurado explícitamente.
- Una empresa cliente no puede usar las credenciales globales cuando falta la variable
  de propietario de plataforma: se usa `COMPANY_ID` como propietario por defecto.
- La configuración pública informa que falta el secreto si no existe, sin revelarlo.
- Una conexión revocada ya no se describe como conectada al refrescar la pantalla.

## Pendientes antes de certificar el alta completa

1. **Registro implementado:** la autorización de un número no registrado se guarda
   como `pending`. El propietario elige un PIN de seis dígitos en Conexiones. El
   endpoint autenticado `POST /whatsapp/connections/:id/register` verifica la empresa,
   permisos, WABA y estado real, llama a Meta con `messaging_product=whatsapp` y el PIN,
   y solo activa la conexión cuando Meta confirma `CONNECTED`. Los errores conservan
   el estado pendiente y el token cifrado para reintentar sin repetir el consentimiento.
   No se almacena ni se registra el PIN. Los números ya activos no se vuelven a
   registrar; un número Business-app no confirmado nunca pasa a `/register`.
   El SDK usa Embedded Signup v5 y admite los campos nuevos de la sesión. El flujo
   ofrecido desactiva el alta de coexistencia: la sincronización de historial de
   WhatsApp Business app no forma parte de esta entrega.
2. **Meta:** comprobar en el panel los dominios y OAuth de
   `https://agente.saberoconsulting.com`, modo de la aplicación, acceso avanzado a los
   permisos y habilitación como proveedor tecnológico. No se inspeccionó ese panel.
3. **Webhook:** comprobar en Meta la URL HTTPS de `/api/v1/whatsapp/webhook`, token de
   verificación, suscripción al campo `messages` y recepción real con firma válida.
   La verificación de firmas y la suscripción por WABA existen en el código.
4. **Prueba real con dos empresas:** completar el consentimiento de cada propietario,
   recibir y responder un mensaje de cada número y verificar aislamiento, cancelación,
   reconexión y revocación. Las pruebas con mocks no sustituyen esta comprobación.
5. **Escala y concurrencia:** la búsqueda recorre bases empresariales y depende del
   registro central de empresas activas. Antes de aumentar el volumen, conviene crear
   un índice central de números con unicidad transaccional entre empresas. La revisión
   añadida detecta duplicados existentes, pero no garantiza exclusión atómica entre
   dos altas simultáneas que escriben en bases distintas.

Referencia de Meta para registro de números:
https://www.postman.com/meta/whatsapp-business-platform/request/mk4p87j/register-phone-number

Versión de Embedded Signup:
https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-5

## Entrega y aceptación

Ejecutar desde la raíz del proyecto en una terminal con acceso SSH al VPS:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/package-whatsapp.ps1
scp deploy/sabero-whatsapp.tar.gz deploy/sabero-whatsapp.tar.gz.sha256 deploy/deploy-whatsapp.sh roberto@209.126.12.205:/tmp/
ssh -t roberto@209.126.12.205 'sudo bash /tmp/deploy-whatsapp.sh'
```

El script verifica el paquete, respalda los cuatro archivos de código y el entorno,
actualiza únicamente el Configuration ID, reconstruye backend, worker y frontend,
recrea sus contenedores y comprueba la base de datos y el frontend. Reinicia Nginx si
ese servicio está presente. Si falla, restaura archivos, entorno e imágenes anteriores.
No publica secretos locales, no inicia otra infraestructura y no aplica migraciones.

Después, cada propietario inicia sesión y completa Conexiones → Conectar WhatsApp.
Para un número nuevo, activa el número con el PIN y lo conserva en su gestor seguro.
Ejecutar la prueba real desde la raíz:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/verify-whatsapp-live.ps1
```

Solicita las dos cuentas con contraseñas ocultas en la terminal, verifica propietarios
y empresas distintas, configuración desplegada, números distintos y rechazo de
registro cruzado. Luego muestra dos textos únicos para enviarlos desde un teléfono de
prueba a cada número empresarial. Espera hasta tres minutos a recibirlos y a registrar
una respuesta saliente con recibo `sent`, `delivered` o `read`, comprobando que no se
mezclen. No envía mensajes por sí mismo. Cierra sus sesiones y guarda únicamente el
resultado de las comprobaciones en `deploy/whatsapp-live-result.json`.

Esta prueba no está ejecutada: ese archivo no debe presentarse como evidencia de éxito
hasta completar el flujo real. Las comprobaciones de conversación abarcan las veinte
conversaciones más recientes y los cien mensajes recientes de cada una.
