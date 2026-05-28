// supabase/functions/send-notification/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Deno 2 sometimes wraps CJS default exports in an extra .default layer
// deno-lint-ignore no-explicit-any
import webpushRaw from "npm:web-push@3.6.7";
// deno-lint-ignore no-explicit-any
const webpush: any = (webpushRaw as any)?.default ?? webpushRaw;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // Always handle preflight first — no auth check, no env access
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Read VAPID keys inside the handler so a missing secret
    // doesn't crash the module and kill the OPTIONS response
    // Normalise to URL-safe Base64 with no padding (web-push requires this)
    // Handles keys stored as standard Base64 (+, /, =) or already URL-safe
    const toUrlSafeBase64 = (k: string) =>
      k.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const VAPID_PUBLIC_KEY  = toUrlSafeBase64(Deno.env.get("VAPID_PUBLIC_KEY")  ?? "");
    const VAPID_PRIVATE_KEY = toUrlSafeBase64(Deno.env.get("VAPID_PRIVATE_KEY") ?? "");

    // v3 — proves this version of the function is running
    console.log("send-notification v3 — pub key length:", VAPID_PUBLIC_KEY.length);

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "VAPID keys are not configured on this function." }, 500);
    }

    webpush.setVapidDetails(
      "mailto:admin@example.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
    );

    const { subscription, title, body } = await req.json();

    if (!subscription || !title || !body) {
      return json({ error: "subscription, title and body are required." }, 400);
    }

    const payload = JSON.stringify({ title, body, url: "/" });
    await webpush.sendNotification(subscription, payload);

    return json({ success: true });
  } catch (error: any) {
    // WebPushError carries statusCode + body from the push service
    const detail = error?.statusCode
      ? `${error.message} (push service status: ${error.statusCode}${error.body ? ` — ${error.body}` : ""})`
      : (error instanceof Error ? error.message : String(error));
    console.error("send-notification error:", detail);
    return json({ error: detail }, 500);
  }
});
