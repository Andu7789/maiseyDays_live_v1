import React, { useEffect, useState } from "react";
import { addDatedDogNote, getDogNoteText, replaceDogNoteText } from "../services/bookingService";

interface Props {
  email: string;
  dogName: string;
  /** Called after a save so the buttons above can update their highlight. */
  onChanged?: () => void;
}

/** The dog's lasting notes. They follow the dog across every booking, newest entry first, each stamped with its date. */
export const DogNotesPanel: React.FC<Props> = ({ email, dogName, onChanged }) => {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingAll, setEditingAll] = useState(false);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = email.trim() !== "" && dogName.trim() !== "";

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDogNoteText(email, dogName)
      .then((text) => !cancelled && setNotes(text))
      .catch(() => !cancelled && setError("Could not load the notes."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [email, dogName, ready]);

  if (!ready) {
    return <p className="text-sm text-slate-500">Add the owner's email and the dog's name first, so the notes can follow the dog.</p>;
  }

  const saveNote = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      setNotes(await addDatedDogNote(email, dogName, draft));
      setDraft("");
      onChanged?.();
    } catch {
      setError("Could not save the note. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    setError(null);
    try {
      await replaceDogNoteText(email, dogName, editText);
      setNotes(editText);
      setEditingAll(false);
      onChanged?.();
    } catch {
      setError("Could not save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Notes for <strong>{dogName}</strong>. They show on every booking for this dog, and each new note is dated automatically.
      </p>

      <div>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a note for today (the date is added for you)" className="w-full px-4 py-3 border rounded-lg min-h-20 text-sm" />
        <button type="button" onClick={saveNote} disabled={saving || !draft.trim()} className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg">
          {saving && !editingAll ? "Saving..." : "Save note"}
        </button>
      </div>

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      <div>
        <div className="flex items-center justify-between mb-1">
          <h5 className="text-xs font-black uppercase tracking-widest text-slate-400">Previous notes</h5>
          {!editingAll && notes && (
            <button
              type="button"
              onClick={() => {
                setEditText(notes);
                setEditingAll(true);
              }}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 underline"
            >
              Edit all notes
            </button>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : editingAll ? (
          <div>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="w-full px-4 py-3 border rounded-lg min-h-40 text-sm" />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={saveEdit} disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg">
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button type="button" onClick={() => setEditingAll(false)} className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        ) : notes ? (
          <div className="whitespace-pre-wrap text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-4 py-3 max-h-64 overflow-y-auto">{notes}</div>
        ) : (
          <p className="text-sm text-slate-400">No notes for {dogName} yet.</p>
        )}
      </div>
    </div>
  );
};
