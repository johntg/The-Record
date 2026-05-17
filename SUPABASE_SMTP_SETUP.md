# Supabase Custom SMTP Setup

This guide explains how to configure custom SMTP (Gmail/Google Workspace) for sending OTP authentication emails, avoiding Supabase's default email service rate limits.

## Why Custom SMTP?

Supabase's default email service has strict rate limits:

- Limited emails per hour
- Rate limits triggered during group logins
- Can block legitimate users during peak times

Using Gmail's SMTP provides:

- Much higher sending limits (500-2000 emails per day for Gmail)
- Reliable delivery from your trusted email address
- Professional appearance
- Consistent service for both production and training databases

## Prerequisites

- A Gmail or Google Workspace account
- Access to both Supabase project dashboards
- Admin rights to configure authentication settings

## Step 1: Generate Gmail App Password

Gmail requires app-specific passwords for third-party applications like Supabase.

1. **Go to Gmail App Passwords page:**
   - Visit: https://myaccount.google.com/apppasswords
   - You may need to enable 2-factor authentication first if not already enabled

2. **Create a new app password:**
   - Click "Select app" → Choose "Mail" or "Other (custom name)"
   - Enter "Supabase" or "The Record" as the app name
   - Click "Generate"

3. **Copy the 16-character password:**
   - It will look like: `xxxx xxxx xxxx xxxx`
   - Remove spaces when using it: `xxxxxxxxxxxxxxxx`
   - **Important:** Save this password securely - you won't be able to see it again

## Step 2: Configure Production Database SMTP

1. **Open production Supabase project:**
   - Go to: https://supabase.com/dashboard/project/rcelzqrloxykyqnyosxc/settings/auth
   - Or: Your project dashboard → Settings → Authentication

2. **Scroll to "SMTP Settings" section**

3. **Enable Custom SMTP:**
   - Toggle "Enable Custom SMTP" to ON

4. **Fill in SMTP configuration:**

   ```
   SMTP Host:         smtp.gmail.com
   SMTP Port:         587
   SMTP User:         your-email@gmail.com
   SMTP Pass:         [your-16-character-app-password]
   SMTP Sender Email: your-email@gmail.com
   SMTP Sender Name:  The Record
   ```

5. **Save changes**

6. **Test configuration:**
   - Click "Send test email" if available
   - Or request an OTP code through your app to verify

## Step 3: Configure Training Database SMTP

1. **Open training Supabase project:**
   - Go to: https://supabase.com/dashboard/project/uyyptbytjuxavqddpecj/settings/auth
   - Or: Your project dashboard → Settings → Authentication

2. **Repeat the same SMTP configuration:**
   - Use the **same Gmail account and app password** as production
   - This ensures consistent behavior across environments

## Step 4: Email Template Configuration (Optional)

Supabase allows you to customize the email templates for OTP codes:

1. **Go to Email Templates:**
   - Authentication → Email Templates in Supabase dashboard

2. **Customize "Magic Link" template:**
   - This template is used for OTP codes
   - Add your organization branding
   - Keep the `{{ .Token }}` placeholder for the 6-digit code

3. **Example customization:**
   ```html
   <h2>Your login code for The Record</h2>
   <p>Your 6-digit verification code is:</p>
   <h1>{{ .Token }}</h1>
   <p>This code expires in 60 seconds.</p>
   <p>If you didn't request this code, you can safely ignore this email.</p>
   ```

## Step 5: Verify Configuration

### Test Production:

1. Open your app in production mode
2. Enter your email address
3. Click "Email me a 6-digit code"
4. Check your email - it should arrive from `your-email@gmail.com`
5. Enter the code to complete login

### Test Training:

1. Switch to training mode using the database toggle
2. Enter your email address
3. Request a new code
4. Verify it arrives from the same Gmail address
5. Complete login with the code

## Troubleshooting

### "Invalid credentials" error

- **Cause:** Wrong app password or username
- **Solution:**
  - Verify you're using the app password, not your regular Gmail password
  - Ensure email address is correct
  - Generate a new app password if needed

### "Connection refused" error

- **Cause:** Port or host configuration issue
- **Solution:**
  - Verify port is `587` (not 465 or 25)
  - Verify host is `smtp.gmail.com`
  - Check your network allows outbound SMTP connections

### Emails not arriving

- **Cause:** Could be several issues
- **Solution:**
  1. Check Gmail "Sent" folder to confirm emails were sent
  2. Check recipient's spam folder
  3. Verify the email template includes `{{ .Token }}`
  4. Check Gmail sending limits (500/day for free Gmail)

### "Daily sending limit exceeded"

- **Cause:** Gmail's daily limit reached
- **Solution:**
  - Free Gmail: 500 emails/day limit
  - Google Workspace: 2000 emails/day limit
  - Consider upgrading to Google Workspace for higher limits
  - Monitor usage and spread logins across multiple days if possible

### Rate limiting during group logins

- **Gmail limits:** 500 emails/day (free) or 2000/day (Workspace)
- **Best practices:**
  - If you have more than 50 users logging in on the same day, consider Google Workspace
  - Encourage users to stay logged in (2-hour sessions) to reduce OTP requests
  - Consider implementing a "remember this device" feature for future versions

## Security Considerations

1. **App Password Security:**
   - Treat the app password like a regular password
   - Never commit it to git
   - Store it only in Supabase dashboard settings
   - Rotate it periodically (every 6-12 months)

2. **Email Access:**
   - Anyone with access to your Gmail account can see sent OTP codes
   - Consider using a dedicated Google Workspace account for the app
   - Enable 2FA on the Gmail account

3. **Rate Limiting:**
   - Custom SMTP still respects Supabase's rate limiting on OTP generation
   - This prevents abuse even with unlimited email sending

## Google Workspace (Optional Upgrade)

For organizations with many users, consider upgrading to Google Workspace:

**Benefits:**

- 2000 emails/day (4x more than free Gmail)
- Professional domain email (e.g., `noreply@yourdomain.com`)
- Better reliability and support
- Organizational control and admin features

**Cost:** Starting at $6/user/month (or a shared account just for app emails)

**Setup:** Same as Gmail, just use your workspace email and app password

## Summary

After completing this setup:

✅ OTP codes sent via reliable Gmail SMTP  
✅ Both production and training use same email configuration  
✅ No more Supabase rate limit errors during group logins  
✅ Professional email appearance  
✅ Higher sending limits (500-2000 emails/day)

Your app is now ready to handle authentication for all your users without email delivery issues!
