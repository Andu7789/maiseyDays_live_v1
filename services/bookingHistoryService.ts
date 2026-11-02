import { createClient } from "@supabase/supabase-js";
import { Appointment } from "../types";
import { LOCATIONS, SUPABASE_ANON_KEY, SUPABASE_URL } from "../constants";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Every booking create/change/delete is recorded by a database trigger into
// md_booking_history (see supabase/migrations/20261102_booking_history.sql).
// The app adds two kinds of note of its own: saves that failed, and messages sent.

export type BookingHistoryAction = "created" | "updated" | "deleted" | "restored" | "save_failed" | "message_sent";

export interface BookingHistoryEntry {
  id: number;
  appointment_id: string | null;
  action: BookingHistoryAction;
  changed_at: string;
  actor: string | null;
  old_row: Record<string, any> | null;
  new_row: Record<string, any> | null;
  changed_fields: string[] | null;
  details: Record<string, any> | null;
}

const HISTORY_COLUMNS = "id, appointment_id, action, changed_at, actor, old_row, new_row, changed_fields, details";

export const getBookingHistory = async (appointmentId: string): Promise<BookingHistoryEntry[]> => {
  const { data, error } = await supabase.from("md_booking_history").select(HISTORY_COLUMNS).eq("appointment_id", appointmentId).order("changed_at", { ascending: false });
  if (error) throw new Error(`Could not load booking history: ${error.message}`);
  return (data || []) as BookingHistoryEntry[];
};

/** Search by owner, dog, phone or email (case-insensitive). No query returns the most recent entries. */
export const searchBookingHistory = async (query: string, actions?: BookingHistoryAction[], limit = 200): Promise<BookingHistoryEntry[]> => {
  let request = supabase.from("md_booking_history").select(HISTORY_COLUMNS).order("changed_at", { ascending: false }).limit(limit);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  terms.forEach((term) => {
    request = request.ilike("search_text", `%${term.replace(/[%_]/g, "")}%`);
  });
  if (actions && actions.length > 0) request = request.in("action", actions);
  const { data, error } = await request;
  if (error) throw new Error(`Could not search booking history: ${error.message}`);
  return (data || []) as BookingHistoryEntry[];
};

/** For bookings in the list that have been put back from the recycle bin: booking id -> when it was last restored. */
export const getLastRestoredTimes = async (appointmentIds: string[]): Promise<Map<string, string>> => {
  const times = new Map<string, string>();
  if (appointmentIds.length === 0) return times;
  const { data } = await supabase.from("md_booking_history").select("appointment_id, changed_at").eq("action", "restored").in("appointment_id", appointmentIds);
  (data || []).forEach((row: any) => {
    const prev = times.get(row.appointment_id);
    if (!prev || row.changed_at > prev) times.set(row.appointment_id, row.changed_at);
  });
  return times;
};

/** Puts a deleted booking (and its photos) back in the diary exactly as it was. */
export const restoreDeletedBooking = async (historyId: number): Promise<string> => {
  const { data, error } = await supabase.rpc("md_restore_appointment", { p_history_id: historyId });
  if (error) throw new Error(error.message);
  return data as string;
};

const searchTextFor = (row: Partial<Appointment>) => [row.ownername, row.dogname, row.phone, row.email].filter(Boolean).join(" ").toLowerCase();

/**
 * Records a failed save or a message sent against a booking. Best effort: a
 * logging problem must never get in the way of what Rachel is doing, so this
 * never throws (and silently does nothing for website visitors, who can't write here).
 */
export const logBookingNote = async (action: "save_failed" | "message_sent", row: Partial<Appointment>, details: Record<string, unknown>) => {
  try {
    await supabase.from("md_booking_history").insert([
      {
        appointment_id: row.id || null,
        action,
        actor: "Admin page",
        new_row: row,
        details,
        search_text: searchTextFor(row),
      },
    ]);
  } catch (err) {
    console.warn("Booking history note not recorded:", err);
  }
};

// ---------- Display helpers ----------

const FIELD_LABELS: Record<string, string> = {
  ownername: "Owner",
  dogname: "Dog",
  dogbreed: "Breed",
  phone: "Phone",
  email: "Email",
  serviceid: "Service",
  locationid: "Location",
  date: "Requested date",
  time: "Requested time",
  requested_time_preference: "Requested time",
  confirmed_date: "Date",
  confirmed_time: "Time",
  confirmed_duration_minutes: "Length",
  booking_status: "Status",
  status: "Status",
  is_confirmed: "Confirmed",
  confirmed_at: "Confirmed at",
  confirmation_sent_at: "Confirmation sent",
  notes: "Notes",
  number_of_dogs: "Number of dogs",
  deposit_paid: "Deposit paid",
  deposit_amount: "Deposit amount",
  deposit_paid_at: "Deposit paid at",
  deposit_notes: "Deposit notes",
  deposit_refunded_at: "Deposit refunded",
  deposit_refund_method: "Refund method",
  deposit_credit_applied: "Credit applied",
  actual_price: "Price charged",
  estimated_price: "Estimated price",
  completed_at: "Completed at",
  missed: "Missed",
  missed_reason: "Missed reason",
  missed_at: "Missed at",
  rebook_contacted_at: "Rebook nudge sent",
  rebook_closed_at: "Removed from rebook list",
  reminder_28day_sent_at: "Rebook reminder sent",
};

// Fields that always change alongside another one already shown, so listing them adds noise.
const HIDDEN_FIELDS = new Set(["status", "is_confirmed", "confirmed_at", "requested_time_preference", "time"]);

const formatDay = (value: string) => {
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

export const formatHistoryTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const formatValue = (field: string, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field === "locationid") return LOCATIONS.find((l) => l.id === value)?.name || String(value);
  if (field === "confirmed_time") return String(value).slice(0, 5);
  if (field === "confirmed_duration_minutes") return `${value} mins`;
  if (field === "date" || field === "confirmed_date") return formatDay(String(value));
  if (field.endsWith("_at")) return formatHistoryTimestamp(String(value));
  if (["deposit_amount", "actual_price", "estimated_price", "deposit_credit_applied"].includes(field)) return `£${Number(value).toFixed(2)}`;
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

/** "Fila (Greta Koumi) · Fri 6 Nov 2026 09:00 · Caister Branch" for whichever snapshot the entry has. */
export const describeBooking = (entry: BookingHistoryEntry) => {
  const row = entry.new_row || entry.old_row || {};
  const day = row.confirmed_date || row.date;
  const time = row.confirmed_time ? String(row.confirmed_time).slice(0, 5) : row.time || "";
  const location = LOCATIONS.find((l) => l.id === row.locationid)?.name || row.locationid || "";
  return [`${row.dogname || "?"}${row.ownername ? ` (${String(row.ownername).trim()})` : ""}`, day ? `${formatDay(String(day))}${time ? ` ${time}` : ""}` : "", location].filter(Boolean).join(" · ");
};

/** One line per meaningful field change, e.g. "Date: Fri 6 Nov 2026 → Tue 10 Nov 2026". */
export const describeChanges = (entry: BookingHistoryEntry): string[] => {
  if (entry.action !== "updated" || !entry.changed_fields) return [];
  const visible = entry.changed_fields.filter((f) => !HIDDEN_FIELDS.has(f));
  const fields = visible.length > 0 ? visible : entry.changed_fields;
  return fields.map((field) => `${FIELD_LABELS[field] || field}: ${formatValue(field, entry.old_row?.[field])} → ${formatValue(field, entry.new_row?.[field])}`);
};

export const ACTION_LABELS: Record<BookingHistoryAction, string> = {
  created: "Booked",
  updated: "Changed",
  deleted: "Deleted",
  restored: "Restored",
  save_failed: "Save failed",
  message_sent: "Message",
};
