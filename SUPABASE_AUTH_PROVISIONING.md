# Closed-Group Supabase Auth Provisioning

This app is configured as a **closed group**.

A sign-in code should only be sent when the email address exists in **both** places:

1. `public.members.email` — the app's authorization table
2. `auth.users.email` — Supabase Authentication users

If the email exists in `members` but not in `auth.users`, the app should **not** send a code.

---

## Recommended model

Treat the two tables differently:

- `auth.users` = identity (who can authenticate)
- `members` = authorization/app profile (who is allowed to use this app, and with what role)

The email address must match exactly between them.

Use normalized email values everywhere:

- trimmed
- lowercased
- no aliases unless you intentionally support them

---

## Immediate manual workflow

Use this when adding a single member and you are managing access manually.

### Step 1: Add the auth user in Supabase

In the Supabase dashboard:

- Go to **Authentication → Users**
- Add or invite the user with the exact email address they will use

Use the exact same email that will appear in `members.email`.

### Step 2: Add the member row

Insert or update the row in `public.members` with the same normalized email address.

Required columns depend on your schema, but typically include:

- `name`
- `email`
- `role`
- any assignment flags such as `can_be_assigned`

### Step 3: Verify exact email match

Confirm:

- `auth.users.email = public.members.email`

No casing differences, whitespace, or alternate aliases.

### Step 4: Test login

Now the user should be able to request an emailed OTP code.

If they are in `members` but not `auth.users`, the request should fail by design.

---

## Recommended long-term workflow

The cleanest approach is to stop creating these records separately.

Instead, create **one secure server-side provisioning action** that:

1. normalizes the email
2. creates or invites the user in `auth.users`
3. upserts the matching row in `public.members`
4. returns success only if both steps succeed

Because this app is a static frontend, this provisioning must **not** run in browser code.

Use one of these server-side options:

- a Supabase Edge Function
- a secure admin-only backend
- a one-off admin script run locally with the `service_role` key

Do **not** expose the `service_role` key in the Vite frontend.

---

## Best implementation option for this app

Because the app is currently a static Vite frontend, the safest pattern is:

### Option A: Admin provisioning script

Create a small script that runs locally or in CI with the Supabase `service_role` key.

That script should:

- normalize the email
- create the auth user if missing
- upsert the member row
- log success/failure clearly

This is the easiest reliable setup for a closed-group app.

### Option B: Admin-only Edge Function

Create a Supabase Edge Function to provision users.

That function should:

- verify the caller is allowed to provision users
- normalize email input
- call the Supabase Admin API
- upsert `members`
- return a clear result

This is better if non-technical admins need a repeatable workflow.

---

## Included admin script

This repository now includes a local provisioning script:

- `scripts/provision-member.mjs`

It uses the Supabase Admin API with your local `SUPABASE_SERVICE_ROLE_KEY` to:

1. normalize the email
2. create or invite the auth user if missing
3. upsert the matching `members` row by `email`

### Required local env

Add this to your local `.env`:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Keep this key local only. Never expose it in the frontend build.

### Basic usage

```bash
npm run provision:member -- --email person@example.com --name "Person Name" --role stake
```

### Optional flags

- `--can-be-assigned true`
- `--send-invite`
- `--dry-run`

### Inspect an existing user

If a user appears in `auth.users` but still cannot receive an OTP, inspect whether they actually have an email identity and confirmed email:

```bash
npm run inspect:auth-user -- --email person@example.com
```

This is useful because a row can exist in `auth.users` while still being unusable for passwordless email login.

### Notes

- The script assumes `public.members` can be safely `upsert`ed on the `email` column.
- If your `members` table has additional required columns, extend the script payload before using it in production.
- `--send-invite` sends an auth invite instead of creating an already-confirmed auth user.

---

## Suggested provisioning rules

Whatever tool you use, enforce these rules:

### Normalize email before storing

Always store email as:

- trimmed
- lowercased

### Use email as the join key

For authentication checks, compare against:

- `members.email`

Do **not** compare auth email to `members.name`.

### Make member upserts idempotent

Provisioning should be safe to run more than once.

Examples:

- create auth user only if missing
- `upsert` member row by email
- avoid duplicate insert failures

### Keep auth and member creation together

Avoid this fragile sequence:

1. someone adds `members` manually
2. someone forgets to add `auth.users`
3. login fails later with a confusing auth error

Provision both at the same time whenever possible.

---

## Troubleshooting checklist

If a user cannot receive a code:

### Check 1: Is the email in `members`?

Run a query against `public.members` and confirm the normalized email exists.

### Check 2: Is the email in `auth.users`?

Check **Authentication → Users** in Supabase.

### Check 3: Do they match exactly?

Compare the exact strings.

### Check 4: Is Email auth enabled?

In Supabase:

- **Authentication → Providers → Email**

### Check 5: Is signup intentionally disabled?

If signup is disabled, the user must be pre-provisioned in `auth.users` before OTP login can work.

That matches the intended design for this app.

---

## Recommended next improvement

If you want to remove this class of problem permanently, build a small admin provisioning script or Edge Function so adding a member always provisions both:

- `auth.users`
- `public.members`

in one action.
