import React, { useState } from "react";
import { Page } from "../types";

interface HeaderProps {
  currentPage: Page;
  setPage: (page: Page) => void;
}

const Header: React.FC<HeaderProps> = ({ currentPage, setPage }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pageNames: { [key: string]: string } = {
    home: "Home",
    services: "Services",
    gallery: "Gallery",
    about: "Our Story",
    locations: "Locations",
  };

  const handlePageChange = (page: Page) => {
    setPage(page);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex justify-center items-center h-20">
          <div className="flex items-center justify-center gap-x-5">
            <div className="flex items-center cursor-pointer group shrink-0" onClick={() => handlePageChange("home")}>
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center mr-3 group-hover:rotate-12 transition-transform">
                <span className="text-white text-base">🐾</span>
              </div>
              <span className="text-[20px] font-black text-slate-800 tracking-tight whitespace-nowrap">
                Maisey Days<span className="text-emerald-500">@</span>Dirty Dawg
              </span>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <nav className="flex space-x-3 lg:space-x-5 whitespace-nowrap">
                {(["home", "services", "about", "gallery", "locations"] as Page[]).map((p) => (
                  <button key={p} onClick={() => setPage(p)} className={`text-xs lg:text-sm font-bold uppercase tracking-wide transition-colors ${currentPage === p ? "text-emerald-600 border-b-2 border-emerald-600" : "text-slate-600 hover:text-emerald-600"}`}>
                    {pageNames[p]}
                  </button>
                ))}
              </nav>
              <button onClick={() => handlePageChange("booking")} className="bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 whitespace-nowrap">
                Book Now
              </button>
            </div>

            <div className="hidden xl:flex items-center cursor-pointer group shrink-0" onClick={() => handlePageChange("home")}>
              <span className="text-[20px] font-black text-slate-800 tracking-tight whitespace-nowrap">
                Maisey Days<span className="text-emerald-500">@</span>Winterton Hound Ground
              </span>
              <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center ml-3 group-hover:rotate-12 transition-transform">
                <span className="text-white text-base">🐾</span>
              </div>
            </div>
          </div>

          {/* Hamburger Menu Button */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden absolute right-0 flex flex-col justify-center items-center w-10 h-10 space-y-1.5" aria-label="Menu">
            <span className={`block w-6 h-0.5 bg-slate-800 transition-all ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`}></span>
            <span className={`block w-6 h-0.5 bg-slate-800 transition-all ${mobileMenuOpen ? "opacity-0" : ""}`}></span>
            <span className={`block w-6 h-0.5 bg-slate-800 transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`}></span>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-20 left-0 right-0 bg-white/95 backdrop-blur-md shadow-lg border-t border-slate-200">
            <nav className="flex flex-col p-4 space-y-2">
              {(["home", "services", "about", "gallery", "locations"] as Page[]).map((p) => (
                <button key={p} onClick={() => handlePageChange(p)} className={`text-left py-3 px-4 rounded-lg font-bold uppercase tracking-wider transition-colors ${currentPage === p ? "bg-emerald-50 text-emerald-600" : "text-slate-600 hover:bg-slate-50"}`}>
                  {pageNames[p]}
                </button>
              ))}
              <button onClick={() => handlePageChange("booking")} className="bg-emerald-600 text-white py-3 px-4 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center mt-2">
                Book Now
              </button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
