$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$indexLog = Join-Path $PSScriptRoot 'indexacion-output.log'
Start-Transcript -LiteralPath $indexLog -Force | Out-Null
Write-Host 'DIAGNOSTICO DE INDEXACION: solo lectura. Escribe las contrasenas cuando las solicite SSH o sudo.'
& scp.exe deploy/diag-indexacion.js roberto@209.126.12.205:/tmp/diag-indexacion.js
if ($LASTEXITCODE -ne 0) { Stop-Transcript | Out-Null; exit 1 }
& ssh.exe -t roberto@209.126.12.205 "sudo docker cp /tmp/diag-indexacion.js sabero-backend-1:/tmp/diag-indexacion.js && sudo docker exec -w /app sabero-backend-1 node /tmp/diag-indexacion.js && sudo docker inspect --format '{{.State.Status}} restarting={{.State.Restarting}} exit={{.State.ExitCode}}' sabero-worker-1 && sudo docker logs --tail 100 sabero-worker-1 2>&1 | grep -E 'Worker tick postponed|Error:|is required|P100|P202|P101|ECONN|EAI_AGAIN|does not exist|Cannot find module'"
$indexExit = $LASTEXITCODE
Stop-Transcript | Out-Null
Add-Content -LiteralPath $indexLog -Value "INDEX_DIAG_EXIT=$indexExit"
Write-Host 'Diagnostico terminado. Codex revisara el registro.'
