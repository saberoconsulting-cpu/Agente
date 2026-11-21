# SABERO AI

Agente comercial con backend NestJS, panel Next.js y plataforma de empresas.

## Ejecutar en local

Requiere Node.js 22+, Docker Desktop y las dependencias instaladas de `backend`,
`frontend` y `platform`. Las credenciales locales se configuran como `ADMIN_EMAIL`
y `ADMIN_PASSWORD` en `backend/.env`.

Desde `platform`, en PowerShell:

```powershell
node src/local.mjs up-agent
node src/local.mjs check-agent
```

Panel: http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/v1.
El arranque configura bases locales persistentes y conserva copias de los archivos
de entorno anteriores. Más información en [platform/README.md](platform/README.md).

## Verificación

### Recuperación de contraseña

En el login, **Olvidé mi contraseña** permite solicitar un código de seis dígitos
por correo y elegir una nueva contraseña. El código vence en diez minutos, tiene
cinco intentos como máximo y solo puede utilizarse una vez. Los reenvíos tienen
una espera mínima de un minuto y un límite por cuenta e IP.

Configurar `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` y `BREVO_SENDER_NAME` en el entorno
del backend, utilizando una clave API válida y un remitente autorizado de Brevo.
Aplicar la migración `0004_password_recovery` antes de iniciar la nueva versión.
Los errores del proveedor se registran sin conservar códigos ni credenciales.
La respuesta pública no revela si una cuenta existe.

En **Configuración → Accesos → Cambiar mi contraseña**, cada usuario puede actualizar
su propia contraseña verificando la actual. Tanto el cambio como la recuperación
cierran las sesiones existentes y obligan a iniciar sesión de nuevo. Recuperar una
contraseña no aprueba solicitudes ni habilita usuarios inactivos.

### Compilación y pruebas

```powershell
# Desde backend
node node_modules/@nestjs/cli/bin/nest.js build
node node_modules/jest/bin/jest.js --runInBand
# Desde frontend
node node_modules/next/dist/bin/next build
# Desde platform
node --test test/*.test.mjs
```

## Preparar la primera entrega comercial

El arranque local y las pruebas automatizadas no certifican por sí solos el servicio en producción.
Antes de incorporar al primer cliente, registrar evidencia de estos pasos en el entorno de entrega:

- Dominio con HTTPS, proxy de la API y cookies de sesión funcionando.
- Alta de una empresa, aprobación de acceso e inicio de sesión de su propietario.
- Aislamiento entre dos empresas y permisos de propietario, administrador y usuario.
- WhatsApp con firma de webhook, recepción real, respuesta y traspaso a una persona.
- Proveedor de IA configurado, consumo registrado y comportamiento ante indisponibilidad.
- Google y documentos, si el cliente los contrata, con callback y permisos correctos.
- Cola y worker procesando trabajos y recuperándose tras un reinicio.
- Respaldo de bases y claves con restauración probada.
- Condiciones comerciales, privacidad, soporte y tratamiento de datos revisados para la entrega.

El endpoint de disponibilidad `/api/v1/health/ready` consulta PostgreSQL y no expone
credenciales. La comprobación de vida `/api/v1/health` solo verifica el proceso HTTP.
WhatsApp, Google, la plataforma y el proveedor de IA necesitan validación por separado.
