$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$headerLog = Join-Path $PSScriptRoot 'ajuste-nginx-output.log'
Set-Content -LiteralPath $headerLog -Value 'AJUSTE FINAL GOOGLE: eliminar cabecera duplicada.' -Encoding Unicode
Write-Host 'AJUSTE FINAL GOOGLE: escribe la contrasena solo cuando SCP, SSH o sudo la soliciten.'
& scp.exe nginx/default.conf roberto@209.126.12.205:/tmp/sabero-nginx-picker.conf
if ($LASTEXITCODE -ne 0) { Add-Content -LiteralPath $headerLog -Value 'ERROR: no se pudo copiar la configuracion.'; exit 1 }
& scp.exe deploy/ajustar-nginx-picker.sh roberto@209.126.12.205:/tmp/ajustar-nginx-picker.sh
if ($LASTEXITCODE -ne 0) { Add-Content -LiteralPath $headerLog -Value 'ERROR: no se pudo copiar el script.'; exit 1 }
& ssh.exe -t roberto@209.126.12.205 'sudo bash /tmp/ajustar-nginx-picker.sh' 2>&1 | Tee-Object -FilePath $headerLog -Append
Add-Content -LiteralPath $headerLog -Value "HEADER_EXIT_CODE=$LASTEXITCODE"
