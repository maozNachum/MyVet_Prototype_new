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

function Invoke-PreviewSqlFile {
  param(
    [Parameter(Mandatory)][string]$Path,
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$CredentialEnvFile
  )

  Write-Host "Running $Label on verified Preview..."
  Get-Content -LiteralPath $Path -Raw |
    docker run --rm -i --env-file $CredentialEnvFile postgres:17-alpine psql `
      --no-psqlrc -qAt -v ON_ERROR_STOP=1
  Assert-NativeSuccess $Label
}

if (-not $Execute) {
  throw 'Refusing to run write-capable Preview fixtures without -Execute.'
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
  "myvet-preview-acceptance-$([guid]::NewGuid().ToString('N')).env"
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[io.file]::WriteAllLines($credentialEnvFile, @(
  "PGHOST=$($postgresUri.Host)",
  "PGPORT=$(if ($postgresUri.IsDefaultPort) { 5432 } else { $postgresUri.Port })",
  "PGDATABASE=$($postgresUri.AbsolutePath.TrimStart('/'))",
  "PGUSER=$postgresUser",
  "PGPASSWORD=$([uri]::UnescapeDataString($userInfo[1]))",
  'PGCONNECT_TIMEOUT=15'
), $utf8WithoutBom)

$previousUrl = $env:MYVET_TEST_SUPABASE_URL
$previousAnonKey = $env:MYVET_TEST_ANON_KEY
$previousServiceRoleKey = $env:MYVET_TEST_SERVICE_ROLE_KEY
$previousAllowedRef = $env:MYVET_TEST_ALLOWED_PROJECT_REF

try {
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  Push-Location $repositoryRoot
  try {
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\acceptance.sql' `
      -Label 'Catalog acceptance' `
      -CredentialEnvFile $credentialEnvFile
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\staging-role-matrix.sql' `
      -Label 'Two-clinic JWT role matrix' `
      -CredentialEnvFile $credentialEnvFile
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\auth-hardening.sql' `
      -Label 'Auth hardening database acceptance' `
      -CredentialEnvFile $credentialEnvFile
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\owner-claim-concurrency.sql' `
      -Label 'Owner claim independent-connection concurrency acceptance' `
      -CredentialEnvFile $credentialEnvFile

    $env:MYVET_TEST_SUPABASE_URL = $branch.SUPABASE_URL
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\service-catalog-trigger.sql' `
      -Label 'Service catalog trigger search path acceptance' `
      -CredentialEnvFile $credentialEnvFile
    $env:MYVET_TEST_ANON_KEY = $branch.SUPABASE_ANON_KEY
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\definer-grants.sql' `
      -Label 'Definer grant allowlist acceptance' `
      -CredentialEnvFile $credentialEnvFile
    Invoke-PreviewSqlFile `
      -Path 'tools\supabase-baseline\verify\definer-boundaries.sql' `
      -Label 'Definer MFA and clinic boundary acceptance' `
      -CredentialEnvFile $credentialEnvFile
    $env:MYVET_TEST_SERVICE_ROLE_KEY = $branch.SUPABASE_SERVICE_ROLE_KEY
    $env:MYVET_TEST_ALLOWED_PROJECT_REF = $ExpectedProjectRef
    npm run test:auth-lifecycle-local
    Assert-NativeSuccess 'Hosted Auth, owner claim and privacy lifecycle acceptance'

    $onboardingOutput = npm run test:multi-clinic-onboarding-preview 2>&1
    $onboardingExitCode = $LASTEXITCODE
    $onboardingOutput | ForEach-Object { Write-Host $_ }
    if ($onboardingExitCode -ne 0) {
      throw "Multi-clinic onboarding acceptance failed with exit code $onboardingExitCode."
    }

    $cleanupMarker = $onboardingOutput |
      Select-String -Pattern '^multi_clinic_onboarding_admin_cleanup_required:(qa-[a-z0-9]+)$' |
      Select-Object -Last 1
    if (-not $cleanupMarker) {
      throw 'Multi-clinic onboarding did not return a guarded cleanup marker.'
    }
    $qaSlugPrefix = $cleanupMarker.Matches[0].Groups[1].Value
    $onboardingCleanupSql = @"
begin;
set local session_replication_role = replica;
delete from public.clinic_invitations
where clinic_id in (select clinic_id from public.clinics where slug like '$qaSlugPrefix%');
delete from public.ai_feature_flags
where clinic_id in (select clinic_id from public.clinics where slug like '$qaSlugPrefix%');
delete from public.clinics where slug like '$qaSlugPrefix%';
commit;
select concat_ws('|',
  (select count(*) from public.clinics where slug like '$qaSlugPrefix%'),
  (select count(*) from public.clinic_invitations where email like 'onboarding-%@example.invalid'),
  (select count(*) from auth.users where email like 'onboarding-%@example.invalid')
);
"@
    $onboardingCleanupResult = $onboardingCleanupSql |
      docker run --rm -i --env-file $credentialEnvFile postgres:17-alpine psql `
        --no-psqlrc -qAt -v ON_ERROR_STOP=1
    Assert-NativeSuccess 'Preview multi-clinic onboarding cleanup'
    if (($onboardingCleanupResult | Select-Object -Last 1).Trim() -ne '0|0|0') {
      throw "Preview multi-clinic onboarding cleanup failed: $onboardingCleanupResult"
    }

    npm run test:anon-access
    Assert-NativeSuccess 'Preview anonymous-access acceptance'

    $cleanupSql = @'
select json_build_object(
  'synthetic_privacy_requests', (select count(*) from public.privacy_requests where request_details like '%concurrent request%'),
  'linked_synthetic_owners', (select count(*) from public.owners where (owner_id like 'AUTH-%' or owner_id like 'CLAIM-%') and auth_user_id is not null),
  'active_synthetic_staff', (select count(*) from public.staff where email like 'auth-%@example.invalid' and is_active),
  'usable_synthetic_auth_users', (select count(*) from auth.users where email like 'auth-%@example.invalid' and coalesce(banned_until, now()) <= now()),
  'enabled_flags', (select count(*) from public.ai_feature_flags where enabled)
)::text;
'@
    $cleanupResult = $cleanupSql |
      docker run --rm -i --env-file $credentialEnvFile postgres:17-alpine psql `
        --no-psqlrc -qAt -v ON_ERROR_STOP=1
    Assert-NativeSuccess 'Preview cleanup check'
    $cleanup = $cleanupResult | ConvertFrom-Json
    if ($cleanup.synthetic_privacy_requests -ne 0 -or
        $cleanup.linked_synthetic_owners -ne 0 -or
        $cleanup.active_synthetic_staff -ne 0 -or
        $cleanup.usable_synthetic_auth_users -ne 0 -or
        $cleanup.enabled_flags -ne 0) {
      throw "Preview cleanup or feature-flag assertion failed: $cleanupResult"
    }

    Write-Host 'P0 Preview acceptance passed; Production was not targeted.'
  }
  finally {
    Pop-Location
  }
}
finally {
  $env:MYVET_TEST_SUPABASE_URL = $previousUrl
  $env:MYVET_TEST_ANON_KEY = $previousAnonKey
  $env:MYVET_TEST_SERVICE_ROLE_KEY = $previousServiceRoleKey
  $env:MYVET_TEST_ALLOWED_PROJECT_REF = $previousAllowedRef
  if (Test-Path -LiteralPath $credentialEnvFile) {
    Remove-Item -LiteralPath $credentialEnvFile -Force
  }
}
