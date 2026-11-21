$ErrorActionPreference = 'Stop'
$workspaceDir = Split-Path -Parent $PSScriptRoot
$releaseArchive = Join-Path $PSScriptRoot 'sabero-whatsapp.tar.gz'
$releaseFiles = @(
  'backend/src/modules/whatsapp/whatsapp-connections.service.ts',
  'backend/src/modules/whatsapp/whatsapp-connections.controller.ts',
  'backend/src/modules/whatsapp/whatsapp.service.ts',
  'frontend/src/features/integrations/links.tsx'
)
Push-Location $workspaceDir
try {
  & tar.exe -czf $releaseArchive @releaseFiles
  if ($LASTEXITCODE -ne 0) { throw 'Could not create WhatsApp release archive.' }
  $releaseDigest = (Get-FileHash -LiteralPath $releaseArchive -Algorithm SHA256).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText("$releaseArchive.sha256", "$releaseDigest  sabero-whatsapp.tar.gz`n", [System.Text.UTF8Encoding]::new($false))
  Write-Output "Release prepared: $releaseArchive"
  Write-Output "SHA256: $releaseDigest"
} finally { Pop-Location }
