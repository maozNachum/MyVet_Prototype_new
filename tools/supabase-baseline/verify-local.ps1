param(
  [switch]$KeepRunning
)

$ErrorActionPreference = 'Stop'

function Assert-NativeSuccess {
  param([Parameter(Mandatory)][string]$Operation)

  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with exit code $LASTEXITCODE."
  }
}

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Workdir = Join-Path $RepositoryRoot 'tools\supabase-baseline'
$ProjectRefFile = Join-Path $Workdir 'supabase\.temp\project-ref'
$Container = 'supabase_db_myvet-baseline'
$SupabaseCli = 'supabase@2.116.0'

if (Test-Path -LiteralPath $ProjectRefFile) {
  throw 'Refusing to run: the clean-room baseline workdir is linked to a remote Supabase project.'
}

docker info --format '{{.ServerVersion}}' | Out-Null
Assert-NativeSuccess 'Docker availability check'

Push-Location $RepositoryRoot
try {
  npx --yes $SupabaseCli start --workdir tools/supabase-baseline | Out-Null
  Assert-NativeSuccess 'Supabase Local start'

  foreach ($attempt in 1..2) {
    npx --yes $SupabaseCli db reset --local --workdir tools/supabase-baseline
    Assert-NativeSuccess "Supabase Local reset $attempt"

    Get-Content -LiteralPath tools\supabase-baseline\verify\acceptance.sql -Raw |
      docker exec -i $Container psql -v ON_ERROR_STOP=1 -U postgres -d postgres
    Assert-NativeSuccess "Database acceptance check $attempt"
  }

  Get-Content -LiteralPath tools\supabase-baseline\verify\rag-runtime.sql -Raw |
    docker exec -i $Container psql -v ON_ERROR_STOP=1 -U postgres -d postgres
  Assert-NativeSuccess 'Synthetic RAG runtime check'

  npx --yes $SupabaseCli db lint --local --workdir tools/supabase-baseline --level warning
  Assert-NativeSuccess 'Supabase database lint'
}
finally {
  if (-not $KeepRunning) {
    npx --yes $SupabaseCli stop --workdir tools/supabase-baseline | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Supabase Local stop failed with exit code $LASTEXITCODE."
    }
  }
  Pop-Location
}
