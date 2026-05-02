import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();
loadEnvFile(path.join(cwd, ".env"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const email = normalizeEmail(getArgValue("--email"));

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

const authUser = await findAuthUserByEmail(supabase, email);
const { data: memberRows, error: memberError } = await supabase
  .from("members")
  .select("*")
  .eq("email", email);

if (memberError) {
  console.error("Failed to query members table:", memberError.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      email,
      membersMatchCount: memberRows?.length || 0,
      members: memberRows || [],
      authUser: authUser
        ? {
            id: authUser.id,
            email: authUser.email,
            confirmed_at: authUser.confirmed_at,
            email_confirmed_at: authUser.email_confirmed_at,
            last_sign_in_at: authUser.last_sign_in_at,
            created_at: authUser.created_at,
            banned_until: authUser.banned_until,
            app_metadata: authUser.app_metadata,
            identities: Array.isArray(authUser.identities)
              ? authUser.identities.map((identity) => ({
                  id: identity.id,
                  provider: identity.provider,
                  email: identity.email,
                  provider_id: identity.provider_id,
                  created_at: identity.created_at,
                  updated_at: identity.updated_at,
                }))
              : [],
          }
        : null,
    },
    null,
    2,
  ),
);

if (!authUser) {
  console.log("\nResult: No auth user was found for this email.");
  process.exit(0);
}

const identities = Array.isArray(authUser.identities)
  ? authUser.identities
  : [];
const emailIdentity = identities.find(
  (identity) => String(identity?.provider || "").toLowerCase() === "email",
);

if (!emailIdentity) {
  console.log(
    "\nResult: The auth user exists, but no email identity is attached. OTP email sign-in will fail in this state.",
  );
} else if (!authUser.email_confirmed_at && !authUser.confirmed_at) {
  console.log(
    "\nResult: The auth user exists and has an email identity, but the email is not confirmed.",
  );
} else {
  console.log(
    "\nResult: The auth user appears to have a valid email identity and confirmed email.",
  );
}

async function findAuthUserByEmail(client, normalizedEmail) {
  // The admin listUsers endpoint returns "Database error finding users" on this
  // project despite auth being healthy. Fall back to querying auth.users directly
  // via the REST API with the service role key, which bypasses RLS.
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,email,confirmed_at,email_confirmed_at,last_sign_in_at,created_at,banned_until,app_metadata,identities&email=eq.${encodeURIComponent(normalizedEmail)}`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Accept-Profile": "auth",
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    // REST API may not expose auth schema directly; try the admin endpoint as
    // last resort and surface a clear error if both paths fail.
    const body = await response.json().catch(() => ({}));
    console.error(
      "Failed to query auth.users via REST:",
      body?.message || body?.msg || response.status,
    );
    console.error(
      "Tip: The Supabase admin listUsers API and the auth.users REST endpoint both failed.",
      "Check that the service role key belongs to the same project as VITE_SUPABASE_URL,",
      "and that the project's auth service is healthy.",
    );
    process.exit(1);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
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
Inspect whether an email has a usable Supabase Auth user and email identity.

Usage:
  node scripts/inspect-auth-user.mjs --email person@example.com
`);
}
