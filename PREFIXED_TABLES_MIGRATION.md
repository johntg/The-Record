# Single Database with Prefixed Tables Migration

This migration consolidates your production and training environments into a **single Supabase database** using **table prefixes** (`prod_` and `train_`). This eliminates auth token switching issues and simplifies database management.

## Architecture

### Before (Two Databases)

- **Production Database:** `rcelzqrloxykyqnyosxc.supabase.co`
- **Training Database:** `nybfjdkplregbmutvagr.supabase.co`
- **Problem:** Switching databases required clearing auth tokens and page reload
- **Problem:** OTP codes specific to each database caused errors

### After (Single Database with Prefixes)

- **Single Database:** Production database (`rcelzqrloxykyqnyosxc.supabase.co`)
- **Production Tables:** `prod_callings`, `prod_archive`, `prod_calling_hc_votes`, etc.
- **Training Tables:** `train_callings`, `train_archive`, `train_calling_hc_votes`, etc.
- **Shared Table:** `members` (no prefix - shared across both modes)
- **Benefits:** No page reload needed, instant switching, single auth session

## Migration Steps

### Step 1: Run Database Migration Scripts

Execute these SQL scripts in your **production** Supabase project SQL Editor:

1. **Create prefixed tables and migrate data:**

   ```bash
   # Go to: https://supabase.com/dashboard/project/rcelzqrloxykyqnyosxc/sql/new
   # Copy and paste contents of: migrations/003_create_prefixed_tables.sql
   # Click "Run"
   ```

2. **Set up RLS policies:**
   ```bash
   # Copy and paste contents of: migrations/004_create_prefixed_rls_policies.sql
   # Click "Run"
   ```

### Step 2: Update Environment Variables

Update your `.env` file to use only the production database:

```env
# Remove training database variables (no longer needed)
# Keep only:
VITE_SUPABASE_URL_PROD=https://rcelzqrloxykyqnyosxc.supabase.co
VITE_SUPABASE_ANON_KEY_PROD=your_production_anon_key

# These are no longer used but can remain:
# VITE_SUPABASE_URL_TRAINING=...
# VITE_SUPABASE_ANON_KEY_TRAINING=...
```

### Step 3: Deploy Updated Code

The code changes have already been made:

- ✅ `src/main.js` - Updated to use single database with `getTableName()` helper
- ✅ `src/actions/callings-actions.js` - Updated table references
- ✅ `src/ui/create-calling.js` - Updated table references
- ✅ RPC function calls updated to use `_v2` versions with table prefix

**Deploy to GitHub Pages:**

```bash
git add .
git commit -m "Migrate to single database with prefixed tables"
git push origin main
```

### Step 4: Test the Migration

1. **Open your app** (may need hard refresh: Cmd+Shift+R / Ctrl+Shift+R)
2. **Log in** with your email
3. **Verify you're in production mode** (no orange banner)
4. **Create a test calling** to ensure production tables work
5. **Click the database toggle** in the top-left
6. **Verify instant switch** to training mode (orange banner appears, no page reload!)
7. **Create a test calling** in training mode
8. **Switch back to production** - should be instant and seamless

### Step 5: Verify Data Separation

**Check production data:**

```sql
SELECT COUNT(*) FROM prod_callings;
SELECT COUNT(*) FROM prod_archive;
```

**Check training data:**

```sql
SELECT COUNT(*) FROM train_callings;
SELECT COUNT(*) FROM train_archive;
```

**Check shared members:**

```sql
SELECT COUNT(*) FROM members;
```

## What Changed

### Code Changes

1. **Single Supabase client** instead of mode-based client selection
2. **`getTableName()` helper function** that adds `prod_` or `train_` prefix
3. **All `.from()` calls** now use `getTableName("table_name")`
4. **`toggleDatabaseMode()`** no longer reloads page - just switches mode and reloads data
5. **RPC functions** updated to `_v2` versions that accept `table_prefix` parameter

### Database Changes

1. **New prefixed tables** created in production database
2. **Existing production data** migrated to `prod_*` tables
3. **Training tables** created empty (ready for test data)
4. **RLS policies** applied to all new tables
5. **Mode-aware RPC functions** created (`_v2` versions)

## Benefits

✅ **No more auth token issues** - single auth session  
✅ **Instant database switching** - no page reload needed  
✅ **Simpler configuration** - one set of credentials  
✅ **Shared member management** - members exist in both modes  
✅ **Faster development** - seamless switching for testing  
✅ **Reduced complexity** - one database to manage and backup

## Important Notes

### Shared Members Table

The `members` table is **shared** between production and training modes. This means:

- ✅ Members provisioned once are available in both modes
- ✅ Auth users work in both production and training
- ⚠️ Changes to member data affect both modes
- ⚠️ Training mode uses **real member names** in test callings

If you need completely isolated test members, you would need separate `prod_members` and `train_members` tables.

### Old Tables

The original tables (`callings`, `archive`, etc.) still exist in your database but are **no longer used** by the app. You can:

- **Keep them** as a backup (recommended for first few days)
- **Drop them** after verifying the migration worked:
  ```sql
  DROP TABLE IF EXISTS public.callings;
  DROP TABLE IF EXISTS public.archive;
  DROP TABLE IF EXISTS public.calling_hc_votes;
  DROP TABLE IF EXISTS public.calling_hidden_for_members;
  DROP TABLE IF EXISTS public.status_options;
  ```

### Training Database

The old training database (`nybfjdkplregbmutvagr.supabase.co`) is **no longer used**. After verifying everything works, you can:

1. **Pause the project** in Supabase dashboard (to avoid charges)
2. **Delete the project** (after you're confident migration is stable)

## Rollback Plan

If you need to rollback to the old two-database system:

1. **Revert code changes:**

   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Original tables still have your data** - app will use them again

3. **Training database still exists** - re-add credentials to `.env`

## Troubleshooting

### "Table does not exist" errors

**Solution:** Make sure you ran both migration scripts in Supabase SQL Editor

### "Permission denied" errors

**Solution:** Check that RLS policies were created (run `004_create_prefixed_rls_policies.sql`)

### Toggle doesn't switch modes instantly

**Solution:** Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R) to get latest code

### Still seeing page reloads when switching

**Solution:** Clear browser cache and ensure you're using the latest deployed code

## Questions?

Check the code changes in:

- `src/main.js` - Database configuration and `getTableName()` helper
- `migrations/003_create_prefixed_tables.sql` - Table creation and data migration
- `migrations/004_create_prefixed_rls_policies.sql` - Security policies
