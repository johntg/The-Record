import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProvisionRequest = {
  token?: string;
  action?: "create" | "update" | "delete";
  memberId?: string;
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

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      return { user: null, error };
    }

    const users = data?.users || [];
    const matched = users.find(
      (user) => normalizeEmail(user.email) === normalizeEmail(email),
    );

    if (matched) {
      return { user: matched, error: null };
    }

    if (users.length < perPage) {
      return { user: null, error: null };
    }

    page += 1;
  }
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

  const action = body.action || "create";
  const memberId = String(body.memberId || "").trim();
  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim();
  const role = String(body.role || "")
    .trim()
    .toLowerCase();

  if (action === "create" && (!email || !name || !role)) {
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

    if (action === "create") {
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
          action,
          member: memberRows?.[0] || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "update") {
      if (!email || !name || !role) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields for update: email, name, role.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Look up the member by email to get their id
      const { data: existingMembers, error: lookupError } = await supabase
        .from("members")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (lookupError) {
        return new Response(
          JSON.stringify({
            error: `Failed to look up member: ${lookupError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!existingMembers) {
        return new Response(
          JSON.stringify({ error: "Member not found." }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: memberRows, error: memberError } = await supabase
        .from("members")
        .update({
          email,
          name,
          role,
          can_be_assigned: body.canBeAssigned === true,
          super: body.super === true,
        })
        .eq("id", existingMembers.id)
        .select();

      if (memberError) {
        return new Response(
          JSON.stringify({ error: `Failed to update member: ${memberError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { user: authUser, error: authFindError } = await findAuthUserByEmail(
        supabase,
        email,
      );

      if (authFindError) {
        return new Response(
          JSON.stringify({
            error: `Member updated, but auth lookup failed: ${authFindError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (authUser?.id) {
        const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
          authUser.id,
          {
            user_metadata: name ? { name } : undefined,
          },
        );

        if (authUpdateError) {
          return new Response(
            JSON.stringify({
              error: `Member updated, but auth metadata update failed: ${authUpdateError.message}`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          action,
          member: memberRows?.[0] || null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "delete") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Missing required field for delete: email." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: existingMember, error: existingError } = await supabase
        .from("members")
        .select("id,email,name")
        .eq("email", email)
        .maybeSingle();

      if (existingError) {
        return new Response(
          JSON.stringify({ error: `Failed to load member before delete: ${existingError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (!existingMember) {
        return new Response(JSON.stringify({ error: "Member not found." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const existingEmail = normalizeEmail(existingMember.email);

      const { error: deleteMemberError } = await supabase
        .from("members")
        .delete()
        .eq("id", memberId);

      if (deleteMemberError) {
        return new Response(
          JSON.stringify({ error: `Failed to delete member row: ${deleteMemberError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { user: authUser, error: authFindError } = await findAuthUserByEmail(
        supabase,
        existingEmail,
      );

      if (authFindError) {
        return new Response(
          JSON.stringify({
            error: `Member deleted, but auth lookup failed: ${authFindError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (authUser?.id) {
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
          authUser.id,
        );

        if (authDeleteError) {
          return new Response(
            JSON.stringify({
              error: `Member deleted, but auth user delete failed: ${authDeleteError.message}`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          action,
          deletedMemberId: memberId,
          deletedEmail: existingEmail,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unsupported action: ${String(action)}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
