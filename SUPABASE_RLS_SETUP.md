# Supabase Row Level Security (RLS) Setup

This guide walks through enabling archiving by adding INSERT policies to the `archive` table.

## Problem

The app tries to move rows from `callings` to `archive` when archiving. The Supabase RLS policy on the `archive` table currently blocks this insert, so the app falls back to just marking the row as `status = "Archived"` in `callings`.

To enable true row transfer, you need to add an `INSERT` policy to the `archive` table.

## Solution 1: Open INSERT policy (development)

If you're in development and want to allow any authenticated user to insert into `archive`:

### Step 1: Open Supabase console

Go to [https://app.supabase.com](https://app.supabase.com) and select your project.

### Step 2: Navigate to SQL Editor

- Left sidebar → **SQL Editor**
- Click **+ New Query**

### Step 3: Create the INSERT policy

Paste and run this SQL:

```sql
-- Allow authenticated users to insert into archive
CREATE POLICY "Allow authenticated users to insert archive" ON public.archive
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
```

Then click **Run** (or ⌘+Enter).

### Step 4: Test

Return to the app and try archiving an item. It should now move the row to the `archive` table instead of falling back.

---

## Solution 2: Admin-only INSERT policy (production)

If you want only admin-authenticated sessions to insert into `archive`:

```sql
-- Allow only admins to insert into archive
CREATE POLICY "Admin-only archive insert" ON public.archive
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.members
      WHERE members.name = auth.jwt() ->> 'email'
        AND members.role = 'admin'
    )
  );
```

**Note:** This assumes your `members` table has an `admin` role and that the session user email matches a member name. Adjust the column/condition to match your actual schema.

---

## Solution 3: Using a secure RPC function (recommended for production)

If you prefer even tighter control, create a database function:

### Step 1: Create the function

```sql
CREATE OR REPLACE FUNCTION archive_calling(calling_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_calling RECORD;
BEGIN
  -- Check admin role (adjust logic as needed)
  IF (SELECT shared_password_type FROM public.members WHERE name = auth.jwt() ->> 'email') != 'admin' THEN
    RAISE EXCEPTION 'Only admins can archive';
  END IF;

  -- Fetch the calling
  SELECT * INTO v_calling FROM public.callings WHERE id = calling_id;

  IF v_calling IS NULL THEN
    RAISE EXCEPTION 'Calling not found';
  END IF;

  -- Insert into archive
  INSERT INTO public.archive SELECT v_calling.*;

  -- Delete from callings
  DELETE FROM public.callings WHERE id = calling_id;

  RETURN TRUE;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION archive_calling(uuid) TO authenticated;
```

### Step 2: Update `src/main.js`

Replace the archive insert/delete with an RPC call:

```javascript
const { data, error } = await supabase.rpc("archive_calling", {
  calling_id: id,
});
```

This approach keeps business logic on the server and is more secure.

---

## Checking current policies

To see what policies already exist on `archive`:

1. **Supabase console** → **Authentication** → **Policies**
2. Select table `archive`

You'll see a list of all policies. If there are no INSERT policies, that's why inserts are failing.

---

## Testing your policy

After adding a policy:

1. Return to the app and log in
2. Click **Archive** on any calling
3. Check the Supabase **Logs** to see if the insert succeeded or failed
4. Verify the row appears in the `archive` table

---

## Troubleshooting

### Policy still blocked?

- Make sure you clicked **Run** after pasting the SQL
- Check that the `auth.role()` condition matches your actual session role
- Verify the table name is exactly `archive` (case-sensitive in some contexts)

### Insert succeeds but row doesn't appear?

- Check your RLS policies on the `archive` table's **SELECT** policies
- The inserting user may not have SELECT permission to see their own insert

### Want to delete old policies?

```sql
DROP POLICY IF EXISTS "policy_name" ON public.archive;
```

---

## Next steps

1. Choose Solution 1, 2, or 3 above based on your security needs
2. Run the SQL in the Supabase **SQL Editor**
3. Test archiving in the app
4. Once confirmed, you can remove the fallback alert from the app code if desired

---

## Further reading

- [Supabase RLS docs](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL security policies](https://www.postgresql.org/docs/current/sql-createpolicy.html)
