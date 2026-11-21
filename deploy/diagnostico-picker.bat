@echo off
rem Solo lectura: verifica el codigo desplegado y las cabeceras. No imprime credenciales.
setlocal
cd /d "%~dp0.."
scp deploy\diagnostico-picker.sh roberto@209.126.12.205:/tmp/diagnostico-picker.sh
if errorlevel 1 exit /b 1
ssh -t roberto@209.126.12.205 "sudo bash /tmp/diagnostico-picker.sh"
exit /b %errorlevel%
