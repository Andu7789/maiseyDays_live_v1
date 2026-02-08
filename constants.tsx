import { Service, Location } from "./types";

// EMAIL CONFIGURATION (Formspree - Business Bookings)
export const EMAIL_ENDPOINT = "https://formspree.io/f/xnjvowlz";

// EMAIL CONFIGURATION (EmailJS - Customer Confirmations)
export const EMAILJS_PUBLIC_KEY = "FimgDIgYCermEEAUS";
export const EMAILJS_SERVICE_ID = "service_n31emcr";
export const EMAILJS_CONFIRMATION_TEMPLATE_ID = "template_huea638";

// DATABASE CONFIGURATION (Supabase)
export const SUPABASE_URL = "https://rmooksnngqyzqraeicvr.supabase.co";

/**
 * PASTE YOUR KEY HERE
 * It should be the very long string starting with "eyJ..."
 */
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb29rc25uZ3F5enFyYWVpY3ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3OTU2NDgsImV4cCI6MjA4NTM3MTY0OH0.N4COImAWUpLz7yS4OJM4Tgsew-On6s_5ee0_F6pw3-c";

export const SERVICES: Service[] = [
  {
    id: "full-groom",
    name: "Full Grooming Package",
    price: "From £35",
    duration: "2-3 Hours",
    description: "Includes a bath, blow-dry, styling, de-shedding, nail trim, paw pads, ear cleaning, and hygiene trim.",
    image: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: "bath-brush",
    name: "Bath, Blow-Dry & Brush",
    price: "From £25",
    duration: "1-1.5 Hours",
    description: "Includes a bath, blow-dry, brush and removal of small matts",
    image: "https://images.unsplash.com/photo-1535930891776-0c2dfb7fda1a?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: "puppy-intro",
    name: "Puppy Groom Experience",
    price: "From £15",
    duration: "30 mins to 1hr",
    description: "A gentle introduction for puppies, introducing them to grooming in a calm and positive way",
    image: "/image0.png",
  },
  {
    id: "nail-clipping",
    name: "Nail Clipping",
    price: "From £12",
    duration: "+30 Mins",
    description: "Professional nail trimming to keep your dog's paws healthy and comfortable. Option extra, paw pads trim available.",
    image: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&q=80&w=800",
  },
];

export const LOCATIONS: Location[] = [
  {
    id: "caister",
    name: "Caister Branch",
    address: "49a High Street, Caister on Sea, NR30 5EL",
    phone: "07368 465966",
    hours: "Mon-Sun: 8am - 8pm",
    image: "/locations/Dirty.jpg",
    coordinates: {
      lat: 52.6406,
      lng: 1.749,
    },
  },
  {
    id: "winterton",
    name: "Winterton Branch",
    address: "Winterton Hound Ground, Winterton-on-Sea, Norfolk, NR29 4BX",
    phone: "07368 465966",
    hours: "Mon-Sun: 8am - 8pm",
    image: "/locations/caister.png",
    coordinates: {
      lat: 52.7264,
      lng: 1.6313,
    },
  },
];

export const STANDARD_HOURS = ["Morning", "Afternoon", "Evening"];
