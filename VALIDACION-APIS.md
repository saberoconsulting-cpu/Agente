# Demostración de Google Calendar y WhatsApp

## Estado local revisado

El 8 de noviembre de 2026, la empresa local `sabero` no tenía una conexión OAuth
de Google y su opción `scheduling_enabled` estaba desactivada. Este diagnóstico
no comprueba las cuentas de empresas de un despliegue público.

Se corrigió el regreso de OAuth al agente en `127.0.0.1:5173` y se retiraron los
indicadores de Google que se mostraban conectados sin consultar la conexión.
Conexiones incluye **Comprobar Google Calendar**, que consulta calendarios y
disponibilidad sin crear eventos ni invitar personas.

## Antes de grabar

### Comprobación del dominio público

En `https://agente.saberoconsulting.com`, el 8 de noviembre de 2026:

- La comprobación de salud respondió correctamente.
- El resumen declaró una conexión Google guardada y la agenda activada.
- La consulta real `GET /api/v1/calendar/availability` respondió HTTP 500.
- El OAuth usa el callback HTTPS del dominio público.
- La ruta nueva de diagnóstico `/api/v1/integrations/google/status` respondió 404;
  las correcciones locales de este documento no están desplegadas en ese servidor.

Una conexión guardada no prueba que el permiso siga vigente. La causa concreta
del HTTP 500 no se pudo confirmar: hace falta reconectar Google o consultar los
registros del backend público. La conexión directa de diagnóstico a Supabase se
detuvo al no poder verificar su certificado; no se desactivó esa verificación.

No grabar la demostración como funcional hasta comprobar disponibilidad y una
reserva confirmada en el dominio público. La aprobación de Meta no valida Google.

1. Entrar como propietario de la empresa que se mostrará en el video.
2. Comprobar en Google Cloud que Calendar API esté habilitada y que las URI de
   redirección coincidan exactamente con el entorno. El callback local actual es
   `http://localhost:3001/integrations/google/callback`.
3. En Conexiones, leer y aceptar el uso de datos y pulsar **Reconectar Google**.
   Elegir la cuenta de Google de esa empresa y conceder los permisos necesarios.
4. Regresar al agente y pulsar **Comprobar Google Calendar**. Continuar cuando
   indique que se pudo consultar la disponibilidad.
5. En Agente comercial, activar **Permitir reuniones y citas** y guardar la agenda.

Si Google limita la aplicación en pruebas, revisar la lista de usuarios de prueba.
Los tokens de aplicaciones externas en modo Testing pueden vencer a los siete días.
Consulta la [documentación de OAuth de Google](https://developers.google.com/identity/protocols/oauth2/).

## Guion funcional

### Google

- Mostrar el dominio, inicio de sesión de la empresa y acceso a Conexiones.
- Mostrar el consentimiento OAuth y los permisos que el usuario acepta.
- Volver a Sabero y consultar disponibilidad con el botón de comprobación.
- Conversar con el agente, elegir fecha y hora y confirmar una reunión de prueba.
- Mostrar la misma reunión en Google Calendar y su enlace de Meet, si corresponde.
- Para Drive, seleccionar un documento de prueba autorizado y mostrar su uso como
  conocimiento. No utilizar documentos de clientes ni datos confidenciales.

Estos son los permisos declarados en el código y su uso:

| Permiso | Función de Sabero |
| --- | --- |
| `calendar.events` | Crear y consultar reuniones |
| `calendar.freebusy` | Consultar ocupación sin inventar disponibilidad |
| `calendar.calendarlist.readonly` | Listar calendarios para elegir dónde agendar |
| `drive.file` | Leer documentos seleccionados con Google Picker |

Google pide demostrar el consentimiento y las funciones que utilizan los permisos
solicitados; su guía indica subir el video a YouTube como no listado. Consultar los
requisitos vigentes en el [Centro de verificación OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

### WhatsApp

- Mostrar la conexión empresarial de WhatsApp y el número utilizado para la prueba.
- Enviar un mensaje desde un contacto de prueba y mostrar la respuesta del agente.
- Abrir ese contacto en Sabero y comprobar que figuran ambos mensajes.
- Pulsar **Tomar conversación** y enviar una respuesta manual de prueba.
- Mostrar que el historial distingue cliente, IA y asesor y que la IA queda pausada.

Usar este guion junto a los requisitos específicos que aparezcan en el panel de
revisión de Meta. No se ha comprobado desde este entorno la aprobación de la app
en Meta ni en Google. Los diagnósticos sin escritura no prueban la creación real
de reuniones: esa parte requiere consentimiento y una reserva de prueba confirmada.
