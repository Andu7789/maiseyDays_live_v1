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
