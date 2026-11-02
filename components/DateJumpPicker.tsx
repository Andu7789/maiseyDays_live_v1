import React, { useEffect, useMemo, useRef, useState } from "react";

interface DateJumpPickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  className?: string;
  /** "YYYY-MM-DD" to count the weeks-ahead shortcut from (e.g. the booking being rebooked) instead of today. */
  jumpFrom?: string | null;
}

const WEEKS_AHEAD_OPTIONS = Array.from({ length: 7 }, (_, i) => i + 4); // 4..10

const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Date field replacement: a browsable month calendar plus a "jump N weeks ahead"
 * shortcut, so bookings that always land ~6 weeks out don't need month-by-month clicking. */
const formatShort = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const DateJumpPicker: React.FC<DateJumpPickerProps> = ({ value, onChange, className, jumpFrom }) => {
  const [open, setOpen] = useState(false);
  const [jumpWarning, setJumpWarning] = useState<string | null>(null);
  const jumpFromDate = jumpFrom ? new Date(`${jumpFrom.slice(0, 10)}T00:00:00`) : null;
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const [viewDate, setViewDate] = useState(() => selected || new Date());

  useEffect(() => {
    if (open) setViewDate(selected || new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // Rebooks count from the original booking so the gap between grooms stays right.
  // If that lands in the past (the rebook is late), fall back to counting from today
  // and say so, rather than silently picking a date that has already gone.
  const jumpWeeks = (weeks: number) => {
    let d = new Date(jumpFromDate || today);
    d.setDate(d.getDate() + weeks * 7);
    if (jumpFromDate && d < today) {
      const fromToday = new Date(today);
      fromToday.setDate(fromToday.getDate() + weeks * 7);
      setJumpWarning(`${weeks} weeks from the original booking (${formatShort(jumpFromDate)}) was ${formatShort(d)}, which has already passed. Using ${weeks} weeks from today instead.`);
      d = fromToday;
    } else {
      setJumpWarning(null);
    }
    onChange(toISODate(d));
    setViewDate(d);
  };

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    return cells;
  }, [viewDate]);

  const pickDay = (d: Date) => {
    onChange(toISODate(d));
    setJumpWarning(null);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex-1 min-w-0 px-4 py-3 border rounded-lg text-sm font-bold bg-white hover:bg-slate-50 flex items-center gap-2 text-left"
      >
        <span>📅</span>
        <span className="truncate">{selected ? selected.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Pick a date"}</span>
      </button>
      <select
        value=""
        onChange={(e) => {
          const weeks = Number(e.target.value);
          if (weeks) jumpWeeks(weeks);
        }}
        title={jumpFromDate ? `Jump to a date this many weeks after the original booking (${formatShort(jumpFromDate)})` : "Jump to a date this many weeks from today"}
        className="shrink-0 px-2 py-3 border rounded-lg text-sm font-bold bg-white hover:bg-slate-50"
      >
        <option value="">In... weeks</option>
        {WEEKS_AHEAD_OPTIONS.map((w) => (
          <option key={w} value={w}>
            {w} weeks
          </option>
        ))}
      </select>
      </div>
      {jumpWarning ? (
        <p role="alert" className="mt-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ {jumpWarning}
        </p>
      ) : (
        jumpFromDate && <p className="mt-1 text-[11px] font-medium text-slate-500">Weeks count from the original booking, {formatShort(jumpFromDate)}</p>
      )}

      {open && (
        <div className="absolute z-[80] top-full mt-2 left-0 p-3 bg-white border border-slate-200 rounded-2xl shadow-xl" style={{ width: 272 }}>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 font-black text-slate-600"
            >
              ‹
            </button>
            <span className="text-sm font-black text-slate-800">{viewDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 font-black text-slate-600"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-slate-400">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((d, i) =>
              d ? (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    selected && isSameDay(d, selected)
                      ? "bg-emerald-600 text-white"
                      : isSameDay(d, today)
                        ? "bg-emerald-100 text-emerald-800"
                        : "hover:bg-emerald-100 text-slate-700"
                  }`}
                >
                  {d.getDate()}
                </button>
              ) : (
                <div key={i} />
              ),
            )}
          </div>
          <button type="button" onClick={() => setViewDate(new Date())} className="mt-2 w-full text-center text-xs font-bold text-emerald-600 hover:underline">
            Jump to today
          </button>
        </div>
      )}
    </div>
  );
};
