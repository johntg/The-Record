import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const cwd = process.cwd();
loadEnvFile(path.join(cwd, ".env"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL_TRAINING || "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY_TRAINING || "";

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const email = normalizeEmail(getArgValue("--email"));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL_TRAINING or SUPABASE_SERVICE_ROLE_KEY_TRAINING. Update your local .env before running this script.",
  );
  process.exit(1);
}

if (SUPABASE_SERVICE_ROLE_KEY === "your_training_service_role_key_here") {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY_TRAINING is still set to the placeholder value in .env. Replace it with your real Supabase service role/secret key before running this script.",
  );
  process.exit(1);
}

if (!email) {
  console.error("Missing required --email argument.");
  printHelp();
  process.exit(1);
}

console.log("🎓 Inspecting TRAINING database auth user");
console.log(`   URL: ${SUPABASE_URL}`);
console.log("");

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
  console.log(
    "\n❌ Result: No auth user was found for this email in TRAINING database.",
  );
  console.log(
    "   Run: npm run provision:member:training -- --email " +
      email +
      ' --name "Your Name" --role admin',
  );
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
    "\n❌ Result: The auth user exists, but no email identity is attached. OTP email sign-in will fail in this state.",
  );
  console.log(
    "\n🔧 FIX: Delete this user from the Supabase dashboard and re-provision:",
  );
  console.log(
    "   1. Go to: https://supabase.com/dashboard/project/uyyptbytjuxavqddpecj/auth/users",
  );
  console.log("   2. Find and delete: " + email);
  console.log(
    "   3. Run: npm run provision:member:training -- --email " +
      email +
      ' --name "Your Name" --role admin',
  );
} else if (!authUser.email_confirmed_at && !authUser.confirmed_at) {
  console.log(
    "\n⚠️  Result: The auth user exists and has an email identity, but the email is not confirmed.",
  );
  console.log(
    "\n🔧 FIX: The provisioning script should have confirmed it. Try re-provisioning.",
  );
} else {
  console.log(
    "\n✅ Result: The auth user appears to have a valid email identity and confirmed email.",
  );
  console.log(
    "   If OTP is still failing, check SMTP configuration or rate limits.",
  );
}

async function findAuthUserByEmail(client, normalizedEmail) {
  let allUsers = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    if (!data?.users || data.users.length === 0) {
      break;
    }

    allUsers = allUsers.concat(data.users);

    if (data.users.length < perPage) {
      break;
    }

    page++;
  }

  return allUsers.find(
    (user) => normalizeEmail(user?.email) === normalizedEmail,
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
🎓 Inspect auth user provisioning status in the TRAINING database.

Usage:
  node scripts/inspect-auth-user-training.mjs --email person@example.com

Options:
  --email <email>  Required. Email address to inspect.
  --help           Show this help message.
`);
}
