# Star of the Week — setup

Admins submit a before/after photo + one-liner from **Admin → Stars ⭐**. That:

1. Saves the post to Supabase (`star_posts` table + `star-posts` storage bucket) and shows it on the public site immediately.
2. Calls the `star-post-publish` edge function, which generates hashtags and attempts to post to Facebook, Instagram and Google Business Profile — each independently, so one platform failing (or not being configured yet) never blocks the others or the site listing.

## Where the credentials live

These are **not** browser env vars (`.env` / `VITE_*`). Facebook/Instagram/Google tokens and the Anthropic key are secrets — they're read inside the `star-post-publish` Supabase edge function, which runs server-side, never in the shipped SPA bundle. Set them with:

```
supabase secrets set META_PAGE_ID=... META_PAGE_ACCESS_TOKEN=... --project-ref <your-project-ref>
```

(or via **Supabase Dashboard → Edge Functions → star-post-publish → Secrets**). Until a variable is set, the function detects it's missing and marks that platform's post as `skipped` with a "credentials not configured" message on the `star_posts` row — it does not error out the rest of the request. Once you add the real value, hit **Retry** next to that platform on the post in Admin → Stars, and it posts without re-posting to platforms that already succeeded.

## Env vars

| Variable | Used for | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Generates 3-5 extra hashtags per post (on top of the rule-based breed/area tags, which always work with no key). | console.anthropic.com |
| `ANTHROPIC_MODEL` (optional) | Overrides the default model (`claude-haiku-4-5-20251001`) used for hashtag generation. | — |
| `META_PAGE_ID` | Facebook Page to post the after-photo to. | Facebook Page → About → Page ID |
| `META_PAGE_ACCESS_TOKEN` | Auth for both the Facebook photo post and the Instagram post (same Meta Graph API token, used for both). Needs a long-lived Page access token with `pages_manage_posts` and `instagram_content_publish`. | Meta for Developers → your app → Graph API Explorer / Page token generation |
| `META_IG_USER_ID` | The Instagram Business/Creator account ID linked to the Facebook Page, used for the Instagram feed post. | `GET /{page-id}?fields=instagram_business_account` via Graph API |
| `GOOGLE_BUSINESS_CLIENT_ID` | OAuth client for Google Business Profile Posts. | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_BUSINESS_CLIENT_SECRET` | Paired with the client ID above. | Same as above |
| `GOOGLE_BUSINESS_REFRESH_TOKEN` | Long-lived refresh token so the function can mint access tokens without a human in the loop. `get-google-refresh-token.html` in the repo root is the existing helper used for the calendar sync's Google OAuth — the same OAuth-consent flow pattern applies, just with Business Profile scopes instead of Calendar. | Run once through Google's OAuth consent flow with `https://www.googleapis.com/auth/business.manage` |
| `GOOGLE_BUSINESS_ACCOUNT_ID` | Which Business Profile account to post under. | Business Profile API → `accounts.list` |
| `GOOGLE_BUSINESS_LOCATION_ID` | Which location (branch) the post appears under. | Business Profile API → `accounts.locations.list` |

## Instagram Reels — not implemented yet

The brief asked for a before/after crossfade video posted as an Instagram Reel. That needs `ffmpeg` to composite the video, and there's nowhere in this stack to run it: the site is a static SPA and the only server-side runtime is Supabase Edge Functions (Deno), which can't execute native binaries like ffmpeg. Every post's `instagram_reels_status` is left as `not_implemented` — nothing is attempted, and nothing needs configuring for it today.

When you're ready to build it, worth deciding between:
- An external video-compositing API (e.g. Shotstack, Cloudinary, Creatomate) called from the edge function — no new infra, but a new vendor/cost.
- A small dedicated ffmpeg-capable server (Render/Railway/a VPS) that the edge function calls out to — real infra to run and maintain, but full control.

## Hashtags

- Rule-based (always on, no credentials needed): breed → `#Breed #BreedGrooming`, area → `#Area #AreaDogGrooming`, plus `#DogGrooming #DirtyDawgGrooming`.
- AI (needs `ANTHROPIC_API_KEY`): 3-5 extra tags for variety, generated from the one-liner + breed + area.
- Instagram caption uses the combined set (capped at 15 tags). Facebook uses just the top 3 rule-based tags, kept minimal.
