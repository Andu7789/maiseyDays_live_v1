import React, { useEffect, useState } from "react";
import {
  ACTION_LABELS,
  BookingHistoryAction,
  BookingHistoryEntry,
  describeBooking,
  describeChanges,
  formatHistoryTimestamp,
  getBookingHistory,
  getLastRestoredTimes,
  restoreDeletedBooking,
  searchBookingHistory,
} from "../services/bookingHistoryService";

const ACTION_STYLES: Record<BookingHistoryAction, string> = {
  created: "bg-emerald-100 text-emerald-800",
  updated: "bg-sky-100 text-sky-800",
  deleted: "bg-rose-100 text-rose-800",
  restored: "bg-teal-100 text-teal-800",
  save_failed: "bg-amber-100 text-amber-900",
  message_sent: "bg-violet-100 text-violet-800",
};

// Website requests that never paid their deposit are cleared out automatically; they were never real bookings.
const isAbandonedOnlineRequest = (entry: BookingHistoryEntry) => entry.action === "deleted" && entry.old_row?.booking_status === "awaiting_payment";

const entryDetail = (entry: BookingHistoryEntry): string[] => {
  switch (entry.action) {
    case "updated":
      return describeChanges(entry);
    case "created": {
      const source = entry.new_row?.booking_source === "web" ? "Requested on the website" : "Added on the admin page";
      return [source];
    }
    case "deleted":
      return isAbandonedOnlineRequest(entry) ? ["Online request where the deposit was never paid, removed automatically"] : ["Removed from the diary. A full copy is kept here."];
    case "restored":
      return ["Put back in the diary from the recycle bin"];
    case "save_failed": {
      const operation = entry.details?.operation === "update" ? "Changing this booking" : entry.details?.operation === "delete" ? "Deleting this booking" : "Saving a new booking";
      return [`${operation} failed: ${entry.details?.error || "unknown error"}`, "Nothing was saved, so this booking may need adding again."];
    }
    case "message_sent": {
      const channel = entry.details?.channel === "sms" ? "SMS sent" : "WhatsApp opened to send";
      return [`${channel}: ${entry.details?.kind || "message"}`];
    }
    default:
      return [];
  }
};

const HistoryEntryRow: React.FC<{
  entry: BookingHistoryEntry;
  showBooking: boolean;
  restored?: boolean;
  restoring?: boolean;
  onRestore?: (entry: BookingHistoryEntry) => void;
}> = ({ entry, showBooking, restored, restoring, onRestore }) => {
  const canRestore = entry.action === "deleted" && !isAbandonedOnlineRequest(entry) && onRestore;
  return (
    <li className="p-3 sm:p-4 bg-white">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide ${ACTION_STYLES[entry.action]}`}>{ACTION_LABELS[entry.action]}</span>
        <span className="text-xs font-bold text-slate-600">{formatHistoryTimestamp(entry.changed_at)}</span>
        {entry.actor && <span className="text-xs text-slate-500">· {entry.actor}</span>}
      </div>
      {showBooking && <p className="text-sm font-bold text-slate-800 break-words">{describeBooking(entry)}</p>}
      <ul className="mt-1 space-y-0.5">
        {entryDetail(entry).map((line, i) => (
          <li key={i} className="text-sm text-slate-700 break-words">
            {line}
          </li>
        ))}
      </ul>
      {entry.action === "message_sent" && entry.details?.message && (
        <details className="mt-1">
          <summary className="text-xs font-bold text-violet-700 cursor-pointer">Show message</summary>
          <p className="mt-1 text-xs text-slate-700 whitespace-pre-line bg-slate-50 border border-slate-200 rounded-lg p-2">{entry.details.message}</p>
        </details>
      )}
      {canRestore &&
        (restored ? (
          <p className="mt-2 text-xs font-bold text-teal-700">✓ Back in the diary</p>
        ) : (
          <button
            type="button"
            disabled={restoring}
            onClick={() => onRestore!(entry)}
            className="mt-2 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold"
          >
            {restoring ? "Restoring…" : "↩ Restore to diary"}
          </button>
        ))}
    </li>
  );
};

/** Collapsible history for one booking, shown inside Update Booking. */
export const BookingHistoryPanel: React.FC<{ appointmentId: string }> = ({ appointmentId }) => {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<BookingHistoryEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setEntries(null);
    setError("");
  }, [appointmentId]);

  useEffect(() => {
    if (!open || entries) return;
    getBookingHistory(appointmentId)
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, [open, entries, appointmentId]);

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-sm font-bold text-slate-700 hover:text-slate-900">
        🕑 Booking history {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-2">
          {error && <p className="text-sm text-rose-700">{error}</p>}
          {!error && !entries && <p className="text-sm text-slate-500">Loading…</p>}
          {entries && entries.length === 0 && <p className="text-sm text-slate-500">No history yet. Changes are recorded from 2 Nov 2026 onwards.</p>}
          {entries && entries.length > 0 && (
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {entries.map((entry) => (
                <HistoryEntryRow key={entry.id} entry={entry} showBooking={false} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

type HistoryFilter = "all" | "deleted" | "save_failed" | "message_sent";

const FILTERS: { id: HistoryFilter; label: string; actions?: BookingHistoryAction[] }[] = [
  { id: "all", label: "Everything" },
  { id: "deleted", label: "🗑 Recently deleted", actions: ["deleted"] },
  { id: "save_failed", label: "⚠ Failed saves", actions: ["save_failed"] },
  { id: "message_sent", label: "💬 Messages", actions: ["message_sent"] },
];

/** The History tab: search everything that happened to any booking, and restore deleted ones. */
export const BookingHistoryView: React.FC<{ onRestored: () => void }> = ({ onRestored }) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [entries, setEntries] = useState<BookingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoredTimes, setRestoredTimes] = useState<Map<string, string>>(new Map());
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const actions = FILTERS.find((f) => f.id === filter)?.actions;
        const found = await searchBookingHistory(query, actions);
        const deletedIds = found.filter((e) => e.action === "deleted" && e.appointment_id).map((e) => e.appointment_id as string);
        const restored = await getLastRestoredTimes(deletedIds);
        if (cancelled) return;
        setEntries(found);
        setRestoredTimes(restored);
        setError("");
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, filter]);

  const handleRestore = async (entry: BookingHistoryEntry) => {
    if (!window.confirm(`Put this booking back in the diary?\n\n${describeBooking(entry)}`)) return;
    setRestoringId(entry.id);
    try {
      const id = await restoreDeletedBooking(entry.id);
      setRestoredTimes((prev) => new Map(prev).set(id, new Date().toISOString()));
      onRestored();
    } catch (err: any) {
      alert(`Could not restore: ${err.message}`);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-6">
      <h2 className="text-2xl font-black text-slate-800 mb-1">Booking History</h2>
      <p className="text-sm text-slate-600 mb-4">Every booking made, changed or deleted since 2 Nov 2026, plus failed saves and messages sent. Search a customer or dog to check what happened.</p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Owner, dog, phone or email..."
        aria-label="Search booking history"
        className="w-full px-4 py-3 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-teal-500 font-medium mb-3"
      />
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${filter === f.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-700 border-slate-200 hover:border-slate-400"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm font-bold text-rose-700 mb-3">{error}</p>}
      {loading && entries.length === 0 && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-slate-500">{query.trim() ? `Nothing recorded for "${query.trim()}".` : "Nothing recorded yet."}</p>
      )}
      {entries.length > 0 && (
        <ul className={`divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden ${loading ? "opacity-60" : ""}`}>
          {entries.map((entry) => (
            <HistoryEntryRow
              key={entry.id}
              entry={entry}
              showBooking
              restored={!!entry.appointment_id && (restoredTimes.get(entry.appointment_id) || "") > entry.changed_at}
              restoring={restoringId === entry.id}
              onRestore={handleRestore}
            />
          ))}
        </ul>
      )}
      {entries.length >= 200 && <p className="mt-2 text-xs text-slate-500 text-center">Showing the latest 200. Search to narrow it down.</p>}
    </div>
  );
};
