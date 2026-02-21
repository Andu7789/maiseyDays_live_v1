import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getGoogleAccessToken = async () => {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth secrets missing (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN).");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data?.access_token) {
    throw new Error(`Could not get Google access token: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
};

const shouldRenew = (expirationIso: string | null | undefined, force: boolean) => {
  if (force) return true;
  if (!expirationIso) return true;
  const expiration = new Date(expirationIso).getTime();
  if (Number.isNaN(expiration)) return true;
  const now = Date.now();
  const renewThresholdMs = 1000 * 60 * 60 * 24; // 24h
  return expiration - now <= renewThresholdMs;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const force = Boolean((body as any)?.force ?? false);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase service credentials" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings } = await supabase.from("calendar_sync_settings").select("mode, test_calendar_id, live_calendar_id").eq("id", 1).single();
    if (!settings) {
      throw new Error("calendar_sync_settings row is missing");
    }

    const mode = settings.mode === "live" ? "live" : "test";
    const calendarId = mode === "live" ? settings.live_calendar_id : settings.test_calendar_id;
    const webhookAddress = Deno.env.get("GOOGLE_WEBHOOK_CALLBACK_URL") || `${supabaseUrl}/functions/v1/calendar-webhook-handler`;
    const webhookToken = Deno.env.get("GOOGLE_WEBHOOK_TOKEN") || "";

    const { data: existing } = await supabase.from("calendar_watch_channels").select("*").eq("id", 1).maybeSingle();

    const needsRenew = !existing || existing.mode !== mode || existing.calendar_id !== calendarId || shouldRenew(existing.expiration, force);

    if (!needsRenew) {
      return new Response(JSON.stringify({ success: true, renewed: false, expiration: existing.expiration, channelId: existing.channel_id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getGoogleAccessToken();

    if (existing?.channel_id && existing?.resource_id) {
      await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: existing.channel_id,
          resourceId: existing.resource_id,
        }),
      }).catch(() => null);
    }

    const channelId = crypto.randomUUID();
    const watchResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookAddress,
        token: webhookToken || undefined,
        params: {
          ttl: "604800",
        },
      }),
    });

    const watchData = await watchResponse.json();
    if (!watchResponse.ok || !watchData?.id || !watchData?.resourceId) {
      const errorText = watchData?.error?.message || JSON.stringify(watchData);
      return new Response(JSON.stringify({ success: false, error: `Google watch registration failed: ${errorText}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expirationMs = Number(watchData.expiration || 0);
    const expirationIso = expirationMs ? new Date(expirationMs).toISOString() : null;

    await supabase.from("calendar_watch_channels").upsert(
      {
        id: 1,
        mode,
        calendar_id: calendarId,
        channel_id: watchData.id,
        resource_id: watchData.resourceId,
        expiration: expirationIso,
        webhook_address: webhookAddress,
        token_hash: webhookToken
          ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(webhookToken)).then((buf) =>
              Array.from(new Uint8Array(buf))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
            )
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    return new Response(JSON.stringify({ success: true, renewed: true, calendarId, channelId: watchData.id, expiration: expirationIso }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
