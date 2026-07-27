import { Service, Location } from "./types";

// EMAIL CONFIGURATION (Formspree - Business Bookings)
export const EMAIL_ENDPOINT = "https://formspree.io/f/xnjvowlz";

// Customer-facing confirmation emails (booking received, holiday enquiry) are sent
// via the send-customer-email edge function using Resend on the verified domain.

// GROOMING AGREEMENT (customer intake form)
export const INTAKE_TERMS_VERSION = "2026-07";
export const INTAKE_TERMS: string[] = [
  "Please tell us if your dog is aggressive with people/other pets, we may need to use a muzzle if we deem necessary.",
  "In accordance with the Animal Welfare Act, we will not spend more than 15 minutes de-matting. A matted coat may result in us having to clip the coat short all over - our priority here is comfort as matting can be painful for the dog and dangerous to remove. There is an extra charge for matted dogs due to the extra time it takes and excess wear and tear to equipment.",
  "For some dogs, grooming procedures can be stressful and can expose hidden medical problems or aggravate a current one during or after the groom. We will obtain immediate veterinary treatment for your dog should it be deemed necessary, and it is agreed that all expenses for veterinary care will be covered by the owner upon signing this contract/agreement.",
  "We reserve the right to refuse/stop services at any time before or during the grooming process, this could be due (but not limited) to an aggressive/stressed dog, health concerns or finding fleas.",
  "If we find fleas on your dog, you will be contacted and we will advise you on the options we can offer you. We may need you to collect your dog immediately. Alternatively, with your consent, we may be able to use a temporary flea shampoo as a short-term measure. A flea-cleaning fee will also be required to sanitise the salon and equipment before the next client. If you turn up with your dog knowing they have fleas prior to the start of the groom, then you will be sent away but still charged 50% of the full groom price plus the £5 extra flea charge as we will need to clean down everything and disinfect the salon. As it will be short notice, we won't be able to fill your appointment slot.",
  "We will attempt to remove ticks ourselves. We believe it is something that may need to have your vet's advice on after. If we find any ticks, we will attempt to remove them if safe to do so. We will only remove up to 3 on one dog. However, if there are more ticks we will cease the groom and call you to come collect your dog. We will always advise a vet visit if this is the case.",
  "Late collection may result in a fee of £10/hour as we do not have facilities to keep your dog longer than the appointment.",
  "A late charge will be required if you are more than 30 minutes late to your dedicated appointment as we will have to reschedule.",
  "A £20 deposit per dog is required at the time of booking. This deposit will be deducted from the total cost of the groom. If you cancel with less than 24 hours' notice or fail to attend your appointment, a cancellation fee of 50% of the grooming price per dog will apply. In these cases, the deposit will be retained and counted towards the cancellation fee.",
  "If you are dissatisfied with your pet's groom, please let us know within 48 hours and we will do our best to resolve it for you.",
];

// MATTING RELEASE FORM (sent alongside the grooming agreement when needed)
export const MATTING_INTRO = "We understand life can get heavy and sometimes things go wrong that can lead to you not being able to afford grooms or get your dog booked in. We are not judgmental. If you require help on how to care for your dog between grooming sessions, please do ask. I will be more than happy to give you advice and go through an individual schedule suited to you and your dog. We appreciate it can be expected for even a well-cared coat to have a few small knots.";

export const MATTING_TERMS: string[] = [
  "I understand that matting of my pet's fur can be detrimental to their health and well-being. Matting can cause discomfort, pain, and skin issues, including the risk of hot spots and infections. I acknowledge that my groomer has informed me there may be matting present on my pet.",
  "All our grooming services adhere to and go beyond the Animal Welfare Act 2006, which states that it is an offence to cause animals pain or discomfort and we reserve the right to refuse to do anything we think may be detrimental to your pet's well-being. Be assured we will always put your dog's welfare first.",
  "I hereby authorise the grooming services for my pet, with the understanding that removing matting may require the following:",
];

export const MATTING_BULLETS: string[] = [
  "Trimming and shaving: if the matting is severe, it may be necessary to shave the affected areas for the pet's comfort and well-being.",
  "Possible change in appearance: I understand that removing severe matting may alter my pet's appearance. While groomers will make every effort to maintain the desired look, my pet's comfort and health are the primary concern.",
  "Risk of skin irritation: the removal of mats may expose the skin, which can be sensitive. Skin irritation, redness, or minor nicks may occur as a result of the grooming process.",
  "Ongoing maintenance: I acknowledge that regular grooming and at-home care are essential to prevent matting in the future. Prevention is better than the cure.",
  "Additional fees: I understand that due to the matting, my appointment may take longer than originally assumed and due to that it may come with additional charges.",
];

export const MATTING_CLOSING = "By signing this Matting Release Form, I confirm that I have read and understood the risks and consequences associated with matting and authorise the grooming salon to proceed accordingly.";

// HOLIDAY MODE - booking form is hidden and replaced with enquiry form
export const HOLIDAY_START = "2026-03-14";
export const HOLIDAY_END = "2026-04-06";

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
    image: "/services/full-groom.png",
  },
  {
    id: "bath-brush",
    name: "Bath, Blow-Dry & Brush",
    price: "From £25",
    duration: "1-1.5 Hours",
    description: "Includes a bath, blow-dry, brush and removal of small matts",
    image: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=800",
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
    id: "teeth-cleaning",
    name: "Teeth Cleaning",
    price: "From £30",
    duration: "+15 Mins",
    description: "Gentle ultrasonic teeth cleaning — no scraping, noise or vibration, so it's stress-free even for nervous dogs. Removes plaque and tartar buildup and freshens breath. Option extra alongside any groom.",
    image: "https://images.unsplash.com/photo-1534526238597-9187ddf131d7?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: "nail-clipping",
    name: "Nail Clipping",
    price: "From £12",
    duration: "+30 Mins",
    description: "Professional nail trimming to keep your dog's paws healthy and comfortable. Option extra, paw pads trim available.",
    image: "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&q=80&w=800",
  },
  {
    id: "home-grooming",
    name: "Home Grooming",
    price: "£45",
    duration: "2-3 Hours",
    description: "Grooming in the comfort of your home with a calm, tailored setup. Includes bath (if available), blow-dry, styling, de-shedding, nail trim, and hygiene trim.",
    image: "/services/home-grooming.png",
  },
];

export const ALL_LOCATIONS = "__all__";

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

// BOOKING SLOTS - 2 hour appointments, Monday to Friday, first slot 8am, last slot 6pm
export const SLOT_TIMES = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];
export const SLOT_DURATION_MINUTES = 120;
export const BOOKABLE_WEEKDAYS = [1, 2, 3, 4, 5]; // Monday–Friday (0 = Sunday)
