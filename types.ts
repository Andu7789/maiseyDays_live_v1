export type Page = "home" | "services" | "about" | "locations" | "gallery" | "booking" | "admin" | "privacy";

export interface Service {
  id: string;
  name: string;
  price: string;
  duration: string;
  description: string;
  image: string;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  image: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface Appointment {
  id?: string;
  ownername: string;
  email: string;
  phone?: string;
  dogname: string;
  dogbreed: string;
  serviceid: string;
  locationid: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  notes: string;
  status: "pending" | "confirmed" | "cancelled";
  marketingConsent?: "yes" | "no";
  requested_time_preference?: string;
  confirmed_date?: string | null;
  confirmed_time?: string | null;
  confirmed_duration_minutes?: number | null;
  is_confirmed?: boolean;
  confirmed_at?: string | null;
  confirmation_sent_at?: string | null;
  booking_source?: "web" | "manual";
  calendar_event_id?: string | null;
  calendar_sync_status?: "not_synced" | "synced" | "error";
  calendar_last_synced_at?: string | null;
  calendar_last_error?: string | null;
  booking_status?: "pending" | "confirmed" | "completed" | "due_for_rebook" | "cancelled";
  completed_at?: string | null;
  reminder_28day_sent_at?: string | null;
  parent_booking_id?: string | null;
  is_repeat_booking?: boolean;
  deposit_paid?: boolean;
  deposit_amount?: number;
  deposit_paid_at?: string | null;
  deposit_notes?: string;
}

export interface AvailabilitySlot {
  locationId: string;
  date: string;
  time: string;
  isAvailable: boolean;
}

export interface WeeklyTemplate {
  [locationId: string]: {
    [dayOfWeek: number]: string[];
  };
}
