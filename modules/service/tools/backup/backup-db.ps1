# I-MODE Plus Service & Maintenance — back up the production database.
#
#   powershell -ExecutionPolicy Bypass -File tools\backup\backup-db.ps1
#
# Needs the database connection string (Supabase dashboard -> Connect -> "Session pooler", the
# URI form, with the database password filled in). It is read from the environment variable
# IMODE_DB_URL, or asked for when that is not set. It is NEVER written to a file by this script.
#
# Writes to Data\backup\db\ (gitignored — the dump holds real customers and staff logins):
#   imode-<date>.dump        everything in public + imode_private (pg_restore -Fc format)
#   imode-<date>-auth.sql    the staff logins (auth.users + auth.identities, data only)
# Keeps the newest $Keep of each; older ones are removed.
param([int]$Keep = 30)
$ErrorActionPreference = 'Stop'

$bin = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\pg_dump.exe' -ErrorAction SilentlyContinue |
       Sort-Object FullName -Descending | Select-Object -First 1
if (-not $bin) { throw 'pg_dump not found. Install: winget install PostgreSQL.PostgreSQL.18' }
$pgDump = $bin.FullName

$url = $env:IMODE_DB_URL
if (-not $url) {
  $sec = Read-Host 'Paste the Session pooler connection string (postgresql://...)' -AsSecureString
  $url = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if ($url -notmatch '^postgres(ql)?://') { throw 'That does not look like a postgresql:// connection string.' }

$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$out  = Join-Path $repo 'Data\backup\db'
New-Item -ItemType Directory -Force $out | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$main  = Join-Path $out "imode-$stamp.dump"
$auth  = Join-Path $out "imode-$stamp-auth.sql"

Write-Host "Dumping public + imode_private -> $main"
& $pgDump --dbname=$url --format=custom --no-owner --no-privileges `
          --schema=public --schema=imode_private --file=$main
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed ($LASTEXITCODE)" }

Write-Host "Dumping staff logins -> $auth"
& $pgDump --dbname=$url --data-only --no-owner --no-privileges `
          --table=auth.users --table=auth.identities --file=$auth
if ($LASTEXITCODE -ne 0) { throw "pg_dump (auth) failed ($LASTEXITCODE)" }

# A backup nobody can read is not a backup: list what the dump holds.
$pgRestore = Join-Path (Split-Path $pgDump) 'pg_restore.exe'
$tables = (& $pgRestore --list $main | Select-String ' TABLE DATA ').Count
$size = '{0:N1} MB' -f ((Get-Item $main).Length / 1MB)
Write-Host "OK  $size, $tables tables with data"

foreach ($pat in 'imode-*-auth.sql', 'imode-*.dump') {
  Get-ChildItem $out -Filter $pat | Sort-Object Name -Descending | Select-Object -Skip $Keep |
    ForEach-Object { Remove-Item $_.FullName; Write-Host "removed old $($_.Name)" }
}
