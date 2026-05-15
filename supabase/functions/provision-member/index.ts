import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProvisionRequest = {
  token?: string;
  email?: string;
  name?: string;
  role?: string;
  canBeAssigned?: boolean;
  super?: boolean;
};

function normalizeEmail(value: string | undefined | null): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = (await req.json().catch(() => ({}))) as ProvisionRequest;

  const expectedToken = Deno.env.get("MEMBER_PROVISION_TOKEN") || "";
  if (!expectedToken) {
    return new Response(
      JSON.stringify({ error: "MEMBER_PROVISION_TOKEN is not configured." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (body.token !== expectedToken) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim();
  const role = String(body.role || "")
    .trim()
    .toLowerCase();

  if (!email || !name || !role) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: email, name, role." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1) Create auth user if missing
  const createResult = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: name ? { name } : undefined,
  });

  if (createResult.error) {
    const code = createResult.error.code || "";
    const message = String(createResult.error.message || "").toLowerCase();
    const alreadyExists =
      code === "email_exists" ||
      createResult.error.status === 422 ||
      message.includes("already");

    if (!alreadyExists) {
      return new Response(
        JSON.stringify({
          error: `Failed to create auth user: ${createResult.error.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  // 2) Upsert members row by email
  const memberPayload = {
    email,
    name,
    role,
    can_be_assigned: body.canBeAssigned === true,
    super: body.super === true,
  };

  const { data: memberRows, error: memberError } = await supabase
    .from("members")
    .upsert(memberPayload, { onConflict: "email" })
    .select();

  if (memberError) {
    return new Response(
      JSON.stringify({
        error: `Failed to upsert members row: ${memberError.message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      member: memberRows?.[0] || null,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
