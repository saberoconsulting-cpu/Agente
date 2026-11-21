param([Parameter(Mandatory=$true)][int]$DeploymentProcessId)
$ErrorActionPreference = 'Stop'
$progressPath = Join-Path $PSScriptRoot 'console-progress.log'
try {
$deploymentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$DeploymentProcessId"
if ($deploymentProcess.Name -ne 'powershell.exe' -or $deploymentProcess.CommandLine -notmatch '-File\s+.*deploy\\desplegar-interactivo\.ps1') {
  throw 'El proceso no corresponde a la ventana de despliegue.'
}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class SaberoDeploymentConsole {
  [StructLayout(LayoutKind.Sequential)] public struct Coord { public short X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public short Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Info { public Coord Size, Cursor; public ushort Attributes; public Rect Window; public Coord Maximum; }
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AttachConsole(uint id);
  [DllImport("kernel32.dll")] public static extern bool FreeConsole();
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint mode, uint flags, IntPtr template);
  [DllImport("kernel32.dll")] public static extern bool GetConsoleScreenBufferInfo(IntPtr handle, out Info info);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern bool ReadConsoleOutputCharacter(IntPtr handle, StringBuilder text, uint count, Coord start, out uint read);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
[SaberoDeploymentConsole]::FreeConsole() | Out-Null
if (-not [SaberoDeploymentConsole]::AttachConsole([uint32]$DeploymentProcessId)) { throw 'No se pudo adjuntar la lectura a la consola de despliegue.' }
$consoleHandle = [IntPtr]::Zero
try {
  $consoleHandle = [SaberoDeploymentConsole]::CreateFile('CONOUT$', [uint32]2147483648, 3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
  $consoleInfo = New-Object SaberoDeploymentConsole+Info
  if (-not [SaberoDeploymentConsole]::GetConsoleScreenBufferInfo($consoleHandle, [ref]$consoleInfo)) { throw 'No se pudo leer el estado de la consola.' }
  $start = New-Object SaberoDeploymentConsole+Coord
  $start.X = 0
  $start.Y = [Math]::Max(0, [int]$consoleInfo.Cursor.Y - 80)
  $length = ([int]$consoleInfo.Cursor.Y - [int]$start.Y + 1) * [int]$consoleInfo.Size.X
  $consoleBuffer = New-Object Text.StringBuilder $length
  [uint32]$charactersRead = 0
  [SaberoDeploymentConsole]::ReadConsoleOutputCharacter($consoleHandle, $consoleBuffer, $length, $start, [ref]$charactersRead) | Out-Null
  $consoleText = $consoleBuffer.ToString()
  $consoleWidth = [int]$consoleInfo.Size.X
} finally {
  if ($consoleHandle -ne [IntPtr]::Zero) { [SaberoDeploymentConsole]::CloseHandle($consoleHandle) | Out-Null }
  [SaberoDeploymentConsole]::FreeConsole() | Out-Null
}
$progressReport = @()
for ($offset = 0; $offset -lt $consoleText.Length; $offset += $consoleWidth) {
  $progressLine = $consoleText.Substring($offset, [Math]::Min($consoleWidth, $consoleText.Length - $offset)).Trim()
  if ($progressLine -match 'password|contrase') { $progressReport += '[Solicitud de contrasena presente en la consola]' }
  elseif ($progressLine -match '^===|Checksum|Building|RUN npm|RUN NODE_OPTIONS|error TS|ERROR|failed|Failed|Permission denied|Connection closed|DEPLOY_EXIT|Deploy finished|platform OK|agent OK|Verifying package|Container sabero-|exporting layers|exporting manifest|resolving provenance') { $progressReport += $progressLine }
}
Set-Content -LiteralPath $progressPath -Value $progressReport -Encoding utf8
} catch { Set-Content -LiteralPath $progressPath -Value ('Lectura de progreso no disponible: ' + $_.Exception.Message) -Encoding utf8; exit 1 }
