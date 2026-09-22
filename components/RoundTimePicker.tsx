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

  const pickHour = (h: number) => {
    updateTime(h, mm);
    setMode("minute");
  };

  const pickMinute = (m: number) => {
    updateTime(hh, m);
    setOpen(false);
    setMode("hour");
  };

  const size = 288;
  const center = size / 2;
  const outerRadius = 118; // AM hours 1–12
  const innerRadius = 74;  // PM hours 13–24

  const renderRing = (numbers: { label: string; value: number }[], radius: number, selectedValue: number, onPick: (v: number) => void) =>
    numbers.map(({ label, value: v }, i) => {
      const angle = (i / numbers.length) * 2 * Math.PI - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      const isSelected = v === selectedValue;
      return (
        <button
          key={label}
          type="button"
          onClick={() => onPick(v)}
          className={`absolute w-7 h-7 -ml-[14px] -mt-[14px] rounded-full flex items-center justify-center text-[11px] font-bold transition-all ${isSelected ? "bg-emerald-600 text-white" : "hover:bg-emerald-100 text-slate-700"}`}
          style={{ left: x, top: y }}
        >
          {label}
        </button>
      );
    });

  // AM hours (1–12) on the outside ring, PM hours (13–24) on the inside ring.
  // 24:00 is midnight, stored as 00:00 (hh = 0).
  const outerHours = Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
  const innerHours = [
    ...Array.from({ length: 11 }, (_, i) => ({ label: String(i + 13), value: i + 13 })),
    { label: "24", value: 0 },
  ];
  const minuteNumbers = Array.from({ length: 12 }, (_, i) => ({ label: String(i * 5).padStart(2, "0"), value: i * 5 }));

  const hourDial = (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-slate-100" />
      <div className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-emerald-600" style={{ left: center, top: center }} />
      {renderRing(outerHours, outerRadius, hh, pickHour)}
      {renderRing(innerHours, innerRadius, hh, pickHour)}
    </div>
  );

  const minuteDial = (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full bg-slate-100" />
      <div className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-emerald-600" style={{ left: center, top: center }} />
      {renderRing(minuteNumbers, outerRadius, mm, pickMinute)}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative inline-block ${className || ""}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="px-3 py-2 border rounded-lg text-sm font-bold bg-white hover:bg-slate-50 flex items-center gap-2">
        🕐 {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}
      </button>
      {open && (
        <div className="absolute z-[80] mt-2 p-4 bg-white border border-slate-200 rounded-2xl shadow-xl" style={{ minWidth: 260 }}>
          <div className="flex items-center justify-center gap-3 mb-4">
            <button type="button" onClick={() => setMode("hour")} className={`text-2xl font-black px-2 rounded transition-colors ${mode === "hour" ? "text-emerald-600" : "text-slate-500"}`}>
              {String(hh).padStart(2, "0")}
            </button>
            <span className="text-2xl font-black text-slate-300">:</span>
            <button type="button" onClick={() => setMode("minute")} className={`text-2xl font-black px-2 rounded transition-colors ${mode === "minute" ? "text-emerald-600" : "text-slate-500"}`}>
              {String(mm).padStart(2, "0")}
            </button>
          </div>
          {mode === "hour" ? hourDial : minuteDial}
        </div>
      )}
    </div>
  );
};
