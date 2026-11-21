$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
Start-Transcript -LiteralPath (Join-Path $PSScriptRoot 'validacion-borrado-output.log') -Force | Out-Null
Write-Host 'VALIDACION DE BORRADO: solo datos temporales dentro de una transaccion que se revierte.'
& scp.exe backend/scripts/verify-knowledge-deletion.cjs roberto@209.126.12.205:/tmp/verify-knowledge-deletion.cjs
if ($LASTEXITCODE -ne 0) { Stop-Transcript | Out-Null; exit 1 }
& ssh.exe -t roberto@209.126.12.205 'sudo docker cp /tmp/verify-knowledge-deletion.cjs sabero-backend-1:/tmp/verify-knowledge-deletion.cjs && sudo docker exec -w /app sabero-backend-1 node /tmp/verify-knowledge-deletion.cjs'
$validationExit = $LASTEXITCODE
Stop-Transcript | Out-Null
Add-Content -LiteralPath (Join-Path $PSScriptRoot 'validacion-borrado-output.log') -Value "VALIDATION_EXIT=$validationExit"
