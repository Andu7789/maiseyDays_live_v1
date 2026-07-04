import { createClient } from "@supabase/supabase-js";
import { Customer, Dog } from "../types";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../constants";
import { invokeEdgeFunction } from "./bookingService";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// CUSTOMER CRUD (admin side)
// ============================================================

export const getCustomers = async (): Promise<Customer[]> => {
  const [customersResult, dogsResult] = await Promise.all([
    supabase.from("customers").select("*").order("created_at", { ascending: false }),
    supabase.from("dogs").select("*"),
  ]);
  if (customersResult.error) throw new Error(customersResult.error.message);

  const dogsByCustomer: Record<string, Dog[]> = {};
  for (const dog of dogsResult.data || []) {
    if (!dogsByCustomer[dog.customer_id]) dogsByCustomer[dog.customer_id] = [];
    dogsByCustomer[dog.customer_id].push(dog);
  }

  return (customersResult.data || []).map((c: any) => ({
    ...c,
    intake_status: c.intake_status || "not_sent",
    dogs: dogsByCustomer[c.id] || [],
  }));
};

export const createCustomer = async (details: { ownername: string; email?: string; phone?: string }): Promise<Customer> => {
  const payload: Record<string, unknown> = {
    ownername: details.ownername.trim(),
    source: "manual",
  };
  if (details.email?.trim()) payload.email = details.email.trim();
  if (details.phone?.trim()) payload.phone = details.phone.trim();

  const { data, error } = await supabase.from("customers").insert([payload]).select();
  if (error) {
    if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
      throw new Error("A customer with this email already exists.");
    }
    throw new Error(error.message);
  }
  return { ...data[0], dogs: [] };
};

export const updateCustomer = async (id: string, updates: Partial<Customer>) => {
  const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
  delete payload.id;
  delete payload.dogs;
  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
};

export const deleteCustomer = async (id: string) => {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw new Error(error.message);
};

/** Inserts a new dog or updates an existing one (matched by dog.id). */
export const saveDog = async (customerId: string, dog: Dog) => {
  const payload: Record<string, unknown> = {
    name: dog.name.trim(),
    breed: dog.breed || null,
    dob: dog.dob || null,
    sex: dog.sex || null,
    neutered: dog.neutered ?? null,
    vaccinated: dog.vaccinated ?? null,
    behaviour_notes: dog.behaviour_notes || null,
    health_conditions: dog.health_conditions || null,
    needs_prescribed_shampoo: dog.needs_prescribed_shampoo ?? null,
    medication_details: dog.medication_details || null,
    needs_muzzle: dog.needs_muzzle ?? null,
    updated_at: new Date().toISOString(),
  };
  if (dog.id) {
    const { error } = await supabase.from("dogs").update(payload).eq("id", dog.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("dogs").insert([{ ...payload, customer_id: customerId }]);
    if (error) throw new Error(error.message);
  }
};

export const deleteDog = async (dogId: string) => {
  const { error } = await supabase.from("dogs").delete().eq("id", dogId);
  if (error) throw new Error(error.message);
};

// ============================================================
// INTAKE FORM LINK + SENDING
// ============================================================

const generateToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Returns the customer's intake token, generating and saving one if needed. */
export const ensureIntakeToken = async (customer: Customer): Promise<string> => {
  if (customer.intake_token) return customer.intake_token;
  const token = generateToken();
  const { error } = await supabase.from("customers").update({ intake_token: token, updated_at: new Date().toISOString() }).eq("id", customer.id);
  if (error) throw new Error(error.message);
  return token;
};

export const buildIntakeLink = (token: string) => {
  return `${window.location.origin}${window.location.pathname}#intake=${token}`;
};

export const buildIntakeMessage = (customer: Customer, link: string) => {
  const firstName = (customer.ownername || "").trim().split(/\s+/)[0] || "there";
  return `Hi ${firstName}, thanks for booking with Maisey Days @ Dirty Dawg! 🐾 Please fill in our quick grooming agreement form before your appointment - it only takes a couple of minutes:\n\n${link}`;
};

const normalizeUkPhoneDigits = (raw: string) => {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  if (cleaned.startsWith("0")) return `44${cleaned.slice(1)}`;
  if (cleaned.startsWith("44")) return cleaned;
  return cleaned;
};

/** Free channel: opens WhatsApp with the message pre-filled, ready to send. */
export const buildWhatsAppLink = (phone: string, message: string) => {
  return `https://wa.me/${normalizeUkPhoneDigits(phone)}?text=${encodeURIComponent(message)}`;
};

/** Paid channel (~4p): sends the link by SMS via the existing Vonage function. */
export const sendIntakeSms = async (customer: Customer, message: string) => {
  if (!customer.phone) throw new Error("Customer phone number is missing.");
  const result = await invokeEdgeFunction("send-customer-confirmation-sms", {
    to: customer.phone,
    message,
    bookingId: customer.id,
  });
  if (!(result as any)?.success) {
    throw new Error((result as any)?.error || "SMS provider rejected the message.");
  }
};

/** Free channel: sends the link by email via Resend. */
export const sendIntakeEmail = async (customer: Customer, link: string) => {
  if (!customer.email) throw new Error("Customer email is missing.");
  const result = await invokeEdgeFunction("send-intake-email", {
    to: customer.email,
    name: customer.ownername,
    link,
  });
  if (!(result as any)?.success) {
    throw new Error((result as any)?.error || "Email failed to send.");
  }
};

export const markIntakeSent = async (customerId: string, channel: "whatsapp" | "sms" | "email") => {
  const { error } = await supabase
    .from("customers")
    .update({
      intake_status: "sent",
      intake_sent_at: new Date().toISOString(),
      intake_sent_via: channel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .neq("intake_status", "completed");
  if (error) throw new Error(error.message);
};

// ============================================================
// PUBLIC INTAKE FORM (token-validated, goes through edge function)
// ============================================================

export interface IntakePrefill {
  customer: Partial<Customer>;
  dogs: Dog[];
  alreadyCompleted: boolean;
  mattingRequired: boolean;
  mattingAlreadySigned: boolean;
}

const invokeIntakeFunction = async (payload: Record<string, unknown>) => {
  try {
    return await invokeEdgeFunction("intake-form", payload);
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("could not reach") || message.includes("fetch") || message.includes("network")) {
      throw new Error("Could not connect. Please check your internet connection and try again.");
    }
    throw error;
  }
};

export const loadIntakeForm = async (token: string): Promise<IntakePrefill> => {
  const result = await invokeIntakeFunction({ action: "load", token });
  if (!(result as any)?.success) {
    throw new Error((result as any)?.error || "This link is not valid.");
  }
  return {
    customer: (result as any).customer || {},
    dogs: (result as any).dogs || [],
    alreadyCompleted: Boolean((result as any).alreadyCompleted),
    mattingRequired: Boolean((result as any).mattingRequired),
    mattingAlreadySigned: Boolean((result as any).mattingAlreadySigned),
  };
};

export const submitIntakeForm = async (token: string, customer: Partial<Customer>, dogs: Dog[], signatureData: string, termsVersion: string, mattingConsent = false) => {
  const result = await invokeIntakeFunction({
    action: "submit",
    token,
    customer,
    dogs,
    signature: signatureData,
    termsVersion,
    mattingConsent,
  });
  if (!(result as any)?.success) {
    throw new Error((result as any)?.error || "Could not submit the form. Please try again.");
  }
};

/** Records matting consent only — used when the main agreement is already signed. */
export const submitMattingConsent = async (token: string, signatureData: string) => {
  const result = await invokeIntakeFunction({ action: "submit-matting", token, signature: signatureData });
  if (!(result as any)?.success) {
    throw new Error((result as any)?.error || "Could not submit the form. Please try again.");
  }
};
