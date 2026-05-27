// supabase/functions/send-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Deno can import the npm web-push library directly!
import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

webpush.setVAPIDDetails(
  "mailto:your-email@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

serve(async (req) => {
  try {
    const { subscription, title, body, sendEmail, userEmail } =
      await req.json();

    // 1. Send the PWA Push Notification
    const payload = JSON.stringify({ title, body, url: "/" });
    await webpush.sendNotification(subscription, payload);

    // 2. Optional: Send Email via Resend if requested
    if (sendEmail && userEmail) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Your App <notifications@yourdomain.com>",
          to: [userEmail],
          subject: title,
          html: `<p>${body}</p>`,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
