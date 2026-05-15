# Admin Panel Setup Guide

## Overview

The admin panel allows super admin users to provision, update, and delete members without accessing the Supabase dashboard.

## Database Setup

### 1. Add the 'super' Column

Run the first migration in your Supabase SQL editor:

```sql
-- From: migrations/001_add_super_admin_column.sql
ALTER TABLE members ADD COLUMN super boolean DEFAULT false;
ALTER TABLE archive ADD COLUMN super boolean DEFAULT false;
CREATE INDEX idx_members_super ON members(super);
CREATE INDEX idx_archive_super ON archive(super);
```

### 2. (Optional) Apply Row-Level Security Policies

For production, apply RLS policies to restrict member modifications to super admins only:

```sql
-- From: migrations/002_add_rls_policies_for_admin.sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
-- ... (see migration file for all policies)
```

**Note:** If you apply RLS, ensure you've tested thoroughly, as it will restrict all client-side access to members table updates.

## Setting Up Super Admins

### Option 1: Direct Database Update

Update a member directly in Supabase to grant super admin access:

```sql
UPDATE members SET super = true WHERE email = 'admin@example.com';
```

### Option 2: Via Admin Panel (after first super admin exists)

Once you have one super admin, they can use the admin panel to:

- Add new members
- Edit existing members
- Delete members
- Assign roles and permissions
- Toggle super admin status

## Features

### Admin Page Access

- Only visible to users with `super === true`
- Accessible via "Admin" button in header (only shows for super admins)

### Member Management

The admin panel allows super admins to:

**Create Members**

- Email, Name, Role (admin/stake/shc)
- Can be assigned checkbox
- Super admin checkbox

**Edit Members**

- Update all fields including role and permissions
- Change super admin status

**Delete Members**

- Confirmation dialog prevents accidents
- Removed from database completely

### Security Notes

⚠️ **Current Implementation:**

- **Create member** uses a secure server-side provisioning endpoint (Auth + members)
- **Update/Delete member** currently use direct browser `members` updates
- RLS policies should still be enabled to restrict updates/deletes to super admins

✅ **Recommended for Production:**

1. Keep service role key server-side only
2. Add audit logging for all admin mutations
3. Add rate limiting to admin endpoints
4. Optionally move update/delete to secure server-side endpoint as well

## Admin Panel UI

### Header Button

The admin button appears next to "Reports" and "Callings" toggles, but only for super admins.

### Admin Page Layout

- **Members List Table**: Shows all members with their current settings
- **Add New Member Button**: Opens form to create new members
- **Edit/Delete Buttons**: Each row has action buttons

### Form Validation

- Required fields: Email, Name, Role
- Email validation
- Duplicate email prevention (via database constraints)

## Troubleshooting

### Admin button doesn't appear

- Check that `super === true` in the members table for your user
- Refresh the page after updating the super flag
- Check browser console for errors

### Can't save changes

- Verify the `super` column exists in members table
- Check RLS policies if enabled (ensure super admin can UPDATE)
- Check browser console for Supabase error messages

### Members list doesn't load

- Verify fetchReferenceData() completes successfully
- Check network tab for failed requests
- Ensure user has SELECT permission on members table

## Future Enhancements

Possible improvements to consider:

- Batch import members via CSV
- Member search/filter in admin panel
- Audit log of admin changes
- Role-based templates
- Auto-provision members from external directory
- Member invitation system
