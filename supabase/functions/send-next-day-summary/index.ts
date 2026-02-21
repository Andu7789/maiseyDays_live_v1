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

    if (!settings || !settings.enabled_next_day) {
      return new Response(JSON.stringify({ success: true, message: "Next-day summary disabled", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

    // Find all confirmed appointments for tomorrow
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("confirmed_date", tomorrowDateStr)
      .eq("booking_status", "confirmed")
      .order("confirmed_time", { ascending: true });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No appointments for tomorrow", sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by location
    const caisterApts = appointments.filter(apt => apt.locationid === 'caister');
    const wintertonApts = appointments.filter(apt => apt.locationid === 'winterton');

    const totalRevenue = appointments.reduce((sum, apt) => {
      const servicePrice = apt.serviceid === 'full-groom' ? 35 :
                          apt.serviceid === 'bath-brush' ? 25 :
                          apt.serviceid === 'puppy-intro' ? 15 :
                          apt.serviceid === 'nail-clipping' ? 12 :
                          apt.serviceid === 'home-grooming' ? 45 : 0;
      return sum + servicePrice;
    }, 0);

    const formatAppointmentList = (apts: typeof appointments) => {
      if (apts.length === 0) return '<p><em>No appointments</em></p>';

      return apts.map(apt => {
        const time = apt.confirmed_time || 'Time TBC';
        const serviceName = apt.serviceid === 'full-groom' ? 'Full Grooming Package' :
                           apt.serviceid === 'bath-brush' ? 'Bath, Blow-Dry & Brush' :
                           apt.serviceid === 'puppy-intro' ? 'Puppy Groom Experience' :
                           apt.serviceid === 'nail-clipping' ? 'Nail Clipping' :
                           apt.serviceid === 'home-grooming' ? 'Home Grooming' : 'Service';

        return `
      <div style="background: #f9fafb; padding: 15px; margin: 10px 0; border-left: 4px solid #10b981; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; color: #10b981;">${time} - ${apt.dogname} (${apt.dogbreed || 'Mixed Breed'})</h3>
        <div style="margin: 5px 0;"><strong>Service:</strong> ${serviceName}</div>
        <div style="margin: 5px 0;"><strong>Owner:</strong> ${apt.ownername} | <strong>Phone:</strong> <a href="tel:${apt.phone}">${apt.phone || 'N/A'}</a></div>
        ${apt.notes ? `<div style="margin: 5px 0; background: #fef3c7; padding: 8px; border-radius: 4px;"><strong>⚠️ Notes:</strong> ${apt.notes}</div>` : ''}
      </div>`;
      }).join('');
    };

    let emailBody = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .section { padding: 20px; background: white; margin-bottom: 20px; }
    .location-header { background: #065f46; color: white; padding: 10px 15px; border-radius: 6px; margin: 20px 0 10px 0; }
    .stats { background: #d1fae5; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">📅 Tomorrow's Grooming Schedule</h1>
      <p style="margin: 10px 0 0 0;">${tomorrow.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>

    <div class="section">
      <div class="stats">
        <h2 style="margin: 0 0 10px 0;">📊 Overview</h2>
        <p style="margin: 5px 0;"><strong>Total Appointments:</strong> ${appointments.length}</p>
        <p style="margin: 5px 0;"><strong>Caister:</strong> ${caisterApts.length} | <strong>Winterton:</strong> ${wintertonApts.length}</p>
        <p style="margin: 5px 0;"><strong>Estimated Revenue:</strong> £${totalRevenue}</p>
      </div>

      <div class="location-header">
        <h2 style="margin: 0;">🏢 Caister Branch (${caisterApts.length} appointments)</h2>
      </div>
      ${formatAppointmentList(caisterApts)}

      <div class="location-header">
        <h2 style="margin: 0;">🏡 Winterton Branch (${wintertonApts.length} appointments)</h2>
      </div>
      ${formatAppointmentList(wintertonApts)}

      <div style="margin-top: 30px; padding: 15px; background: #eff6ff; border-radius: 6px;">
        <h3 style="margin: 0 0 10px 0; color: #1e40af;">💡 Preparation Checklist</h3>
        <ul style="margin: 5px 0;">
          <li>Review special notes for any nervous dogs</li>
          <li>Check grooming supplies and equipment</li>
          <li>Confirm all appointment times with customers if needed</li>
          <li>Prepare reception area and workspace</li>
        </ul>
      </div>
    </div>

    <div class="footer">
      <p>This is an automated summary from Maisey Days @ Dirty Dawg booking system.</p>
      <p>View full schedule in your <a href="https://maiseydays.com/admin">admin panel</a>.</p>
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
        _subject: `📅 Tomorrow's Schedule - ${tomorrow.toLocaleDateString('en-GB')} (${appointments.length} appointments)`,
        email: settings.reminder_email,
        _replyto: settings.reminder_email,
        message: emailBody,
        _format: "html",
      }),
    });

    if (!emailResponse.ok) {
      throw new Error(`Email failed: ${emailResponse.statusText}`);
    }

    // Log the summary send
    await supabase.from("booking_reminders").insert({
      appointment_id: null, // Summary applies to multiple appointments
      reminder_type: "next_day_summary",
      sent_to: settings.reminder_email,
      email_status: "sent",
      email_subject: `Tomorrow's Schedule - ${tomorrow.toLocaleDateString('en-GB')}`,
    });

    return new Response(JSON.stringify({
      success: true,
      sent: 1,
      appointments: appointments.length,
      caister: caisterApts.length,
      winterton: wintertonApts.length,
      revenue: totalRevenue,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Next-day summary error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
