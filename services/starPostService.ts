import { createClient } from "@supabase/supabase-js";
import { StarPost } from "../types";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../constants";
import { invokeEdgeFunction } from "./bookingService";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STAR_PHOTO_BUCKET = "star-posts";

/** Full rows (including per-platform status/error detail) for the admin Stars tab. */
export const getStarPosts = async (): Promise<StarPost[]> => {
  const { data, error } = await supabase.from("star_posts").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
};

/** Display-only columns for the public site — the table's RLS lets anyone read it via the REST API directly, so this deliberately leaves out the per-platform error text (which can echo back detail from Meta/Google's API responses). */
export const getPublicStarPosts = async (): Promise<StarPost[]> => {
  const { data, error } = await supabase
    .from("star_posts")
    .select("id, before_photo_url, after_photo_url, one_liner, dog_name, breed, area, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as StarPost[]) || [];
};

/** Uploads a before/after photo and returns its public URL. */
export const uploadStarPhoto = async (tempId: string, kind: "before" | "after", photo: File): Promise<string> => {
  const timestamp = Date.now();
  const fileExt = photo.name.split(".").pop() || "jpg";
  const filePath = `${tempId}-${kind}-${timestamp}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from(STAR_PHOTO_BUCKET).upload(filePath, photo, {
    cacheControl: "3600",
    upsert: false,
    contentType: photo.type || "image/jpeg",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(STAR_PHOTO_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error("Unable to generate photo URL.");
  return data.publicUrl;
};

export interface NewStarPost {
  before_photo_url: string;
  after_photo_url: string;
  one_liner: string;
  dog_name: string;
  breed: string;
  area: string;
}

/** Creates the row, then kicks off publishing (hashtag generation + per-platform posting). Publishing failures don't undo the insert — the row and its post form the public record either way. */
export const createStarPost = async (post: NewStarPost): Promise<StarPost> => {
  const { data, error } = await supabase.from("star_posts").insert([post]).select("*").single();
  if (error) throw new Error(error.message);

  try {
    await publishStarPost(data.id);
  } catch {
    // Publishing runs independently per platform and already records its own
    // failures on the row; a failure to even reach the edge function just
    // means the admin retries from the list, same as any other platform failure.
  }

  return data;
};

/** (Re)runs hashtag generation + per-platform posting for an existing post. Safe to call again to retry platforms that previously failed or were skipped for missing credentials. */
export const publishStarPost = async (id: string) => invokeEdgeFunction("star-post-publish", { id });

export const deleteStarPost = async (post: StarPost) => {
  const { error } = await supabase.from("star_posts").delete().eq("id", post.id);
  if (error) throw new Error(error.message);
};
