-- "Star of the Week" posts: an admin picks a dog, uploads before/after
-- photos and a one-liner, and the record drives both the public site
-- section and (independently, per platform) auto-posting to Facebook,
-- Instagram and Google Business Profile via the star-post-publish edge
-- function. Each platform gets its own status/error/posted_at columns so
-- one platform failing (or its credentials not being configured yet)
-- never blocks the others or the row itself.
--
-- Instagram Reels needs a before/after crossfade video, which requires
-- ffmpeg — nothing in this stack (static SPA + Supabase edge functions)
-- can run that today, so it's tracked as its own status but the publish
-- function always leaves it 'not_implemented' rather than attempting it.
CREATE TABLE IF NOT EXISTS star_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  before_photo_url text NOT NULL,
  after_photo_url text NOT NULL,
  one_liner text NOT NULL,
  dog_name text NOT NULL,
  breed text NOT NULL,
  area text NOT NULL,
  hashtags text[] NOT NULL DEFAULT '{}',

  facebook_status text NOT NULL DEFAULT 'pending' CHECK (facebook_status IN ('pending', 'posted', 'failed', 'skipped')),
  facebook_error text,
  facebook_posted_at timestamptz,

  instagram_status text NOT NULL DEFAULT 'pending' CHECK (instagram_status IN ('pending', 'posted', 'failed', 'skipped')),
  instagram_error text,
  instagram_posted_at timestamptz,

  instagram_reels_status text NOT NULL DEFAULT 'not_implemented' CHECK (instagram_reels_status IN ('pending', 'posted', 'failed', 'skipped', 'not_implemented')),
  instagram_reels_error text,
  instagram_reels_posted_at timestamptz,

  google_business_status text NOT NULL DEFAULT 'pending' CHECK (google_business_status IN ('pending', 'posted', 'failed', 'skipped')),
  google_business_error text,
  google_business_posted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS star_posts_created_at_idx ON star_posts (created_at DESC);

ALTER TABLE star_posts ENABLE ROW LEVEL SECURITY;

-- Public site reads the feed; only authenticated admins create/manage rows.
-- The star-post-publish edge function uses the service role key (bypasses
-- RLS) to write per-platform status after attempting each post.
CREATE POLICY "Allow public to read star_posts" ON star_posts FOR SELECT TO public USING (true);
CREATE POLICY "Allow admins to manage star_posts" ON star_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public bucket: before/after photos are shown on the public "Stars of the
-- Week" section as well as pushed out to Facebook/Instagram/Google.
INSERT INTO storage.buckets (id, name, public) VALUES ('star-posts', 'star-posts', true)
ON CONFLICT (id) DO NOTHING;
