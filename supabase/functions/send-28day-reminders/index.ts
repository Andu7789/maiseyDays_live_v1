import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("APP_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: "Missing Supabase credentials" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get reminder settings
    const { data: settings } = await supabase
      .from("reminder_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (!settings || !settings.enabled_28day) {
      return new Response(JSON.stringify({ success: true, message: "28-day reminders disabled", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const daysInterval = settings.days_interval || 28;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysInterval);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find completed bookings that are exactly N days old and haven't had reminder sent
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("booking_status", "completed")
      .eq("completed_at::date", targetDateStr)
      .is("reminder_28day_sent_at", null);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No bookings due for reminder", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailsSent = 0;
    const errors: string[] = [];

    // Group by location if split_by_location is enabled
    const groupedAppointments = settings.split_by_location
      ? appointments.reduce((acc, apt) => {
          const loc = apt.locationid || 'unknown';
          if (!acc[loc]) acc[loc] = [];
          acc[loc].push(apt);
          return acc;
        }, {} as Record<string, typeof appointments>)
      : { all: appointments };

    // Send emails for each group
    for (const [location, apts] of Object.entries(groupedAppointments)) {
      try {
        const locationName = location === 'caister' ? 'Caister' : location === 'winterton' ? 'Winterton' : 'All Locations';

        let emailBody = `🐾 ${daysInterval}-DAY REBOOKING REMINDER
${locationName} - ${new Date().toLocaleDateString('en-GB')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi there!

The following customers are due for their next grooming appointment (${daysInterval} days since last visit):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        for (const apt of apts) {
          const completedDate = new Date(apt.completed_at).toLocaleDateString('en-GB');
          const serviceName = apt.serviceid || 'Unknown Service';

          emailBody += `
${apt.dogname} (${apt.dogbreed || 'Mixed Breed'})
---
Owner: ${apt.ownername}
Phone: ${apt.phone || 'N/A'}
Email: ${apt.email || 'N/A'}
Last Service: ${serviceName}
Last Visit: ${completedDate}
Location: ${locationName}${apt.notes ? `\n⚠️ Notes: ${apt.notes}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }

        emailBody += `
✅ ACTION REQUIRED: Contact these customers to schedule their next grooming appointment!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated reminder from Maisey Days @ Dirty Dawg.
Manage reminder settings in your admin panel.
`;

        // Send email using Formspree
        const emailEndpoint = "https://formspree.io/f/xnjvowlz";
        const emailResponse = await fetch(emailEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _subject: `🐾 ${daysInterval}-Day Rebooking Reminders - ${locationName} (${apts.length} customers)`,
            email: settings.reminder_email,
            _replyto: settings.reminder_email,
            message: emailBody,
          }),
        });

        if (!emailResponse.ok) {
          throw new Error(`Email failed: ${emailResponse.statusText}`);
        }

        emailsSent++;

        // Update appointments and log
        for (const apt of apts) {
          await supabase
            .from("appointments")
            .update({
              booking_status: "due_for_rebook",
              reminder_28day_sent_at: new Date().toISOString(),
            })
            .eq("id", apt.id);

          await supabase.from("booking_reminders").insert({
            appointment_id: apt.id,
            reminder_type: "28_day_reminder",
            sent_to: settings.reminder_email,
            email_status: "sent",
            email_subject: `${daysInterval}-Day Rebooking Reminders - ${locationName}`,
          });
        }

      } catch (err: any) {
        errors.push(`${location}: ${err.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      sent: emailsSent,
      appointments: appointments.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("28-day reminder error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
