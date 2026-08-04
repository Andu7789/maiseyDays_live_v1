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
      if (apts.length === 0) return 'No appointments\n';

      return apts.map(apt => {
        const time = apt.confirmed_time || 'Time TBC';
        const serviceName = apt.serviceid === 'full-groom' ? 'Full Grooming Package' :
                           apt.serviceid === 'bath-brush' ? 'Bath, Blow-Dry & Brush' :
                           apt.serviceid === 'puppy-intro' ? 'Puppy Groom Experience' :
                           apt.serviceid === 'nail-clipping' ? 'Nail Clipping' :
                           apt.serviceid === 'home-grooming' ? 'Home Grooming' : 'Service';

        let text = `\n${time} - ${apt.dogname} (${apt.dogbreed || 'Mixed Breed'})\n`;
        text += `  Service: ${serviceName}\n`;
        text += `  Owner: ${apt.ownername}\n`;
        text += `  Phone: ${apt.phone || 'N/A'}\n`;
        if (apt.notes) text += `  ⚠️ NOTES: ${apt.notes}\n`;
        return text;
      }).join('\n---\n');
    };

    let emailBody = `📅 TOMORROW'S GROOMING SCHEDULE
${tomorrow.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Appointments: ${appointments.length}
Caister: ${caisterApts.length} | Winterton: ${wintertonApts.length}
Estimated Revenue: £${totalRevenue}


🏢 CAISTER BRANCH (${caisterApts.length} appointments)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatAppointmentList(caisterApts)}

🏡 WINTERTON BRANCH (${wintertonApts.length} appointments)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatAppointmentList(wintertonApts)}

💡 PREPARATION CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Review special notes for any nervous dogs
• Check grooming supplies and equipment
• Confirm all appointment times with customers if needed
• Prepare reception area and workspace

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This is an automated summary from Maisey Days Dog Grooming.
View full schedule: https://maiseydays.com/admin
`;

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
