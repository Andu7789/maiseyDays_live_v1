import { createClient } from "@supabase/supabase-js";
import { Service } from "../types";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SERVICES } from "../constants";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SERVICE_PHOTO_BUCKET = "service-photos";

// Both the public site and the admin dashboard call getServiceCatalog() on
// load (and after any edit), which keeps this warm. Message-building code
// (SMS/email text, which can't await a fetch mid-send) reads from it via
// getServiceNameSync so a custom service's real name shows up in customer
// texts, not its raw id.
let cachedCatalog: Service[] = SERVICES;

/** Live service catalog from the database. Falls back to the built-in list if the fetch fails, so the booking page never ends up with zero services. */
export const getServiceCatalog = async (): Promise<Service[]> => {
  const { data, error } = await supabase.from("service_catalog").select("id, name, price, duration, description, image").order("display_order", { ascending: true });
  if (error || !data || data.length === 0) return SERVICES;
  cachedCatalog = data;
  return data;
};

/** Synchronous name lookup against the most recently loaded catalog snapshot. Falls back to the raw id if it's never been fetched or the id is unrecognized. */
export const getServiceNameSync = (serviceId: string): string => cachedCatalog.find((s) => s.id === serviceId)?.name || serviceId;

export const createServiceCatalogEntry = async (service: Service, displayOrder: number) => {
  const { error } = await supabase.from("service_catalog").insert([{ ...service, display_order: displayOrder }]);
  if (error) throw new Error(error.message);
};

export const updateServiceCatalogEntry = async (id: string, updates: Partial<Service>) => {
  const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  delete payload.id;
  const { error } = await supabase.from("service_catalog").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
};

export const deleteServiceCatalogEntry = async (id: string) => {
  const { error } = await supabase.from("service_catalog").delete().eq("id", id);
  if (error) throw new Error(error.message);
};

/** Uploads a service photo and returns its public URL. */
export const uploadServicePhoto = async (serviceId: string, photo: File): Promise<string> => {
  const timestamp = Date.now();
  const fileExt = photo.name.split(".").pop() || "jpg";
  const filePath = `${serviceId}-${timestamp}.${fileExt}`;

  const { error: uploadError } = await supabase.storage.from(SERVICE_PHOTO_BUCKET).upload(filePath, photo, {
    cacheControl: "3600",
    upsert: false,
    contentType: photo.type || "image/jpeg",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(SERVICE_PHOTO_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error("Unable to generate photo URL.");
  return data.publicUrl;
};
