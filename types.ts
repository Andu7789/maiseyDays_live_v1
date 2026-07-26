export type Page = "home" | "services" | "about" | "locations" | "gallery" | "booking" | "admin" | "privacy" | "intake";

export type IntakeStatus = "not_sent" | "sent" | "completed";

export interface Dog {
  id?: string;
  customer_id?: string;
  name: string;
  breed?: string | null;
  dob?: string | null;
  sex?: "male" | "female" | null;
  neutered?: boolean | null;
  vaccinated?: boolean | null;
  behaviour_notes?: string | null;
  health_conditions?: string | null;
  needs_prescribed_shampoo?: boolean | null;
  medication_details?: string | null;
  needs_muzzle?: boolean | null;
}

export interface Customer {
  id: string;
  ownername: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  hear_about_us?: string | null;
  sms_ok?: boolean | null;
  alt_contact_name?: string | null;
  alt_contact_phone?: string | null;
  vet_name?: string | null;
  emergency_vet_name?: string | null;
  emergency_vet_phone?: string | null;
  emergency_vet_address?: string | null;
  treats_ok?: boolean | null;
  photo_consent?: boolean | null;
  intake_token?: string | null;
  intake_status: IntakeStatus;
  intake_sent_at?: string | null;
  intake_sent_via?: string | null;
  intake_completed_at?: string | null;
  signature_data?: string | null;
  signed_at?: string | null;
  terms_version?: string | null;
  matting_required?: boolean;
  matting_signed_at?: string | null;
  matting_signed_via?: string | null;
  matting_signature?: string | null;
  review_link_sent_at?: string | null;
  review_link_sent_via?: string | null;
  source?: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  dogs?: Dog[];
}

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
  created_at?: string;
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
  deposit_refunded_at?: string | null;
  estimated_price?: number | null;
  missed?: boolean;
  missed_reason?: string | null;
  missed_at?: string | null;
  customer_id?: string | null;
  number_of_dogs?: number;
  actual_price?: number | null;
  rebook_contacted_at?: string | null;
  rebook_closed_at?: string | null;
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
