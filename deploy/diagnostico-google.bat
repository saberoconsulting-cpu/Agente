@echo off
rem Diagnostico de Google de solo lectura. No muestra tokens ni claves.
setlocal
cd /d "%~dp0.."
scp deploy\diag-google.js roberto@209.126.12.205:/tmp/diag-google.js
if errorlevel 1 exit /b 1
ssh -t roberto@209.126.12.205 "sudo docker cp /tmp/diag-google.js sabero-backend-1:/tmp/diag-google.js && sudo docker exec -w /app sabero-backend-1 node /tmp/diag-google.js"
set "diagnosticExit=%errorlevel%"
exit /b %diagnosticExit%
