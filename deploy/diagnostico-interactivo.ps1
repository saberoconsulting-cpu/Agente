$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$diagnosticLog = Join-Path $PSScriptRoot 'diagnostico-picker-output.log'
Write-Host 'Escribe la contrasena del servidor cuando SSH la solicite. No se muestra al escribirla.'
Write-Host 'El diagnostico es de solo lectura. La salida se guarda para que Codex pueda revisarla.'
& cmd.exe /c deploy\diagnostico-picker.bat 2>&1 | Tee-Object -FilePath $diagnosticLog
Write-Host "Diagnostico terminado. Resultado guardado en $diagnosticLog"
