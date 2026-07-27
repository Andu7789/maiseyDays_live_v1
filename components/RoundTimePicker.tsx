import React, { useEffect, useRef, useState } from "react";

interface RoundTimePickerProps {
  value: string; // "HH:MM", 24-hour
  onChange: (value: string) => void;
  className?: string;
}

/** A round analog clock face for picking a time, replacing the browser's native
 * type="time" scroll/spinner control. Pick the hour, then the minute (5-min steps). */
export const RoundTimePicker: React.FC<RoundTimePickerProps> = ({ value, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const containerRef = useRef<HTMLDivElement>(null);

  const [hhRaw, mmRaw] = (value || "09:00").split(":").map(Number);
  const hh = Number.isNaN(hhRaw) ? 9 : hhRaw;
  const mm = Number.isNaN(mmRaw) ? 0 : mmRaw;
  const isPM = hh >= 12;
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMode("hour");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const updateTime = (newHH: number, newMM: number) => onChange(`${String(newHH).padStart(2, "0")}:${String(newMM).padStart(2, "0")}`);

  const pickHour12 = (h12: number) => {
    const newHH = (h12 % 12) + (isPM ? 12 : 0);
    updateTime(newHH, mm);
    setMode("minute");
  };

  const pickMinute = (m: number) => {
    updateTime(hh, m);
    setOpen(false);
    setMode("hour");
  };

  const toggleAmPm = (pm: boolean) => updateTime((hh % 12) + (pm ? 12 : 0), mm);

  const size = 216;
  const center = size / 2;
  const radius = 82;

  const renderDial = (numbers: { label: string; value: number }[], selectedValue: number, onPick: (v: number) => void) => (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-slate-100" />
      <div className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-emerald-600" style={{ left: center, top: center }} />
      {numbers.map(({ label, value: v }, i) => {
        const angle = (i / numbers.length) * 2 * Math.PI - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const isSelected = v === selectedValue;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(v)}
            className={`absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full flex items-center justify-center text-sm font-bold transition-all ${isSelected ? "bg-emerald-600 text-white" : "hover:bg-emerald-100 text-slate-700"}`}
            style={{ left: x, top: y }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const hourNumbers = Array.from({ length: 12 }, (_, i) => ({ label: String(i === 0 ? 12 : i), value: i === 0 ? 12 : i }));
  const minuteNumbers = Array.from({ length: 12 }, (_, i) => ({ label: String(i * 5).padStart(2, "0"), value: i * 5 }));

  return (
    <div ref={containerRef} className={`relative inline-block ${className || ""}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="px-3 py-2 border rounded-lg text-sm font-bold bg-white hover:bg-slate-50 flex items-center gap-2">
        🕐 {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}
      </button>
      {open && (
        <div className="absolute z-[80] mt-2 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl" style={{ minWidth: 260 }}>
          <div className="flex items-center justify-center gap-3 mb-4">
            <button type="button" onClick={() => setMode("hour")} className={`text-2xl font-black px-2 rounded transition-colors ${mode === "hour" ? "text-emerald-600" : "text-slate-500"}`}>
              {String(hour12).padStart(2, "0")}
            </button>
            <span className="text-2xl font-black text-slate-300">:</span>
            <button type="button" onClick={() => setMode("minute")} className={`text-2xl font-black px-2 rounded transition-colors ${mode === "minute" ? "text-emerald-600" : "text-slate-500"}`}>
              {String(mm).padStart(2, "0")}
            </button>
            <div className="flex flex-col gap-1 ml-2">
              <button type="button" onClick={() => toggleAmPm(false)} className={`px-2 py-0.5 rounded text-xs font-bold ${!isPM ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                AM
              </button>
              <button type="button" onClick={() => toggleAmPm(true)} className={`px-2 py-0.5 rounded text-xs font-bold ${isPM ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                PM
              </button>
            </div>
          </div>
          {mode === "hour" ? renderDial(hourNumbers, hour12, pickHour12) : renderDial(minuteNumbers, mm, pickMinute)}
        </div>
      )}
    </div>
  );
};
