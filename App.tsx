import React, { useState, useEffect, useCallback } from "react";
import { Page, Appointment } from "./types";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AdminDashboard from "./components/AdminDashboard";
import { CalendarPicker } from "./components/CalendarPicker";
import { SERVICES, LOCATIONS, STANDARD_HOURS, EMAIL_ENDPOINT } from "./constants";
import { isSlotAvailable, saveAppointment, sendBookingEmail, sendConfirmationEmail, isDateAvailable, getUnavailableDays, getUnavailableWeekdays } from "./services/bookingService";

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [bookingStep, setBookingStep] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);
  const [formData, setFormData] = useState<Partial<Appointment>>({
    locationid: LOCATIONS[0].id,
    serviceid: SERVICES[0].id,
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });
  const [uploadedPhoto, setUploadedPhoto] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Record<string, boolean>>({});
  const [carouselPosition, setCarouselPosition] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [carouselAtEnd, setCarouselAtEnd] = useState(false);
  const [unavailableDates, setUnavailableDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [dataShareConsent, setDataShareConsent] = useState<"yes" | "no" | "">("");
  const [showAgreement, setShowAgreement] = useState(false);

  const testimonials = [
    { name: "", dog: "Rolo", text: "I would highly recommend Maisey Days Dog Grooming. Both of our dogs go to Rachel and they come home looking and smelling great but also they are happy. She takes her time with them doesn’t rush at all and  we know they are happy with her !!", rating: 5, photo: "/IMG_8141 (1).jpg" },
    { name: "", dog: "Henry (Cocker Spaniel)", text: "I highly recommend Maisey Days dog grooming. My dog, Henry, thoroughly enjoys his visits to see Rachel. She gives him lots of fuss and care, and will adapt to yours, and your dogs requirements. He always looks so smart when he comes out.", rating: 5, photo: "/image0.jpeg" },
    { name: "", dog: "Eric (King Charles Cavalier)", text: "Rachel at Maisey days grooming is just brilliant . Great with Eric who can be a bit nervous , but she soon puts him at ease . Cannot recommend her enough - wouldn't take him anywhere else !", rating: 5, photo: "/image1.jpg" },
    { name: "", dog: "Willow and Misty", text: "I would highly recommend Maisey days. Rachel recently groomed my two puppies Willow & Misty. Rachel is incredible at her job, she is patient and very caring. Both puppies looked beautiful, the groom included nail clipping too. Very happy customer Thank you", rating: 5, photo: "/image0.png" },
    { name: "", dog: "Cola", text: "We hadn't needed a groomer before we adopted Cola in January in 2025 so we were lucky to have a recommendation to Maisey Days. Cola arrived with us an absolute mess, he look like an elderly dog and his coat was quite long and starting to get matted. Cola can be 'sensitive' when he's clipped, he can be a little snappy. Thank goodness Rachel is patient with him, I'm not sure all groomers are so patient so we consider ourselves very lucky to have found Maisey Days.", rating: 5, photo: "/image3.jpeg" },
    { name: "", dog: "Hugo", text: "Rachel has been absolutely wonderful with my dog, Hugo. Hugo really doesn't enjoy being groomed, but Rachel's patience, kindness, and calm approach have made such a difference. She has taken the time to understand him, never rushing or pushing him beyond his comfort, and the progress he has made is incredible.\n\nRachel's perseverance and genuine care for Hugo truly shine through in everything she does. It's clear she loves what she does and treats every dog with compassion and respect. I'm so grateful for the time and effort she has put in — I couldn't recommend her highly enough. Thank you, Rachel!", rating: 5, photo: "/image4.jpeg" },
    { name: "", dog: "", text: "My 3 Cocker Spaniels have been going to Rachel for years and absolutely love her.  I am always happy with the care they receive and their groom", rating: 5, photo: "/image5.jpeg" },
    { name: "", dog: "Teddy", text: "Hello. My name is Teddy and I love Rachel because she keeps me looking so good and I get lots of treats when I visit her (before his groom) ", rating: 5, photo: "/image2.jpg" },
  ];

  const galleryItems = [
    // Standard Portrait - ~240-280px wide x 320px tall (bulk of collection)
    { src: "/gallery/2.jpg", featured: false },
    { src: "/gallery/3.jpg", featured: false },
    { src: "/gallery/4.jpg", featured: false },
    { src: "/gallery/5.jpg", featured: false },
    { src: "/gallery/6.jpg", featured: false },
    { src: "/gallery/7.jpg", featured: false },
    { src: "/gallery/8.jpg", featured: false },
    { src: "/gallery/9.jpg", featured: false },
    { src: "/gallery/10.jpg", featured: false },
    { src: "/gallery/12.jpg", featured: false },
    { src: "/gallery/13.jpg", featured: false },
    { src: "/gallery/14.jpg", featured: false },
    { src: "/gallery/15.jpg", featured: false },
    { src: "/gallery/18.jpg", featured: false },
    { src: "/gallery/21.jpg", featured: false },
    { src: "/gallery/22.jpg", featured: false },
    { src: "/gallery/25.jpg", featured: false },
    { src: "/gallery/26.jpg", featured: false },
    { src: "/gallery/29.jpg", featured: false },
    { src: "/gallery/30.jpg", featured: false },
    { src: "/gallery/31.jpg", featured: false },
    { src: "/gallery/33.jpg", featured: false },
    
    // Different Aspect Ratios (landscape & unique)
    { src: "/gallery/11.jpg", featured: false },
    { src: "/gallery/16.jpg", featured: false },
    { src: "/gallery/17.jpg", featured: false },
    { src: "/gallery/19.jpg", featured: false },
    { src: "/gallery/20.jpg", featured: false },
    { src: "/gallery/23.jpg", featured: false },
    { src: "/gallery/24.jpg", featured: false },
    { src: "/gallery/27.jpg", featured: false },
    { src: "/gallery/32.jpg", featured: false },
    { src: "/gallery/1.jpg", featured: false },
  ];

  useEffect(() => {
    const carousel = document.getElementById("testimonials-carousel");
    if (!carousel || isCarouselPaused) return;

    const scrollWidth = carousel.scrollWidth;
    const clientWidth = carousel.clientWidth;
    let position = carouselPosition;

    const interval = setInterval(() => {
      position += 2;
      if (position >= scrollWidth - clientWidth - 5) {
        // Reached the end - pause for 2 seconds before resetting
        if (!carouselAtEnd) {
          setCarouselAtEnd(true);
          setTimeout(() => {
            position = 0;
            carousel.scrollLeft = 0;
            setCarouselPosition(0);
            setCarouselAtEnd(false);
          }, 2000);
        }
        return;
      }
      carousel.scrollLeft = position;
      setCarouselPosition(position);
    }, 15);

    return () => clearInterval(interval);
  }, [carouselPosition, isCarouselPaused, carouselAtEnd]);
  const refreshAvailability = useCallback(async () => {
    if (!formData.locationid || !formData.date) return;

    const results: Record<string, boolean> = {};
    await Promise.all(
      STANDARD_HOURS.map(async (time) => {
        results[time] = await isSlotAvailable(formData.locationid!, formData.date!, time);
      }),
    );
    setAvailableSlots(results);
  }, [formData.locationid, formData.date]);

  // Load unavailable dates when booking step changes
  useEffect(() => {
    if (bookingStep === 2) {
      import("./services/bookingService").then(({ getUnavailableDays, getUnavailableWeekdays }) => {
        Promise.all([getUnavailableDays(formData.locationid || ""), getUnavailableWeekdays()]).then(([dates, weekdays]) => {
          // Combine specific dates and recurring weekdays into one list for this month
          const allUnavailable: string[] = [...dates];
          const today = new Date();
          const maxDate = new Date(today.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);

          // Add all occurrences of unavailable weekdays within the booking window
          for (let d = new Date(today); d <= maxDate; d.setDate(d.getDate() + 1)) {
            if (weekdays.includes(d.getDay())) {
              allUnavailable.push(d.toISOString().split("T")[0]);
            }
          }
          setUnavailableDates(allUnavailable);
        });
      });
    }
  }, [bookingStep, formData.locationid]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Check if user agreed to terms
    if (!agreedToTerms) {
      setBookingError("Please read and agree to the Service Agreement & Privacy Policy to proceed.");
      return;
    }

    // Check if marketing consent was selected
    if (dataShareConsent === "") {
      setBookingError("Please confirm your consent to data sharing.");
      return;
    }

    setBookingError(null);
    setIsSubmitting(true);

    const appointment: Appointment = {
      ownername: formData.ownername || "",
      email: formData.email || "",
      phone: formData.phone || "",
      dogname: formData.dogname || "",
      dogbreed: formData.dogbreed || "",
      serviceid: formData.serviceid || "",
      locationid: formData.locationid || "",
      date: formData.date || "",
      time: formData.time || "",
      notes: formData.notes || "",
      status: "pending",
      marketingConsent: dataShareConsent as "yes" | "no",
    };

    try {
      await saveAppointment(appointment);
      // Send emails in parallel instead of sequential to speed up confirmation
      const [emailOk] = await Promise.all([sendBookingEmail(appointment, uploadedPhoto), sendConfirmationEmail(appointment)]);
      setEmailFailed(!emailOk);
      setShowSuccess(true);
      setIsSubmitting(false);
    } catch (err: any) {
      console.error("Booking failed:", err);
      setBookingError(err.message || "Something went wrong. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPage = () => {
    if (showSuccess) {
      return (
        <div className="max-w-2xl mx-auto py-32 text-center px-4 animate-fade-in">
          <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 text-5xl">✅</div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4 tracking-tight">Booking Sent!</h1>
          <p className="text-slate-500 text-xl leading-relaxed">
            We've received your request for <strong>{formData.dogname}</strong>. We'll be in touch at <strong>{formData.email}</strong> shortly.
          </p>
          {emailFailed && <div className="mt-6 bg-amber-50 border border-amber-100 text-amber-700 px-6 py-4 rounded-2xl text-sm font-semibold">The appointment saved, but the email notification failed to send. Please contact us if you don't receive a confirmation.</div>}
          <button
            onClick={() => {
              setShowSuccess(false);
              setCurrentPage("home");
            }}
            className="mt-12 bg-slate-900 text-white px-10 py-4 rounded-2xl font-bold uppercase tracking-widest text-sm transition-transform active:scale-95"
          >
            Return Home
          </button>
        </div>
      );
    }

    switch (currentPage) {
      case "home":
        return (
          <div className="space-y-20 pb-20 animate-fade-in">
            {/* Hero Section */}
            <section className="relative h-[85vh] min-h-[600px] flex items-center overflow-hidden">
              <div className="absolute inset-0 z-0">
                <img src="https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&q=80&w=2000" alt="Happy dog being groomed" className="w-full h-full object-cover brightness-[0.4]" />
              </div>
              <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-white">
                <div className="max-w-2xl">
                  <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-8xl font-black mb-6 leading-[0.9] tracking-tighter">
                    WHERE EVERY DOG
                    <br />
                    <span className="text-emerald-400">IS A VIP</span> <span className="text-sm sm:text-lg md:text-3xl lg:text-4xl whitespace-nowrap">(Very&nbsp;&nbsp;Important&nbsp;&nbsp;Pup)</span>
                  </h1>
                  <h2 className="text-lg sm:text-2xl md:text-[32px] font-bold mb-3 text-slate-200">Grooming with Care and Trust</h2>
                  <p className="text-sm sm:text-base md:text-[20px] mb-8 text-slate-200">Grooming should always be a positive, stress-free experience tailored to the individual needs and personality of your dog. With seven years of grooming experience, our ethos is focused on building trust and a relationship with your dog, using a patient approach that incorporates consent-based methods to prioritise your pets comfort.</p>
                  <p className="text-sm sm:text-base md:text-[20px] mb-8 text-slate-200">From quick tidy-ups to full transformations, your pup is in safe hands, working towards a relaxed visit and a happy, waggy tail when leaving.</p>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <button onClick={() => setCurrentPage("booking")} className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 rounded-3xl font-black text-lg transition-all transform hover:scale-105 shadow-xl shadow-emerald-900/40">
                      BOOK NOW
                    </button>
                    <button onClick={() => setCurrentPage("services")} className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 rounded-3xl font-black text-lg transition-all transform hover:scale-105 shadow-xl shadow-emerald-900/40">
                      SERVICES
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Features */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                  {
                    title: "Premium Products",
                    desc: "We use organic, hypoallergenic shampoos and conditioners suited to your dog's specific skin type.",
                    icon: "✨",
                  },
                  {
                    title: "Safety First",
                    desc: "Fully qualified level 3 dog groomer with 7 years experience, insured and DBS checked.",
                    icon: "🛡️",
                  },
                ].map((item, idx) => (
                  <div key={idx} className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all duration-500 group">
                    <div className="text-5xl mb-6 group-hover:scale-110 transition-transform inline-block">{item.icon}</div>
                    <h3 className="text-2xl font-bold mb-3 text-slate-800 tracking-tight">{item.title}</h3>
                    <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Testimonials Carousel */}
            <section className="py-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-center mb-16 tracking-tight">What Our Pawsome Clients Say</h2>
                <div className="relative">
                  {/* Navigation Buttons */}
                  <button
                    onClick={() => {
                      const carousel = document.getElementById("testimonials-carousel");
                      if (carousel) {
                        carousel.scrollBy({ left: -520, behavior: "smooth" });
                        setIsCarouselPaused(true);
                        setTimeout(() => setIsCarouselPaused(false), 3000);
                      }
                    }}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white hover:bg-emerald-600 text-slate-600 hover:text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center font-bold text-2xl transition-all"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => {
                      const carousel = document.getElementById("testimonials-carousel");
                      if (carousel) {
                        carousel.scrollBy({ left: 520, behavior: "smooth" });
                        setIsCarouselPaused(true);
                        setTimeout(() => setIsCarouselPaused(false), 3000);
                      }
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white hover:bg-emerald-600 text-slate-600 hover:text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center font-bold text-2xl transition-all"
                  >
                    ›
                  </button>
                  {/* Carousel Container */}
                  <div
                    id="testimonials-carousel"
                    className="overflow-x-auto scrollbar-hide scroll-smooth cursor-grab active:cursor-grabbing"
                    onMouseEnter={() => {
                      const carousel = document.getElementById("testimonials-carousel");
                      if (carousel) carousel.style.scrollBehavior = "auto";
                      setIsCarouselPaused(true);
                    }}
                    onMouseLeave={() => {
                      const carousel = document.getElementById("testimonials-carousel");
                      if (carousel) carousel.style.scrollBehavior = "smooth";
                      setIsCarouselPaused(false);
                    }}
                    onTouchStart={(e) => {
                      const carousel = document.getElementById("testimonials-carousel");
                      if (carousel) {
                        carousel.style.scrollBehavior = "auto";
                        setIsCarouselPaused(true);
                      }
                    }}
                    onTouchEnd={() => {
                      const carousel = document.getElementById("testimonials-carousel");
                      if (carousel) carousel.style.scrollBehavior = "smooth";
                      setIsCarouselPaused(false);
                    }}
                  >
                    <div className="flex gap-8 pb-6 w-fit">
                      {testimonials.map((t, i) => (
                        <div key={i} className="flex-shrink-0 w-[500px] bg-white rounded-[2rem] shadow-sm border border-slate-200 hover:shadow-lg transition-shadow overflow-hidden group">
                          <div className="flex h-full">
                            {t.photo && (
                              <div className="w-40 flex-shrink-0">
                                <img src={t.photo} alt={t.dog} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div className="p-8 flex-1 flex flex-col">
                              <div className="flex gap-1 mb-4">
                                {[...Array(t.rating)].map((_, j) => (
                                  <span key={j} className="text-emerald-600 text-lg">
                                    ⭐
                                  </span>
                                ))}
                              </div>
                              <p className="mb-6 italic text-slate-600 text-sm flex-1 group-hover:overflow-y-auto group-hover:max-h-none max-h-[100px] overflow-hidden">"{t.text}"</p>
                              <div className="font-bold text-slate-900">{t.name}</div>
                              <div className="text-emerald-600 text-xs font-bold uppercase tracking-widest">{t.dog}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Fade gradient */}
                  <div className="absolute right-0 top-0 bottom-6 w-32 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none"></div>
                </div>
              </div>
              <style>{`
                .scrollbar-hide::-webkit-scrollbar {
                  display: none;
                }
                .scrollbar-hide {
                  -ms-overflow-style: none;
                  scrollbar-width: none;
                }
              `}</style>
            </section>

            {/* CTA Section */}
            <section className="bg-emerald-600 rounded-[3rem] mx-auto my-20 p-16 max-w-4xl">
              <div className="text-center">
                <h2 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black text-white mb-6 tracking-tight">Ready to Pamper Your Pet?</h2>
                <p className="text-sm sm:text-base md:text-xl text-emerald-50 mb-10 leading-relaxed">Choose Winterton-on-Sea or our Caister location to book a grooming appointment tailored to your dogs needs.</p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button onClick={() => setCurrentPage("booking")} className="bg-white text-emerald-600 px-12 py-4 rounded-full font-black text-lg hover:bg-slate-50 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
                    Start Booking
                  </button>
                  <button onClick={() => setCurrentPage("gallery")} className="bg-white text-emerald-600 px-12 py-4 rounded-full font-black text-lg hover:bg-slate-50 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
                    View Gallery
                  </button>
                </div>
              </div>
            </section>
          </div>
        );

      case "services":
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 animate-fade-in">
            <div className="bg-emerald-50 rounded-[3rem] p-8 sm:p-16 border-2 border-emerald-200">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-center text-slate-800 tracking-tighter mb-8">Our Services</h1>
              <p className="text-slate-500 text-center mb-16 text-sm sm:text-base md:text-lg max-w-2xl mx-auto">Whether it's a quick refresh or the full works, we have the perfect package to get your pup looking and feeling their best</p>
              <div className="max-w-4xl mx-auto grid grid-cols-1 gap-10">
              {SERVICES.map((s) => (
                <div key={s.id} className="bg-white rounded-[3rem] overflow-hidden shadow-sm border border-slate-100 flex flex-col lg:flex-row group hover:shadow-2xl transition-all duration-500">
                  <div className="lg:w-2/5 overflow-hidden h-48 sm:h-64 lg:h-full">
                    <img src={s.image} alt={s.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  </div>
                  <div className="p-6 sm:p-10 flex flex-col justify-between lg:w-3/5">
                    <div>
                      <div className="flex justify-between items-start mb-4 gap-2">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 leading-tight">{s.name}</h3>
                        <span className="text-teal-600 font-black text-lg sm:text-xl flex-shrink-0">{s.price}</span>
                      </div>
                      <p className="text-slate-500 mb-6 text-sm sm:text-base">{s.description}</p>
                    </div>
                    <button
                      onClick={() => {
                        setFormData({ ...formData, serviceid: s.id });
                        setCurrentPage("booking");
                      }}
                      className="mt-8 bg-slate-900 text-white py-3 sm:py-4 px-6 sm:px-8 rounded-2xl font-bold text-sm sm:text-base hover:bg-teal-600 transition-colors"
                    >
                      Book This Service
                    </button>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
        );

      case "gallery":
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 animate-fade-in">
            <div className="text-center mb-16">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-slate-800 tracking-tighter">Grooming Gallery</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
                  <h3 className="text-3xl font-black text-slate-800 mb-4">Why pet parents love us</h3>
                  <p className="text-slate-600 leading-relaxed">Trust is earned, not given. We take the time to truly know your dog, providing a peaceful, cage-free space where they can feel safe and looked after at their own pace</p>

                </div>

                <div className="bg-emerald-600 rounded-[2.5rem] p-10 text-white shadow-lg shadow-emerald-500/30">
                  <h3 className="text-3xl font-black mb-4">Ready for a fresh look?</h3>
                  <p className="text-emerald-50 mb-6">Choose from our Winterton-on-Sea or Caister location to book a grooming appointment tailored to your dog's needs.</p>
                  <button onClick={() => setCurrentPage("booking")} className="bg-white text-emerald-700 px-8 py-4 rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-emerald-50 transition-all">
                    Book an Appointment
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2">
                {galleryItems.length === 0 ? (
                  <div className="bg-white rounded-[2.5rem] p-16 shadow-sm border border-slate-100 text-center">
                    <div className="text-6xl mb-6">📸</div>
                    <h3 className="text-3xl font-black text-slate-800 mb-4">Coming Soon</h3>
                    <p className="text-slate-600 text-lg">We're capturing all the beautiful grooming transformations! Check back soon for photos of our latest work.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 auto-rows-[280px] sm:auto-rows-[220px] border-4 border-emerald-500 rounded-[2.5rem] p-8">
                    {galleryItems.map((item, idx) => (
                      <div key={`gallery-${idx}`} className={`group relative rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden shadow-md bg-white ${item.featured ? "sm:col-span-2 sm:row-span-2" : ""}`}>
                        <img src={item.src} alt={`Gallery image ${idx + 1}`} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "about":
        return (
          <div className="max-w-4xl mx-auto py-8 sm:py-20 px-4 animate-fade-in">
            <div className="bg-emerald-50 rounded-[3rem] p-8 sm:p-12 md:p-16 border-2 border-emerald-200">
              <div className="text-center">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-slate-800 tracking-tighter mb-6 sm:mb-10">Our Story</h1>
                <div className="mb-8 sm:mb-12 rounded-[3rem] overflow-hidden shadow-2xl max-h-64 sm:max-h-80">
                  <img src="/4c3b33ff-5557-415d-beb5-a9ef531d73ae%20(3).jpg" className="w-full h-full object-cover" />
                </div>
                <div className="text-sm sm:text-base md:text-lg text-slate-500 leading-relaxed font-medium space-y-4 sm:space-y-6 text-left">
                  <p>At Maisey Days Grooming, I work with the simple ethos that every dog deserves a positive and professional grooming experience. I am here to provide a calm, compassionate space, with a particular focus on those who may be nervous or sensitive. I believe grooming shouldn't be an ordeal; my focus is to work towards a positive experience where every dog can learn to enjoy their time with me and feel truly comfortable. There is no better reward for my work than seeing waggy tails coming through the door and being greeted with happy licks from a dog who is excited to see me and feels safe and relaxed in my care.</p>

                  <p>The inspiration behind my journey is the love I have for my German Shepherd, Maisey. When she came home as a puppy in 2016, her incredibly lively nature was a steep learning curve that I hadn't quite prepared for; I soon discovered that life with Maisey was going to be a whirlwind adventure!</p>

                  <p>Our first five years together were a gentle test of heart and soul. We navigated the hurdles of reactivity, a journey that often felt like one step forward and two steps back. There were many moments of tears and frustration, yet through soft perseverance and a deep determination to truly understand one another, we found our way. Maisey has taught me more about behaviour, patience, and trust than any textbook ever could; she was a little pickle, but a beautiful complex girl who challenged me and showed me the true meaning of a bond. Now ten years old, Maisey remains at the heart of everything I do; she is a constant reminder of how much we can learn from our dogs, and she remains my greatest teacher.</p>

                  <p>My journey with Maisey inspired me to become a professional dog groomer, qualifying in 2020. I now balance my grooming work with my career in teaching and education . I find that both roles share a common thread, understanding individuals, building confidence, and creating an environment where trust can grow.</p>

                  <p>Customers trust Maisey Days grooming because I provide a professional service where comfort and wellbeing are my top priorities. I don't just groom your dog; I advocate for their happiness, ensuring their emotional needs are at the heart of every brush, bath, and style. I treat every dog with the same care and devotion I give my own, often chatting and laughing with them along the way.</p>
                </div>
              </div>
            </div>
          </div>
        );

      case "locations":
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 md:py-20 animate-fade-in">
            <div className="bg-emerald-50 rounded-[3rem] p-8 sm:p-12 md:p-16 border-2 border-emerald-200">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-center text-slate-800 tracking-tighter mb-4 sm:mb-6 md:mb-8">Visit Us</h1>
              <p className="text-center text-slate-600 text-xs sm:text-base md:text-lg lg:text-xl font-semibold mb-8">Open Daily 8am - 8pm</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 md:gap-12">
                {LOCATIONS.map((l) => (
                  <div key={l.id} className="bg-white rounded-[3rem] overflow-hidden shadow-lg border border-slate-100 group flex flex-col h-full">
                    <div className="h-48 sm:h-64 md:h-96 overflow-hidden bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <img src={l.image} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-700 border-[5px] border-gray-300" />
                    </div>
                    <div className="p-6 sm:p-8 md:p-12 flex flex-col flex-grow">
                      <div className="text-center mb-6 sm:mb-8">
                        <h3 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black mb-2 sm:mb-3 md:mb-4 text-slate-800">{l.name}</h3>
                        <p className="text-slate-500 mb-2 sm:mb-3 md:mb-4 text-xs sm:text-sm md:text-base lg:text-lg">{l.address}</p>
                        <p className="text-slate-500 mb-4 sm:mb-5 md:mb-6 text-xs sm:text-sm md:text-base lg:text-lg">{l.phone}</p>
                      </div>
                      <div className="mb-6 sm:mb-8 rounded-2xl overflow-hidden shadow-md flex-shrink-0">
                        <iframe width="100%" height="200" style={{ border: 0 }} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyDE8Su7ph7YLR1ZIqgMdUb6yaGezG5kMCY&q=${encodeURIComponent(l.address)}`}></iframe>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-auto">
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${l.coordinates.lat},${l.coordinates.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 bg-blue-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-center text-sm sm:text-base hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30">
                          Get Directions
                        </a>
                        <button
                          onClick={() => {
                            setFormData({ ...formData, locationid: l.id });
                            setCurrentPage("booking");
                          }}
                          className="flex-1 bg-emerald-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-sm sm:text-base shadow-lg shadow-emerald-600/30 hover:bg-emerald-700 transition-all"
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "booking":
        return (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Booking Form */}
              <div className="bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-black text-slate-800 mb-2">Booking Request Form</h2>
                  <p className="text-slate-600 text-sm">Schedule your appointment</p>
                </div>

                <div className="w-full relative">
                  {bookingError && (
                    <div className="absolute top-4 left-4 right-4 bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-2xl text-xs font-bold animate-shake z-10 flex items-center justify-between">
                      <span>⚠️ {bookingError}</span>
                      <button onClick={() => setBookingError(null)} className="text-rose-300 hover:text-rose-700">
                        ✕
                      </button>
                    </div>
                  )}

                {bookingStep === 1 && (
                  <div className="space-y-8 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Dog's Name</label>
                        <input type="text" placeholder="e.g. Buddy" value={formData.dogname || ""} onChange={(e) => setFormData({ ...formData, dogname: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold" />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Breed</label>
                        <input type="text" placeholder="e.g. Labradoodle" value={formData.dogbreed || ""} onChange={(e) => setFormData({ ...formData, dogbreed: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">{formData.serviceid === "puppy-intro" ? "Options" : "Service"}</label>
                      <select value={formData.serviceid} onChange={(e) => setFormData({ ...formData, serviceid: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold">
                        {SERVICES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.price})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Select Salon</label>
                      <select value={formData.locationid} onChange={(e) => setFormData({ ...formData, locationid: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold">
                        {LOCATIONS.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button onClick={() => setBookingStep(2)} disabled={!formData.dogname || !formData.dogbreed} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-teal-600 transition-all disabled:opacity-20 mt-4 shadow-xl shadow-slate-200">
                      Next Step
                    </button>
                  </div>
                )}

                {bookingStep === 2 && (
                  <div className="space-y-8 animate-fade-in">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Pick a Date</label>
                      <CalendarPicker selectedDate={formData.date || ""} onDateSelect={(date) => setFormData({ ...formData, date, time: "" })} unavailableDates={unavailableDates} />
                      <p className="text-xs text-slate-400 mt-3">Available for the next 16 weeks (greyed out dates are unavailable)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Select Available Time</label>
                      <div className="grid grid-cols-3 gap-4">
                        {STANDARD_HOURS.map((time) => {
                          const isAvailable = availableSlots[time] !== false;
                          return (
                            <button key={time} disabled={!isAvailable} onClick={() => setFormData({ ...formData, time })} className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${!isAvailable ? "bg-slate-50 text-slate-200 border-slate-50 cursor-not-allowed" : formData.time === time ? "bg-teal-600 text-white border-teal-600 shadow-lg shadow-teal-600/30" : "bg-white text-slate-700 border-slate-100 hover:border-teal-400"}`}>
                              {time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button onClick={() => setBookingStep(1)} className="w-1/3 py-5 border-2 border-slate-100 rounded-2xl font-bold text-slate-400">
                        Back
                      </button>
                      <button
                        onClick={async () => {
                          if (!formData.date) {
                            setBookingError("Please select a date");
                            return;
                          }
                          const available = await isDateAvailable(formData.locationid || "", formData.date);
                          if (!available) {
                            setBookingError("This day is closed. Please select another date.");
                            return;
                          }
                          setBookingError(null);
                          setBookingStep(3);
                        }}
                        disabled={!formData.time}
                        className="flex-grow bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest disabled:opacity-20 transition-all shadow-xl shadow-slate-200"
                      >
                        Almost Done
                      </button>
                    </div>
                  </div>
                )}

                {bookingStep === 3 && (
                  <form onSubmit={handleBookingSubmit} className="space-y-8 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Full Name</label>
                        <input required type="text" value={formData.ownername || ""} onChange={(e) => setFormData({ ...formData, ownername: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 transition-all font-bold" />
                      </div>
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Email Address</label>
                        <input required type="email" value={formData.email || ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 transition-all font-bold" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Phone Number</label>
                      <input type="tel" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="e.g. 07123 456789" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 transition-all font-bold" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Special Requirements or Notes</label>
                      <textarea value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="e.g. Anxiety, skin allergies, etc." className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 transition-all font-bold h-32" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Upload a Photo (optional)</label>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file && file.size > 5 * 1024 * 1024) {
                              setBookingError("Photo must be 5MB or less.");
                              e.target.value = "";
                              setUploadedPhoto(null);
                              return;
                            }
                            setBookingError(null);
                            setUploadedPhoto(file);
                          }}
                          className="w-full sm:flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 transition-all font-bold text-slate-500"
                        />
                        {uploadedPhoto && (
                          <button type="button" onClick={() => setUploadedPhoto(null)} className="px-4 py-2 rounded-2xl border border-slate-200 text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-rose-600 hover:border-rose-200">
                            Remove
                          </button>
                        )}
                      </div>
                      {uploadedPhoto && <p className="mt-2 text-xs text-slate-400">Selected: {uploadedPhoto.name}</p>}
                      <p className="mt-2 text-xs text-slate-400">Accepted: JPG, PNG. Max 5MB.</p>
                    </div>
                    <div className={`p-6 rounded-2xl border-2 transition-all ${agreedToTerms ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                      <label className="flex items-start gap-4 cursor-pointer">
                        <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="w-6 h-6 mt-0.5 accent-emerald-600 cursor-pointer" />
                        <div className="flex-1">
                          <span className={`text-sm font-bold ${agreedToTerms ? "text-emerald-700" : "text-rose-700"}`}>
                            I confirm that I have read, understood, and agree to the{" "}
                            <button type="button" onClick={() => setShowAgreement(true)} className="underline hover:text-emerald-900 transition-colors font-black">
                              Service Agreement and Privacy Policy
                            </button>
                          </span>
                        </div>
                      </label>
                    </div>
                    <div className="bg-rose-50 border-2 border-rose-300 p-6 rounded-2xl">
                      <label className="block text-sm font-bold text-rose-700 mb-4">Should Maisey Days be unable to fulfil an appointment, I consent to my contact details being shared with the grooming team at Dirty Dawg ONLY for the purpose of arranging an alternative booking.</label>
                      <div className="flex gap-8">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={dataShareConsent === "yes"} onChange={(e) => setDataShareConsent(e.target.checked ? "yes" : "")} className="w-5 h-5 accent-emerald-600 cursor-pointer" />
                          <span className="font-bold text-slate-700">Yes</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={dataShareConsent === "no"} onChange={(e) => setDataShareConsent(e.target.checked ? "no" : "")} className="w-5 h-5 accent-slate-400 cursor-pointer" />
                          <span className="font-bold text-slate-700">No</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <button type="button" onClick={() => setBookingStep(2)} className="w-1/3 py-5 border-2 border-slate-100 rounded-2xl font-bold text-slate-400 transition-transform active:scale-95">
                        Back
                      </button>
                      <button type="submit" disabled={isSubmitting} className={`flex-grow text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 ${isSubmitting ? "bg-slate-400 cursor-not-allowed" : "bg-teal-600 shadow-teal-600/30 hover:bg-teal-700"}`}>
                        {isSubmitting ? "Sending Request..." : "Request Appointment"}
                      </button>
                    </div>
                  </form>
                )}
                </div>
              </div>

              {/* General Enquiries Form */}
              <div className="bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-black text-slate-800 mb-2">General Enquiries</h2>
                  <p className="text-slate-600 text-sm">Have a question?</p>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const enquiryName = (document.getElementById("enquiry-name") as HTMLInputElement)?.value || "";
                    const enquiryEmail = (document.getElementById("enquiry-email") as HTMLInputElement)?.value || "";
                    const enquiryMessage = (document.getElementById("enquiry-message") as HTMLTextAreaElement)?.value || "";

                    if (!enquiryName || !enquiryEmail || !enquiryMessage) {
                      alert("Please fill in all fields");
                      return;
                    }

                    try {
                      console.log("Sending enquiry to:", EMAIL_ENDPOINT);
                      const response = await fetch(EMAIL_ENDPOINT, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          _subject: `General Enquiry from ${enquiryName}`,
                          message: `Name: ${enquiryName}\nEmail: ${enquiryEmail}\n\nEnquiry:\n${enquiryMessage}`,
                          email: enquiryEmail,
                          _replyto: enquiryEmail,
                          name: enquiryName,
                        }),
                      });

                      console.log("Enquiry response received:", response.status, response.ok);

                      if (response.ok) {
                        alert("Thank you! Your enquiry has been sent successfully.");
                        (document.getElementById("enquiry-name") as HTMLInputElement).value = "";
                        (document.getElementById("enquiry-email") as HTMLInputElement).value = "";
                        (document.getElementById("enquiry-message") as HTMLTextAreaElement).value = "";
                      } else {
                        const responseText = await response.text();
                        console.error("Enquiry submission failed:", response.status, response.statusText, responseText);
                        alert("Something went wrong. Please try again.");
                      }
                    } catch (err) {
                      console.error("Enquiry error:", err instanceof Error ? err.message : String(err));
                      alert("Failed to send enquiry. Please contact us directly.");
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">Name</label>
                    <input
                      id="enquiry-name"
                      type="text"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-sm"
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">Email</label>
                    <input
                      id="enquiry-email"
                      type="email"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-sm"
                      placeholder="your@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">Message</label>
                    <textarea
                      id="enquiry-message"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-sm h-24 resize-none"
                      placeholder="Your enquiry..."
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 text-white py-3 rounded-2xl font-bold uppercase tracking-widest text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/30 active:scale-95"
                  >
                    Send Message
                  </button>
                </form>
              </div>
            </div>
          </div>
        );

      case "admin":
        return <AdminDashboard />;

      case "privacy":
        return (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 md:p-16">
              <div className="mb-12">
                <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-slate-800 mb-8">Service Agreement & Privacy Policy</h2>
              </div>
              <div className="text-slate-700 text-sm leading-relaxed space-y-6">
                <div>
                  <h3 className="text-lg font-black text-slate-800 mb-3">1. Data Privacy (UK GDPR Compliance)</h3>
                  <p className="mb-3">At Dirty Dawg and Maisey Days, we are committed to protecting your personal data in accordance with UK law.</p>
                  <ul className="space-y-2 ml-4 list-disc">
                    <li>
                      <strong>Data Collection:</strong> We collect your contact details (name, address, phone numbers, email) and your dog's medical, behavioural, and vaccination history.
                    </li>
                    <li>
                      <strong>Purpose:</strong> This data is used solely to manage your bookings, send 24-hour reminders, and ensure your pet's safety during grooming.
                    </li>
                    <li>
                      <strong>Data Sharing:</strong> We may share your contact details and pet information with the grooming team at Dirty Dawg. This data sharing is strictly limited to instances where Maisey Days is unavailable, ensuring we can offer you alternative appointment slots and maintain continuity of care for your dog. Your data will not be shared with any other third parties without your explicit consent.
                    </li>
                    <li>
                      <strong>Security:</strong> Your information is stored securely and only shared with veterinary professionals in an emergency. We do not sell your data to third parties.
                    </li>
                    <li>
                      <strong>Rights:</strong> You have the right to access, update, or request the deletion of your records at any time.
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-800 mb-3">2. Terms & Conditions of Service</h3>
                  <div className="space-y-3 ml-4">
                    <div>
                      <strong>Matting & Welfare:</strong> In compliance with the Animal Welfare Act, pet comfort comes before aesthetics. We will spend no more than 15 minutes attempting to de-mat a coat. If matting is severe, we will clip the coat short to avoid causing your dog unnecessary pain. You acknowledge that a "shave-down" can reveal hidden skin issues or cause irritation; additional fees apply for matted dogs.
                    </div>
                    <div>
                      <strong>Health & Behaviour:</strong> You must disclose any history of aggression or nervous triggers. We reserve the right to use a muzzle or refuse/terminate a groom for safety reasons and the wellbeing of your pet. You authorise us to seek emergency veterinary care at your expense should it be deemed necessary.
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-black text-slate-800 mb-3">3. Booking & Cancellation Policy</h3>
                  <div className="space-y-3 ml-4">
                    <div>
                      <strong>Deposits:</strong> A non-refundable deposit of £20 is required to secure your reservation.
                    </div>
                    <div>
                      <strong>Cancellations:</strong> We require a minimum of 24 hours' notice to cancel or reschedule a booking.
                    </div>
                    <div>
                      <strong>Late Cancellations:</strong> If a cancellation is made with less than 24 hours' notice, a charge of 50% of the groom price will apply. In these instances, your £20 deposit will be retained as part of the cancellation fee.
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-12 flex gap-4">
                <button
                  onClick={() => setCurrentPage("home")}
                  className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/30"
                >
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return <div className="p-20 text-center">Page Not Found</div>;
    }
  };

  // Agreement Modal
  const AgreementModal = () => (
    <>
      {showAgreement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-gradient-to-r from-teal-600 to-emerald-600 p-8 flex justify-between items-center">
              <h2 className="text-2xl font-black text-white">Service Agreement & Privacy Policy</h2>
              <button onClick={() => setShowAgreement(false)} className="text-white text-3xl font-bold hover:opacity-80 transition-opacity">
                ✕
              </button>
            </div>
            <div className="p-8 text-slate-700 text-sm leading-relaxed space-y-6">
              <div>
                <h3 className="text-lg font-black text-slate-800 mb-3">1. Data Privacy (UK GDPR Compliance)</h3>
                <p className="mb-3">At Dirty Dawg and Maisey Days, we are committed to protecting your personal data in accordance with UK law.</p>
                <ul className="space-y-2 ml-4 list-disc">
                  <li>
                    <strong>Data Collection:</strong> We collect your contact details (name, address, phone numbers, email) and your dog's medical, behavioural, and vaccination history.
                  </li>
                  <li>
                    <strong>Purpose:</strong> This data is used solely to manage your bookings, send 24-hour reminders, and ensure your pet's safety during grooming.
                  </li>
                  <li>
                    <strong>Data Sharing:</strong> We may share your contact details and pet information with the grooming team at Dirty Dawg. This data sharing is strictly limited to instances where Maisey Days is unavailable, ensuring we can offer you alternative appointment slots and maintain continuity of care for your dog. Your data will not be shared with any other third parties without your explicit consent.
                  </li>
                  <li>
                    <strong>Security:</strong> Your information is stored securely and only shared with veterinary professionals in an emergency. We do not sell your data to third parties.
                  </li>
                  <li>
                    <strong>Rights:</strong> You have the right to access, update, or request the deletion of your records at any time.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-800 mb-3">2. Terms & Conditions of Service</h3>
                <div className="space-y-3 ml-4">
                  <div>
                    <strong>Matting & Welfare:</strong> In compliance with the Animal Welfare Act, pet comfort comes before aesthetics. We will spend no more than 15 minutes attempting to de-mat a coat. If matting is severe, we will clip the coat short to avoid causing your dog unnecessary pain. You acknowledge that a "shave-down" can reveal hidden skin issues or cause irritation; additional fees apply for matted dogs.
                  </div>
                  <div>
                    <strong>Health & Behaviour:</strong> You must disclose any history of aggression or nervous triggers. We reserve the right to use a muzzle or refuse/terminate a groom for safety reasons and the wellbeing of your pet. You authorise us to seek emergency veterinary care at your expense should it be deemed necessary.
                  </div>
                  <div>
                    <strong>Parasites (Fleas & Ticks):</strong> If fleas are found, you must collect your dog immediately to prevent infestation. A minimum £5 sanitisation fee will apply to cover the mandatory deep-cleaning and disinfection of the grooming salon. We may remove up to 3 ticks if safe; otherwise, we will advise a veterinary visit.
                  </div>
                  <div>
                    <strong>Late Fees:</strong> Arrivals more than 30 minutes late may require rescheduling and will be treated as a late cancellation. Late collections are charged at £10 per hour to cover the impact on our schedule and facility use.
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-800 mb-3">3. Deposit & Cancellation Policy</h3>
                <div className="space-y-3 ml-4">
                  <div>
                    <strong>Non-Refundable Deposit:</strong> A £20 deposit is required at the time of booking to secure your appointment. This is deducted from the final groom price.
                  </div>
                  <div>
                    <strong>24-Hour Notice:</strong> We require at least 24 hours' notice for cancellations or rescheduling.
                  </div>
                  <div>
                    <strong>Cancellation Fee:</strong> If you cancel with less than 24 hours' notice, or fail to attend (no-show), a fee of 50% of the full groom price will apply. In these cases, your £20 deposit will be retained and applied toward this fee.
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 p-8 border-t flex gap-4">
              <button onClick={() => setShowAgreement(false)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold transition-all">
                I Agree & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 selection:bg-teal-100 selection:text-teal-900">
      <Header currentPage={currentPage} setPage={setCurrentPage} />
      <main className="flex-grow">{renderPage()}</main>
      <Footer setPage={setCurrentPage} />
      <AgreementModal />
      <div className="fixed bottom-4 left-4 z-40">
        <button onClick={() => setCurrentPage(currentPage === "admin" ? "home" : "admin")} className="text-[9px] text-slate-300 hover:text-slate-600 font-black uppercase tracking-[0.2em] transition-colors">
          {currentPage === "admin" ? "Exit Manager" : "Admin Login"}
        </button>
      </div>
    </div>
  );
};

export default App;
