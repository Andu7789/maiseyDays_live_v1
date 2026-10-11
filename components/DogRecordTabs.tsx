import React, { useCallback, useEffect, useState } from "react";
import { getDogNoteText, getOralCareEntries } from "../services/bookingService";
import { DogNotesPanel } from "./DogNotesPanel";
import { OralCarePanel } from "./OralCarePanel";

interface Props {
  email: string;
  dogName: string;
}

interface Summary {
  noteCount: number;
  latestNote: string;
  flaggedTeeth: number;
}

const EMPTY: Summary = { noteCount: 0, latestNote: "", flaggedTeeth: 0 };

const tabClass = (active: boolean, attention: boolean) => {
  if (active) return "bg-slate-800 border-slate-800 text-white";
  if (attention) return "bg-amber-100 border-amber-500 text-amber-950 hover:border-amber-700";
  return "bg-white border-slate-300 text-slate-700 hover:border-slate-500";
};

const Badge: React.FC<{ children: React.ReactNode; active: boolean }> = ({ children, active }) => (
  <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-black ${active ? "bg-white text-slate-950" : "bg-amber-600 text-white"}`}>{children}</span>
);

/** The Notes and Oral care buttons for a dog, shared by every booking window. Highlights what's already on file so it isn't missed. */
export const DogRecordTabs: React.FC<Props> = ({ email, dogName }) => {
  const [open, setOpen] = useState<"notes" | "oral" | null>(null);
  const [summary, setSummary] = useState<Summary>(EMPTY);

  const ready = email.trim() !== "" && dogName.trim() !== "";

  const refresh = useCallback(async () => {
    if (!ready) {
      setSummary(EMPTY);
      return;
    }
    try {
      const [notes, oral] = await Promise.all([getDogNoteText(email, dogName), getOralCareEntries(email, dogName)]);
      const blocks = notes.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      setSummary({ noteCount: blocks.length, latestNote: blocks[0] || "", flaggedTeeth: new Set(oral.map((e) => e.tooth)).size });
    } catch {
      setSummary(EMPTY);
    }
  }, [email, dogName, ready]);

  // Wait for typing to settle so a half-typed email doesn't trigger a lookup per keystroke.
  useEffect(() => {
    const timer = setTimeout(refresh, 500);
    return () => clearTimeout(timer);
  }, [refresh]);

  const hasNotes = summary.noteCount > 0;
  const hasOral = summary.flaggedTeeth > 0;

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setOpen((current) => (current === "notes" ? null : "notes"))} aria-expanded={open === "notes"} className={`px-5 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${tabClass(open === "notes", hasNotes)}`}>
          📝 Notes
          {hasNotes && <Badge active={open === "notes"}>{summary.noteCount}</Badge>}
        </button>
        <button type="button" onClick={() => setOpen((current) => (current === "oral" ? null : "oral"))} aria-expanded={open === "oral"} className={`px-5 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${tabClass(open === "oral", hasOral)}`}>
          🦷 Oral care
          {hasOral && <Badge active={open === "oral"}>{summary.flaggedTeeth} {summary.flaggedTeeth === 1 ? "tooth" : "teeth"}</Badge>}
        </button>
      </div>

      {/* Visible without clicking, so notes already on file are never missed */}
      {open !== "notes" && hasNotes && (
        <button type="button" onClick={() => setOpen("notes")} className="mt-3 w-full text-left px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors">
          <span className="block text-[11px] font-black uppercase tracking-widest text-amber-800">📌 
            {dogName} has {summary.noteCount} {summary.noteCount === 1 ? "note" : "notes"} on file. Latest:
          </span>
          <span className="block text-sm text-amber-950 whitespace-pre-wrap line-clamp-3">{summary.latestNote}</span>
        </button>
      )}
      {open !== "oral" && hasOral && (
        <button type="button" onClick={() => setOpen("oral")} className="mt-3 w-full text-left px-4 py-2 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors text-sm text-amber-950">
          <span className="text-[11px] font-black uppercase tracking-widest text-amber-800">📌 Oral care: </span>
          {summary.flaggedTeeth} {summary.flaggedTeeth === 1 ? "tooth has" : "teeth have"} findings recorded.
        </button>
      )}

      {open === "notes" && (
        <div className="mt-4">
          <DogNotesPanel email={email} dogName={dogName} onChanged={refresh} />
        </div>
      )}
      {open === "oral" && (
        <div className="mt-4">
          <OralCarePanel email={email} dogName={dogName} onChanged={refresh} />
        </div>
      )}
    </div>
  );
};
