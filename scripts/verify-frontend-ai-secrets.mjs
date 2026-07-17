import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function filesUnder(path) {
  return readdirSync(path).flatMap((name) => {
    const fullPath = join(path, name);
    return statSync(fullPath).isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

if (!existsSync("dist")) {
  throw new Error("dist is missing; run the production build first");
}

const bundle = filesUnder("dist")
  .filter((file) => /\.(?:js|css|html|map)$/i.test(file))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const forbidden = [
  /GEMINI_API_KEY/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /AI_GLOBAL_ENABLED/,
  /AI_VETBOT_ACTIONS_ENABLED/,
  /generativelanguage\.googleapis\.com/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /sb_secret_[0-9A-Za-z_-]{20,}/,
];

const finding = forbidden.find((pattern) => pattern.test(bundle));
if (finding) throw new Error(`Frontend bundle contains forbidden server AI material: ${finding}`);

console.log("Frontend AI secret boundary verified.");
