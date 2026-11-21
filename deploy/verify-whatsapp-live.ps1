$ErrorActionPreference = 'Stop'
try {
  foreach ($label in @('A', 'B')) {
    $email = Read-Host "Correo del propietario de la empresa $label"
    $secret = Read-Host "Contraseña de la empresa $label" -AsSecureString
    $credential = [System.Management.Automation.PSCredential]::new($email, $secret)
    [Environment]::SetEnvironmentVariable("SABERO_TEST_${label}_EMAIL", $email, 'Process')
    [Environment]::SetEnvironmentVariable("SABERO_TEST_${label}_PASSWORD", $credential.GetNetworkCredential().Password, 'Process')
  }
  & node (Join-Path $PSScriptRoot 'verify-whatsapp-live.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'La prueba real no se completó. Revisa whatsapp-live-result.json.' }
} finally {
  foreach ($label in @('A', 'B')) {
    [Environment]::SetEnvironmentVariable("SABERO_TEST_${label}_EMAIL", $null, 'Process')
    [Environment]::SetEnvironmentVariable("SABERO_TEST_${label}_PASSWORD", $null, 'Process')
  }
  $credential = $null
  $secret = $null
}
