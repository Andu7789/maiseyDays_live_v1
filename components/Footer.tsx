import React, { useState, useEffect } from "react";
import { Page } from "../types";
import { getUnavailableWeekdays } from "../services/bookingService";
import { LOCATIONS } from "../constants";

interface FooterProps {
  setPage: (page: Page) => void;
}

const Footer: React.FC<FooterProps> = ({ setPage }) => {
  const [openDays, setOpenDays] = useState("Monday - Saturday");

  useEffect(() => {
    const loadOpenDays = async () => {
      try {
        const unavailableWeekdays = await getUnavailableWeekdays();
        const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        // Map day names to their original Sunday-first indices (0=Sunday, 1=Monday, etc.)
        const dayIndexMap: { [key: string]: number } = {
          Sunday: 0,
          Monday: 1,
          Tuesday: 2,
          Wednesday: 3,
          Thursday: 4,
          Friday: 5,
          Saturday: 6,
        };
        const availableDays = allDays.filter((day) => !unavailableWeekdays.includes(dayIndexMap[day]));

        if (availableDays.length === 0) {
          setOpenDays("By appointment only");
        } else if (availableDays.length === 1) {
          setOpenDays(availableDays[0]);
        } else {
          const formatted = availableDays.join(", ").replace(/, ([^,]*)$/, " & $1");
          setOpenDays(formatted);
        }
      } catch (err) {
        setOpenDays("Monday - Saturday");
      }
    };
    loadOpenDays();
  }, []);

  return (
    <footer className="bg-slate-900 text-slate-300 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center mb-6">
              <span className="text-white text-2xl">🐾</span>
              <span className="text-2xl font-black text-white ml-2">Maisey Days @ Dirty Dawg</span>
            </div>
            <p className="text-slate-400 max-w-sm">Grooming with care since 2018, treating every dog with patience, kindness and sensitivity</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button onClick={() => setPage("services")} className="hover:text-emerald-400 transition-colors bg-none border-none p-0 cursor-pointer">
                  Our Services
                </button>
              </li>
              <li>
                <button onClick={() => setPage("home")} className="hover:text-emerald-400 transition-colors bg-none border-none p-0 cursor-pointer">
                  Our Story
                </button>
              </li>
              <li>
                <button onClick={() => setPage("home")} className="hover:text-emerald-400 transition-colors bg-none border-none p-0 cursor-pointer">
                  Gallery
                </button>
              </li>
              <li>
                <button onClick={() => setPage("locations")} className="hover:text-emerald-400 transition-colors bg-none border-none p-0 cursor-pointer">
                  Find a Location
                </button>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Contact</h4>
            <div className="space-y-4">
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-semibold text-white text-xs">{LOCATIONS[0].name}</p>
                  <p className="text-xs">{LOCATIONS[0].address}</p>
                  <p className="text-xs">{LOCATIONS[0].phone}</p>
                </div>
                <div className="border-t border-slate-700 pt-2">
                  <p className="font-semibold text-white text-xs">{LOCATIONS[1].name}</p>
                  <p className="text-xs">{LOCATIONS[1].address}</p>
                  <p className="text-xs">{LOCATIONS[1].phone}</p>
                </div>
                <div className="border-t border-slate-700 pt-2 text-xs">
                  <p className="font-semibold text-white">Email</p>
                  <p>hello@dirtydawggrooming.co.uk</p>
                </div>
                <div className="border-t border-slate-700 pt-2 text-xs">
                  <p className="font-semibold text-white">{openDays}</p>
                  <p>9am - 8pm</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 text-center text-xs text-slate-500">&copy; {new Date().getFullYear()} Maisey Days @ Dirty Dawg Dog Grooming. All rights reserved.</div>
      </div>
    </footer>
  );
};

export default Footer;
