param(
  [Parameter(Mandatory)][string]$ParentProjectRef,
  [Parameter(Mandatory)][string]$BranchId,
  [Parameter(Mandatory)][string]$ExpectedProjectRef,
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'
$SupabaseCli = 'supabase@2.116.0'

function Assert-NativeSuccess {
  param([Parameter(Mandatory)][string]$Operation)

  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with exit code $LASTEXITCODE."
  }
}

if (-not $Execute) {
  throw 'Refusing to modify a remote Preview branch without -Execute.'
}
if ($ExpectedProjectRef -eq $ParentProjectRef) {
  throw 'Refusing to run: Preview and Production project refs are identical.'
}

docker info --format '{{.ServerVersion}}' | Out-Null
Assert-NativeSuccess 'Docker availability check'

$branchJson = npx --yes $SupabaseCli branches get $BranchId `
  --project-ref $ParentProjectRef -o json --log-level error
Assert-NativeSuccess 'Supabase Preview branch lookup'
$branch = $branchJson | ConvertFrom-Json

if ($branch.SUPABASE_URL -ne "https://$ExpectedProjectRef.supabase.co") {
  throw 'Refusing to run: the resolved branch does not match the expected Preview project.'
}
if ([string]::IsNullOrWhiteSpace($branch.POSTGRES_URL) -or $branch.POSTGRES_URL -match $ParentProjectRef) {
  throw 'Refusing to run: no isolated Preview database URL was returned.'
}

$postgresUri = [uri]$branch.POSTGRES_URL
$userInfo = $postgresUri.UserInfo.Split(':', 2)
$postgresUser = [uri]::UnescapeDataString($userInfo[0])
if ($userInfo.Count -ne 2 -or $postgresUser -ne "postgres.$ExpectedProjectRef") {
  throw 'Refusing to run: the database credentials are not scoped to the expected Preview project.'
}

$credentialEnvFile = Join-Path ([io.path]::GetTempPath()) `
  "myvet-preview-pg-$([guid]::NewGuid().ToString('N')).env"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[io.file]::WriteAllLines($credentialEnvFile, @(
  "PGHOST=$($postgresUri.Host)",
  "PGPORT=$(if ($postgresUri.IsDefaultPort) { 5432 } else { $postgresUri.Port })",
  "PGDATABASE=$($postgresUri.AbsolutePath.TrimStart('/'))",
  "PGUSER=$postgresUser",
  "PGPASSWORD=$([uri]::UnescapeDataString($userInfo[1]))",
  'PGCONNECT_TIMEOUT=15'
), $utf8WithoutBom)

try {
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  $migrationRoot = Join-Path $repositoryRoot 'tools\supabase-baseline\supabase\migrations'
  $migrationFiles = Get-ChildItem -LiteralPath $migrationRoot -Filter '*.sql' -File | Sort-Object Name

  foreach ($migrationFile in $migrationFiles) {
    if ($migrationFile.BaseName -notmatch '^(?<version>\d{14})_(?<name>[a-z0-9_]+)$') {
      throw "Unexpected migration filename: $($migrationFile.Name)"
    }
    $version = $Matches.version
    $name = $Matches.name
    $escapedName = $name.Replace("'", "''")

    $alreadyApplied = "select exists(select 1 from supabase_migrations.schema_migrations where version = '$version');" |
      docker run --rm -i --env-file $credentialEnvFile postgres:17-alpine psql `
        --no-psqlrc -qAt -v ON_ERROR_STOP=1
    Assert-NativeSuccess "Migration history lookup $version"
    if (($alreadyApplied | Out-String).Trim() -eq 't') {
      Write-Host "Skipping applied migration $($migrationFile.Name)"
      continue
    }

    Write-Host "Applying $($migrationFile.Name) to verified Preview..."
    Get-Content -LiteralPath $migrationFile.FullName -Raw |
      docker run --rm -i --env-file $credentialEnvFile postgres:17-alpine psql `
        --no-psqlrc -q -v ON_ERROR_STOP=1
    Assert-NativeSuccess "Migration $version"

    "insert into supabase_migrations.schema_migrations(version, name) select '$version', '$escapedName' where not exists (select 1 from supabase_migrations.schema_migrations where version = '$version');" |
      docker run --rm -i --env-file $credentialEnvFile postgres:17-alpine psql `
        --no-psqlrc -q -v ON_ERROR_STOP=1
    Assert-NativeSuccess "Migration history record $version"
  }

  Write-Host 'Verified Preview baseline applied; Production was not targeted.'
}
finally {
  if (Test-Path -LiteralPath $credentialEnvFile) {
    Remove-Item -LiteralPath $credentialEnvFile -Force
  }
}
