import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Fields the public form is allowed to read/write on the customer record
const CUSTOMER_FIELDS = [
  "ownername",
  "email",
  "phone",
  "address",
  "hear_about_us",
  "sms_ok",
  "alt_contact_name",
  "alt_contact_phone",
  "vet_name",
  "emergency_vet_name",
  "emergency_vet_phone",
  "emergency_vet_address",
  "treats_ok",
  "photo_consent",
];

const DOG_FIELDS = ["name", "breed", "dob", "sex", "neutered", "vaccinated", "behaviour_notes", "health_conditions", "needs_prescribed_shampoo", "medication_details", "needs_muzzle"];

const pick = (source: Record<string, unknown>, fields: string[]) => {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) result[field] = source[field];
  }
  return result;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const token = String(body.token || "").trim();

    if (!token || token.length < 16) {
      return jsonResponse({ success: false, error: "Invalid link." });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: customer, error: lookupError } = await supabase.from("customers").select("*").eq("intake_token", token).maybeSingle();

    if (lookupError) {
      console.error("Customer lookup failed:", lookupError);
      return jsonResponse({ success: false, error: "Something went wrong. Please try again." });
    }
    if (!customer) {
      return jsonResponse({ success: false, error: "This link is not valid or has expired. Please contact us for a new one." });
    }

    if (action === "load") {
      const { data: dogs } = await supabase.from("dogs").select("*").eq("customer_id", customer.id).order("created_at", { ascending: true });
      return jsonResponse({
        success: true,
        customer: pick(customer, CUSTOMER_FIELDS),
        dogs: (dogs || []).map((dog: Record<string, unknown>) => pick(dog, ["id", ...DOG_FIELDS])),
        alreadyCompleted: customer.intake_status === "completed",
      });
    }

    if (action === "submit") {
      const customerUpdates = pick(body.customer || {}, CUSTOMER_FIELDS);
      const signature = String(body.signature || "");
      const dogs = Array.isArray(body.dogs) ? body.dogs : [];

      if (!signature.startsWith("data:image/")) {
        return jsonResponse({ success: false, error: "Signature is missing." });
      }
      if (signature.length > 500_000) {
        return jsonResponse({ success: false, error: "Signature image is too large." });
      }

      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("customers")
        .update({
          ...customerUpdates,
          signature_data: signature,
          signed_at: nowIso,
          terms_version: String(body.termsVersion || ""),
          intake_status: "completed",
          intake_completed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", customer.id);

      if (updateError) {
        console.error("Customer update failed:", updateError);
        return jsonResponse({ success: false, error: "Could not save your details. Please try again." });
      }

      for (const rawDog of dogs) {
        const dogData = pick(rawDog || {}, DOG_FIELDS);
        const name = String(dogData.name || "").trim();
        if (!name) continue;
        dogData.name = name;

        // Match existing dog by name (case-insensitive) so booking-created dogs get enriched
        const { data: existing } = await supabase.from("dogs").select("id").eq("customer_id", customer.id).ilike("name", name).maybeSingle();

        if (existing) {
          await supabase
            .from("dogs")
            .update({ ...dogData, updated_at: nowIso })
            .eq("id", existing.id);
        } else {
          await supabase.from("dogs").insert([{ ...dogData, customer_id: customer.id }]);
        }
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: "Unknown action." });
  } catch (error) {
    console.error("intake-form error:", error);
    return jsonResponse({ success: false, error: "Something went wrong. Please try again." });
  }
});
