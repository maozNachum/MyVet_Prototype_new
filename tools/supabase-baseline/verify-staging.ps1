param(
  [switch]$Execute
)

$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess {
  param([Parameter(Mandatory)][string]$Operation)

  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with exit code $LASTEXITCODE."
  }
}

function Invoke-StagingSqlFile {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$CredentialEnvFile
  )

  Write-Host "Running $Label on verified Staging..."
  Get-Content -LiteralPath $Path -Raw |
    docker run --rm -i --env-file $CredentialEnvFile postgres:17-alpine psql `
      --no-psqlrc -qAt -v ON_ERROR_STOP=1
  Assert-NativeSuccess $Label
}

if (-not $Execute) {
  throw 'Refusing to run write-capable acceptance fixtures without the explicit -Execute switch.'
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SupabaseCli = 'supabase@2.116.0'
$ParentProjectRef = 'bavpqmopcrhtrwatmyng'
$StagingBranchId = '02a4ac74-1b6c-47ae-a35d-6c9d30207b32'
$ExpectedStagingProjectRef = 'mofigaoqzlffmnrmocxu'

docker info --format '{{.ServerVersion}}' | Out-Null
Assert-NativeSuccess 'Docker availability check'

$branchJson = npx --yes $SupabaseCli branches get $StagingBranchId `
  --project-ref $ParentProjectRef -o json --log-level error
Assert-NativeSuccess 'Supabase Staging branch lookup'
$branch = $branchJson | ConvertFrom-Json

$expectedUrl = "https://$ExpectedStagingProjectRef.supabase.co"
if ($branch.SUPABASE_URL -ne $expectedUrl) {
  throw 'Refusing to run: the resolved branch is not the approved Staging project.'
}
if ([string]::IsNullOrWhiteSpace($branch.POSTGRES_URL)) {
  throw 'Refusing to run: no Staging database URL was returned.'
}
if ($branch.POSTGRES_URL -match $ParentProjectRef) {
  throw 'Refusing to run: the database URL points at the Production project.'
}

$postgresUri = [uri]$branch.POSTGRES_URL
$userInfo = $postgresUri.UserInfo.Split(':', 2)
$postgresUser = [uri]::UnescapeDataString($userInfo[0])
if ($userInfo.Count -ne 2 -or [string]::IsNullOrWhiteSpace($userInfo[1])) {
  throw 'Refusing to run: the Staging database URL has no usable credentials.'
}
if ($postgresUser -ne "postgres.$ExpectedStagingProjectRef") {
  throw 'Refusing to run: the database username is not scoped to the approved Staging project.'
}

$postgresPassword = [uri]::UnescapeDataString($userInfo[1])
$postgresDatabase = $postgresUri.AbsolutePath.TrimStart('/')
$postgresPort = if ($postgresUri.IsDefaultPort) { 5432 } else { $postgresUri.Port }
$CredentialEnvFile = Join-Path ([io.path]::GetTempPath()) `
  "myvet-staging-pg-$([guid]::NewGuid().ToString('N')).env"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[io.file]::WriteAllLines($CredentialEnvFile, @(
  "PGHOST=$($postgresUri.Host)",
  "PGPORT=$postgresPort",
  "PGDATABASE=$postgresDatabase",
  "PGUSER=$postgresUser",
  "PGPASSWORD=$postgresPassword",
  'PGCONNECT_TIMEOUT=15'
), $utf8WithoutBom)

try {
  Push-Location $RepositoryRoot
  try {
    Invoke-StagingSqlFile `
      -Path 'tools\supabase-baseline\verify\acceptance.sql' `
      -Label 'Catalog acceptance' `
      -CredentialEnvFile $CredentialEnvFile
    Invoke-StagingSqlFile `
      -Path 'tools\supabase-baseline\verify\staging-role-matrix.sql' `
      -Label 'JWT role matrix' `
      -CredentialEnvFile $CredentialEnvFile
    Invoke-StagingSqlFile `
      -Path 'tests\fixtures\previewMedicalVisitAcceptance.sql' `
      -Label 'Atomic medical visit acceptance' `
      -CredentialEnvFile $CredentialEnvFile
    Invoke-StagingSqlFile `
      -Path 'tools\supabase-baseline\verify\rag-runtime.sql' `
      -Label 'Synthetic RAG runtime' `
      -CredentialEnvFile $CredentialEnvFile
    Invoke-StagingSqlFile `
      -Path 'tools\supabase-baseline\verify\staging-hnsw-plan.sql' `
      -Label 'Natural HNSW planner acceptance' `
      -CredentialEnvFile $CredentialEnvFile

    $cleanupSql = @'
select json_build_object(
  'synthetic_clinics', (select count(*) from public.clinics where slug like 'staging-%' or slug like 'restore-%'),
  'synthetic_hnsw_chunks', (select count(*) from public.ai_document_chunks where content like 'Synthetic vector source %'),
  'enabled_flags', (select count(*) from public.ai_feature_flags where enabled),
  'enabled_rag_flags', (select count(*) from public.ai_feature_flags where enabled and capability in ('rag.index', 'rag.qa', 'rag_index', 'rag_qa'))
)::text;
'@
    Write-Host 'Checking final Staging cleanup and feature flags...'
    $cleanupResult = $cleanupSql |
      docker run --rm -i --env-file $CredentialEnvFile postgres:17-alpine psql `
        --no-psqlrc -qAt -v ON_ERROR_STOP=1
    Assert-NativeSuccess 'Final Staging cleanup check'

    $cleanup = $cleanupResult | ConvertFrom-Json
    if ($cleanup.synthetic_clinics -ne 0 -or
        $cleanup.synthetic_hnsw_chunks -ne 0 -or
        $cleanup.enabled_flags -ne 0 -or
        $cleanup.enabled_rag_flags -ne 0) {
      throw "Staging cleanup or feature-flag assertion failed: $cleanupResult"
    }

    Write-Host 'Verified Staging acceptance passed; Production was not targeted.'
  }
  finally {
    Pop-Location
  }
}
finally {
  if (Test-Path -LiteralPath $CredentialEnvFile) {
    Remove-Item -LiteralPath $CredentialEnvFile -Force
  }
}
