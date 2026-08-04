// Star of the Week: hashtag generation + auto-posting to Facebook, Instagram
// and Google Business Profile for a single star_posts row.
//
// Every platform (including the Anthropic hashtag call) is optional at
// runtime: if its env vars aren't set yet, that platform's status is
// recorded as 'skipped' with a "credentials not configured" message and
// every other platform still runs. Nothing here throws for a missing
// credential — the only failure that aborts the whole request is not being
// able to load the star_posts row itself.
//
// Instagram Reels (before/after crossfade video) needs ffmpeg, which has no
// home in this stack yet (static SPA + Deno edge functions, no native
// binaries). Its status is always left 'not_implemented' rather than
// attempted — see STAR_OF_THE_WEEK_SETUP.md for the infra decision needed
// before that can be wired up.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const slugifyTag = (raw: string) =>
  String(raw || "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

/** Rule-based tags from breed/area alone — always available, no API calls involved. */
const buildRuleBasedHashtags = (breed: string, area: string): string[] => {
  const breedTag = slugifyTag(breed);
  const areaTag = slugifyTag(area);
  const tags: string[] = [];
  if (breedTag) tags.push(`#${breedTag}`, `#${breedTag}Grooming`);
  if (areaTag) tags.push(`#${areaTag}`, `#${areaTag}DogGrooming`);
  tags.push("#DogGrooming", "#MaiseyDaysDogGrooming");
  return Array.from(new Set(tags));
};

/** 3-5 extra hashtags from Claude for variety, based on the one-liner/breed/area. Returns [] on any failure or missing key — callers treat that as "no AI tags this time," not an error. */
const buildAiHashtags = async (oneLiner: string, breed: string, area: string): Promise<string[]> => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return [];

  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5-20251001";
  const prompt = `A dog grooming salon just posted a "Star of the Week" photo.
Dog breed: ${breed}
Area/town: ${area}
Caption: ${oneLiner}

Suggest 3-5 additional social media hashtags (not already obviously covered by the breed or town name) that would help this post reach dog owners and pet-grooming clients. Mix broad pet-community tags with a couple more specific to the vibe of the caption.

Respond with ONLY a JSON array of hashtag strings, each starting with "#", no other text. Example: ["#PamperedPup", "#DogGroomerLife"]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const text = data?.content?.[0]?.text || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((tag: unknown) => String(tag).trim()).filter((tag: string) => tag.startsWith("#"));
  } catch {
    return [];
  }
};

type PlatformResult = { status: "posted" | "failed" | "skipped"; error?: string; posted_at?: string };

const skipped = (message: string): PlatformResult => ({ status: "skipped", error: message });
const failed = (message: string): PlatformResult => ({ status: "failed", error: message });
const posted = (): PlatformResult => ({ status: "posted", posted_at: new Date().toISOString() });

const postToFacebook = async (photoUrl: string, caption: string): Promise<PlatformResult> => {
  const pageId = Deno.env.get("META_PAGE_ID");
  const accessToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!pageId || !accessToken) return skipped("Facebook credentials not configured (META_PAGE_ID / META_PAGE_ACCESS_TOKEN).");

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: photoUrl, caption, access_token: accessToken }),
    });
    const data = await response.json();
    if (!response.ok) return failed(data?.error?.message || "Facebook post failed.");
    return posted();
  } catch (error) {
    return failed(String(error));
  }
};

const postToInstagram = async (photoUrl: string, caption: string): Promise<PlatformResult> => {
  const igUserId = Deno.env.get("META_IG_USER_ID");
  const accessToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  if (!igUserId || !accessToken) return skipped("Instagram credentials not configured (META_IG_USER_ID / META_PAGE_ACCESS_TOKEN).");

  try {
    const createResponse = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: photoUrl, caption, access_token: accessToken }),
    });
    const createData = await createResponse.json();
    if (!createResponse.ok || !createData?.id) return failed(createData?.error?.message || "Instagram media container failed.");

    const publishResponse = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: createData.id, access_token: accessToken }),
    });
    const publishData = await publishResponse.json();
    if (!publishResponse.ok) return failed(publishData?.error?.message || "Instagram publish failed.");
    return posted();
  } catch (error) {
    return failed(String(error));
  }
};

const getGoogleAccessToken = async (): Promise<string> => {
  const clientId = Deno.env.get("GOOGLE_BUSINESS_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_BUSINESS_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_BUSINESS_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("not_configured");

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
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || "Google token refresh failed.");
  return data.access_token;
};

const postToGoogleBusiness = async (photoUrl: string, summary: string): Promise<PlatformResult> => {
  const accountId = Deno.env.get("GOOGLE_BUSINESS_ACCOUNT_ID");
  const locationId = Deno.env.get("GOOGLE_BUSINESS_LOCATION_ID");
  const hasOAuthConfig = Deno.env.get("GOOGLE_BUSINESS_CLIENT_ID") && Deno.env.get("GOOGLE_BUSINESS_CLIENT_SECRET") && Deno.env.get("GOOGLE_BUSINESS_REFRESH_TOKEN");
  if (!accountId || !locationId || !hasOAuthConfig) {
    return skipped("Google Business Profile credentials not configured (GOOGLE_BUSINESS_CLIENT_ID / GOOGLE_BUSINESS_CLIENT_SECRET / GOOGLE_BUSINESS_REFRESH_TOKEN / GOOGLE_BUSINESS_ACCOUNT_ID / GOOGLE_BUSINESS_LOCATION_ID).");
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const response = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        languageCode: "en-GB",
        summary,
        media: [{ mediaFormat: "PHOTO", sourceUrl: photoUrl }],
        topicType: "STANDARD",
      }),
    });
    const data = await response.json();
    if (!response.ok) return failed(data?.error?.message || "Google Business Profile post failed.");
    return posted();
  } catch (error: any) {
    if (error?.message === "not_configured") return skipped("Google Business Profile credentials not configured.");
    return failed(String(error?.message || error));
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const id = String(body?.id || "");
    if (!id) return jsonResponse({ success: false, error: "Missing 'id'" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: starPost, error: fetchError } = await supabase.from("star_posts").select("*").eq("id", id).single();
    if (fetchError || !starPost) return jsonResponse({ success: false, error: fetchError?.message || "Star post not found." }, 404);

    const ruleBasedTags = buildRuleBasedHashtags(starPost.breed, starPost.area);
    const aiTags = await buildAiHashtags(starPost.one_liner, starPost.breed, starPost.area);
    const combinedTags = Array.from(new Set([...ruleBasedTags, ...aiTags]));

    // Instagram can take a generous tag list; Facebook reads better minimal.
    const instagramTags = combinedTags.slice(0, 15);
    const facebookTags = ruleBasedTags.slice(0, 3);

    const instagramCaption = `${starPost.one_liner}\n\n${instagramTags.join(" ")}`;
    const facebookCaption = `${starPost.one_liner}\n\n${facebookTags.join(" ")}`;
    const googleSummary = starPost.one_liner;

    // Retrying (e.g. after adding credentials for one platform) must never
    // re-post to a platform that already succeeded — only attempt platforms
    // that aren't already 'posted'.
    const alreadyPosted: PlatformResult = { status: "posted", posted_at: undefined };
    const [facebookResult, instagramResult, googleResult] = await Promise.all([
      starPost.facebook_status === "posted" ? Promise.resolve(alreadyPosted) : postToFacebook(starPost.after_photo_url, facebookCaption),
      starPost.instagram_status === "posted" ? Promise.resolve(alreadyPosted) : postToInstagram(starPost.after_photo_url, instagramCaption),
      starPost.google_business_status === "posted" ? Promise.resolve(alreadyPosted) : postToGoogleBusiness(starPost.after_photo_url, googleSummary),
    ]);

    const updates: Record<string, unknown> = {
      hashtags: combinedTags,
      updated_at: new Date().toISOString(),
      facebook_status: facebookResult.status,
      facebook_error: facebookResult.error || null,
      facebook_posted_at: facebookResult.posted_at || starPost.facebook_posted_at,
      instagram_status: instagramResult.status,
      instagram_error: instagramResult.error || null,
      instagram_posted_at: instagramResult.posted_at || starPost.instagram_posted_at,
      google_business_status: googleResult.status,
      google_business_error: googleResult.error || null,
      google_business_posted_at: googleResult.posted_at || starPost.google_business_posted_at,
      // Reels needs ffmpeg compositing, which this stack can't run yet — always left as-is (not_implemented).
    };

    const { error: updateError } = await supabase.from("star_posts").update(updates).eq("id", id);
    if (updateError) return jsonResponse({ success: false, error: updateError.message }, 500);

    return jsonResponse({
      success: true,
      hashtags: combinedTags,
      facebook: facebookResult,
      instagram: instagramResult,
      google_business: googleResult,
      instagram_reels: { status: "not_implemented" },
    });
  } catch (error) {
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
});
