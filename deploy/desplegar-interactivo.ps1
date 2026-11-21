param([switch]$VerifyKnowledgeDeletion)
$ErrorActionPreference = 'Continue'
if ($VerifyKnowledgeDeletion) { $env:SABERO_VERIFY_KNOWLEDGE_DELETION = '1' }
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$deploymentLog = Join-Path $PSScriptRoot 'despliegue-output.log'
Start-Transcript -LiteralPath $deploymentLog -Force | Out-Null
Write-Host 'DESPLIEGUE: escribe las contrasenas solo en esta ventana cuando sean solicitadas.'
Write-Host 'Puede pedir contrasena para SCP, SSH y sudo. Espera hasta que termine.'
& cmd.exe /c deploy\subir-produccion.bat
$deploymentExit = $LASTEXITCODE
Stop-Transcript | Out-Null
Add-Content -LiteralPath $deploymentLog -Value "DEPLOY_EXIT_CODE=$deploymentExit"
if ($deploymentExit -ne 0) {
  Write-Host 'El despliegue fallo. Codex revisara el registro; deja esta ventana abierta.'
  exit $deploymentExit
}
Write-Host 'Despliegue completado. Codex comprobara el sitio publicado.'
