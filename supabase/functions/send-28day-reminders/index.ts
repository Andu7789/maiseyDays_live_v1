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

        let emailBody = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .booking { background: #f9fafb; padding: 15px; margin: 10px 0; border-left: 4px solid #10b981; border-radius: 4px; }
    .booking h3 { margin: 0 0 10px 0; color: #10b981; }
    .detail { margin: 5px 0; }
    .label { font-weight: bold; color: #666; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🐾 ${daysInterval}-Day Rebooking Reminder</h1>
      <p style="margin: 10px 0 0 0;">${locationName} - ${new Date().toLocaleDateString('en-GB')}</p>
    </div>

    <div style="padding: 20px; background: white;">
      <p>Hi there!</p>
      <p>The following customers are due for their next grooming appointment (${daysInterval} days since last visit):</p>
`;

        for (const apt of apts) {
          const completedDate = new Date(apt.completed_at).toLocaleDateString('en-GB');
          const serviceName = apt.serviceid || 'Unknown Service';

          emailBody += `
      <div class="booking">
        <h3>${apt.dogname} (${apt.dogbreed || 'Mixed Breed'})</h3>
        <div class="detail"><span class="label">Owner:</span> ${apt.ownername}</div>
        <div class="detail"><span class="label">Phone:</span> <a href="tel:${apt.phone}">${apt.phone || 'N/A'}</a></div>
        <div class="detail"><span class="label">Email:</span> <a href="mailto:${apt.email}">${apt.email || 'N/A'}</a></div>
        <div class="detail"><span class="label">Last Service:</span> ${serviceName}</div>
        <div class="detail"><span class="label">Last Visit:</span> ${completedDate}</div>
        <div class="detail"><span class="label">Location:</span> ${locationName}</div>
        ${apt.notes ? `<div class="detail"><span class="label">Notes:</span> ${apt.notes}</div>` : ''}
      </div>
`;
        }

        emailBody += `
      <p><strong>Action Required:</strong> Contact these customers to schedule their next grooming appointment!</p>
    </div>

    <div class="footer">
      <p>This is an automated reminder from Maisey Days @ Dirty Dawg booking system.</p>
      <p>Manage your reminder settings in the admin panel.</p>
    </div>
  </div>
</body>
</html>`;

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
            _format: "html",
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
