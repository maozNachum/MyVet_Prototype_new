import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error("Missing public Supabase configuration.");
  process.exit(2);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [
  ["appointments", "appointment_id"],
  ["staff", "auth_user_id"],
  ["owners", "owner_id"],
  ["patients", "pet_id"],
  ["payments", "payment_id"],
  ["conversations", "conversation_id"],
  ["messages", "message_id"],
];

const exposed = [];
for (const [table, column] of checks) {
  const { data, error } = await supabase.from(table).select(column).limit(1);
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    console.log(`${table}: not present`);
    continue;
  }
  if (error) {
    console.log(`${table}: blocked (${error.code || "policy"})`);
    continue;
  }
  if ((data?.length || 0) > 0) {
    exposed.push(table);
    console.error(`${table}: anonymous row visibility detected`);
  } else {
    console.log(`${table}: blocked`);
  }
}

if (exposed.length > 0) {
  console.error(`Anonymous access gate failed for ${exposed.length} table(s). No row values were read or printed.`);
  process.exit(1);
}

console.log("Anonymous access gate passed. No protected rows are visible.");
