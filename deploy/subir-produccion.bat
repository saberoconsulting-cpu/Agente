@echo off
rem Sube el paquete y despliega en el VPS en un solo paso. Pide la contrasena de roberto (y la de sudo).
rem Si la conexion se cierra antes de empezar (error 255), reintenta hasta 3 veces solo el despliegue.
setlocal EnableDelayedExpansion
set "verifyKnowledge=0"
if "%SABERO_VERIFY_KNOWLEDGE_DELETION%"=="1" set "verifyKnowledge=1"
cd /d "%~dp0.."

if not exist deploy\agente-plataforma.tar.gz (
  echo No existe deploy\agente-plataforma.tar.gz. Generalo primero con: bash deploy/package-deploy.sh
  exit /b 1
)

echo.
echo === 1/2 Subiendo paquete y script al servidor ===
scp deploy\agente-plataforma.tar.gz deploy\agente-plataforma.tar.gz.sha256 deploy\deploy-production.sh roberto@209.126.12.205:/tmp/
if errorlevel 1 (
  echo ERROR: no se pudo subir. Revisa la contrasena e intenta de nuevo.
  exit /b 1
)

set tries=0
:deploy
set /a tries+=1
echo.
echo === 2/2 Desplegando ===
ssh -t roberto@209.126.12.205 "sudo docker ps -aq --filter name=provisioner-run | xargs -r sudo docker rm -f; sudo SKIP_ATTACH=1 VERIFY_KNOWLEDGE_DELETION=%verifyKnowledge% bash /tmp/deploy-production.sh"
if errorlevel 255 (
  if !tries! lss 3 (
    echo.
    echo La conexion se cerro antes de empezar. Reintentando tras el intento !tries!/3 ... escribe la contrasena de nuevo.
    goto deploy
  )
  echo.
  echo No se pudo conectar tras 3 intentos. Espera unos minutos y ejecuta solo el comando ssh.
  exit /b 1
)
if errorlevel 1 (
  echo ERROR: el despliegue fallo. El sitio puede seguir mostrando la version anterior.
  exit /b 1
)

echo.
echo === Comprobando salud ===
curl -fsS https://agente.saberoconsulting.com/api/v1/health
if errorlevel 1 exit /b 1
echo.
echo === Verificando que la correccion de Google esta publicada ===
curl -fsSI https://agente.saberoconsulting.com | findstr /i /c:"Cross-Origin-Opener-Policy: same-origin-allow-popups"
if errorlevel 1 (
  echo ERROR: el sitio no devuelve la cabecera de la correccion. Ejecuta deploy\diagnostico-picker.bat.
  exit /b 1
)
echo.
endlocal
