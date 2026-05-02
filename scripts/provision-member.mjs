import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();
const envPath = path.join(cwd, ".env");

loadEnvFile(envPath);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const email = normalizeEmail(getArgValue("--email"));
const name = getArgValue("--name");
const role = getArgValue("--role");
const canBeAssignedRaw = getArgValue("--can-be-assigned");
const dryRun = hasFlag("--dry-run");
const sendInvite = hasFlag("--send-invite");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Update your local .env before running this script.",
  );
  process.exit(1);
}

if (SUPABASE_SERVICE_ROLE_KEY === "your_service_role_key") {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is still set to the placeholder value in .env. Replace it with your real Supabase service role/secret key before running this script.",
  );
  process.exit(1);
}

if (
  SUPABASE_SERVICE_ROLE_KEY === (process.env.VITE_SUPABASE_ANON_KEY || "") ||
  SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_")
) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY is set to a publishable/anon key, not an admin key. Use the Supabase service role or secret key for admin scripts.",
  );
  process.exit(1);
}

if (!email) {
  console.error("Missing required --email argument.");
  printHelp();
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const memberPayload = buildMemberPayload({
  email,
  name,
  role,
  canBeAssignedRaw,
});

console.log("Provisioning member:");
console.log(JSON.stringify({ memberPayload, dryRun, sendInvite }, null, 2));

if (dryRun) {
  console.log("Dry run only. No changes made.");
  process.exit(0);
}

let authUser = null;

if (sendInvite) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) {
    // "User already registered" means they exist — that's fine for provisioning.
    if (
      error.message?.toLowerCase().includes("already") ||
      error.code === "email_exists" ||
      error.status === 422
    ) {
      console.log(`Auth user already exists for ${email} (invite skipped).`);
    } else {
      console.error("Failed to invite auth user:", error.message);
      process.exit(1);
    }
  } else {
    authUser = data?.user || null;
    console.log(`Invited auth user ${email}.`);
  }
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: name ? { name } : undefined,
  });

  if (error) {
    // "User already registered" or similar means they exist — continue to member upsert.
    if (
      error.message?.toLowerCase().includes("already") ||
      error.code === "email_exists" ||
      error.status === 422
    ) {
      console.log(`Auth user already exists for ${email} (creation skipped).`);
    } else {
      console.error("Failed to create auth user:", error.message);
      process.exit(1);
    }
  } else {
    authUser = data?.user || null;
    console.log(`Created auth user ${email} (email_confirm: true).`);
  }
}

const { data: upsertedMember, error: memberError } = await supabase
  .from("members")
  .upsert(memberPayload, { onConflict: "email" })
  .select();

if (memberError) {
  console.error("Failed to upsert members row:", memberError.message);
  process.exit(1);
}

console.log("Member row upserted successfully.");
console.log(
  JSON.stringify(
    {
      authUserId: authUser?.id || null,
      member: upsertedMember?.[0] || null,
    },
    null,
    2,
  ),
);

function buildMemberPayload({ email, name, role, canBeAssignedRaw }) {
  const payload = { email };

  if (name) {
    payload.name = name.trim();
  }

  if (role) {
    payload.role = role.trim().toLowerCase();
  }

  if (canBeAssignedRaw) {
    payload.can_be_assigned = parseBoolean(canBeAssignedRaw);
  }

  return payload;
}

function parseBoolean(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;

  throw new Error(
    `Invalid boolean value \"${value}\" for --can-be-assigned. Use true/false.`,
  );
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = stripQuotes(value);
    }
  });
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function printHelp() {
  console.log(`
Provision a closed-group member in both Supabase Auth and public.members.

Usage:
  node scripts/provision-member.mjs --email person@example.com [options]

Options:
  --email <email>               Required. Member email address.
  --name <name>                 Optional. Member display name.
  --role <role>                 Optional. Role to store in public.members.
  --can-be-assigned <bool>      Optional. true/false.
  --send-invite                 Invite instead of creating a confirmed auth user.
  --dry-run                     Print what would happen without making changes.
  --help                        Show this help message.
`);
}
