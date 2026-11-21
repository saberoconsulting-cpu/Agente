@echo off
rem Diagnostico de solo lectura del servidor (Meta, Google, variables). No cambia nada.
setlocal
cd /d "%~dp0.."
scp deploy\diagnostico-remoto.sh roberto@209.126.12.205:/tmp/
if errorlevel 1 exit /b 1
ssh -t roberto@209.126.12.205 "sudo bash /tmp/diagnostico-remoto.sh"
endlocal
