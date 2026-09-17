import { spawnSync } from "node:child_process";

const sharedArguments = ["--experimental-strip-types", "--test"];

const sourceTests = [
  "tests/aiPrivacy.test.ts",
  "tests/privacyRightsSecurity.test.ts",
  "tests/privacyRequestManagement.test.mjs",
  "tests/vetbotSecurity.test.ts",
  "tests/vetbotActionUnderstanding.test.ts",
  "tests/vetbotConversationPersistence.test.ts",
  "tests/petImport.test.ts",
  "tests/patientDeletionSecurity.test.ts",
  "tests/ownerSignupSecurity.test.ts",
  "tests/ownerProfileClaimSecurity.test.ts",
  "tests/authHardening.test.ts",
  "tests/aiGatewayInfrastructure.test.ts",
  "tests/aiStage2DatabaseSecurity.test.ts",
  "tests/visitSummarySecurity.test.ts",
  "tests/digitalCareAiSecurity.test.ts",
  "tests/ragSecurity.test.ts",
  "tests/documentOcrSecurity.test.ts",
  "tests/appointmentMutationsSecurity.test.ts",
  "tests/medicalVisitMutationsSecurity.test.ts",
  "tests/clientSummarySecurity.test.ts",
  "tests/followUpSuggestionsSecurity.test.ts",
  "tests/finalHardening.test.ts",
  "tests/accessibilityFoundation.test.ts",
  "tests/timeZone.test.ts",
];

const databaseTests = [
  "tests/definerBoundaryDatabaseIntegration.test.mjs",
  "tests/patientDeletionDatabaseIntegration.test.mjs",
  "tests/ownerSignupDatabaseIntegration.test.mjs",
  "tests/ownerProfileClaimDatabaseIntegration.test.mjs",
  "tests/privacyRightsDatabaseIntegration.test.mjs",
  "tests/aiStage2DatabaseIntegration.test.mjs",
  "tests/appointmentMutationsDatabaseIntegration.test.mjs",
  "tests/medicalVisitMutationsDatabaseIntegration.test.mjs",
];

function run(files) {
  const result = spawnSync(process.execPath, [...sharedArguments, ...files], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(sourceTests);
for (const databaseTest of databaseTests) run([databaseTest]);
