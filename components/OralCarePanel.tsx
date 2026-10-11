import React, { useEffect, useState } from "react";
import { ORAL_CARE_CONDITIONS } from "../constants";
import { addOralCareEntry, deleteOralCareEntry, getOralCareEntries } from "../services/bookingService";
import { OralCareEntry } from "../types";
import { ToothChart } from "./ToothChart";
import { ALL_TEETH } from "./toothChartLayout";

interface Props {
  email: string;
  dogName: string;
  /** Called after a save or delete so the buttons above can update their highlight. */
  onChanged?: () => void;
}

const today = () => new Date().toISOString().split("T")[0];
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const toothNumber = (tooth: string) => Number(tooth.replace(/\D/g, "")) || 0;

const conditionStyle = (condition: string) => {
  if (condition === "Missing" || condition === "Extracted") return "bg-slate-200 border-slate-400 text-slate-700";
  if (condition === "Abscess" || condition === "Fractured" || condition === "Resorptive lesion" || condition === "Carious lesion") return "bg-rose-100 border-rose-400 text-rose-800";
  return "bg-amber-100 border-amber-400 text-amber-800";
};

/** Tooth chart for the dog. Click a tooth, pick what you found, and it is saved with today's date. */
export const OralCarePanel: React.FC<Props> = ({ email, dogName, onChanged }) => {
  const [entries, setEntries] = useState<OralCareEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [condition, setCondition] = useState(ORAL_CARE_CONDITIONS[0]);
  const [note, setNote] = useState("");
  const [recordedOn, setRecordedOn] = useState(today());
  const [saving, setSaving] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = email.trim() !== "" && dogName.trim() !== "";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getOralCareEntries(email, dogName));
    } catch {
      setError("Could not load the oral care chart.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) load();
  }, [email, dogName, ready]);

  if (!ready) {
    return <p className="text-sm text-slate-500">Add the owner's email and the dog's name first, so the chart can follow the dog.</p>;
  }

  // Entries come newest first, so the first one found for a tooth and condition is its latest.
  const latestFindings = new Map<string, OralCareEntry>();
  for (const entry of entries) {
    const key = `${entry.tooth}|${entry.condition}`;
    if (!latestFindings.has(key)) latestFindings.set(key, entry);
  }
  const findingsByTooth: Record<string, string[]> = {};
  for (const entry of latestFindings.values()) (findingsByTooth[entry.tooth] ||= []).push(entry.condition);

  const pickTooth = (tooth: string) => {
    setSelected(tooth);
    setCondition(ORAL_CARE_CONDITIONS[0]);
    setNote("");
    setRecordedOn(today());
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await addOralCareEntry({ ownerEmail: email, dogName, tooth: selected, condition, note, recordedOn });
      setSelected(null);
      await load();
      onChanged?.();
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: OralCareEntry) => {
    if (!window.confirm(`Delete the ${entry.tooth} entry (${entry.condition}, ${formatDate(entry.recorded_on)})?`)) return;
    try {
      await deleteOralCareEntry(entry.id);
      await load();
      onChanged?.();
    } catch {
      setError("Could not delete that entry.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Oral care for <strong>{dogName}</strong>. Click a tooth on the chart to record what you found.
        </p>
        <button type="button" onClick={() => setShowTable((v) => !v)} className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg whitespace-nowrap">
          {showTable ? "Hide table" : "View table"}
        </button>
      </div>

      <ToothChart selected={selected} findings={findingsByTooth} onSelect={pickTooth} />
      <p className="text-[11px] text-slate-500 text-center -mt-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#7cc4f0] mr-1"></span>Incisors
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#8cc63f] ml-3 mr-1"></span>Canines
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#e87a6e] ml-3 mr-1"></span>Premolars
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#9a9a9a] ml-3 mr-1"></span>Molars
        <span className="ml-3 text-rose-700 font-bold">Red outline = finding recorded</span>
      </p>
      <label className="block text-xs font-bold text-slate-500">
        Or choose a tooth by number
        <select value={selected ?? ""} onChange={(e) => e.target.value && pickTooth(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal text-slate-800 bg-white">
          <option value="">Select a tooth...</option>
          {ALL_TEETH.map((tooth) => (
            <option key={tooth} value={tooth}>
              {tooth}
              {findingsByTooth[tooth] ? ` (${findingsByTooth[tooth].join(", ")})` : ""}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <div className="p-4 bg-white border-2 border-emerald-200 rounded-lg space-y-3">
          <h5 className="text-sm font-black text-slate-800">Tooth {selected}</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-bold text-slate-500">
              Condition
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal text-slate-800">
                {ORAL_CARE_CONDITIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-slate-500">
              Date
              <input type="date" value={recordedOn} onChange={(e) => setRecordedOn(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal text-slate-800" />
            </label>
          </div>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg">
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setSelected(null)} className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      {showTable &&
        (loading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing recorded for {dogName} yet.</p>
        ) : (
          <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-slate-400 border-b border-slate-200">
                  <th className="px-3 py-2">Tooth</th>
                  <th className="px-3 py-2">Condition</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {[...entries]
                  .sort((a, b) => toothNumber(a.tooth) - toothNumber(b.tooth) || b.recorded_on.localeCompare(a.recorded_on))
                  .map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-black">{entry.tooth}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full border text-xs font-bold ${conditionStyle(entry.condition)}`}>{entry.condition}</span>
                        {latestFindings.get(`${entry.tooth}|${entry.condition}`)?.id !== entry.id && <span className="ml-2 text-[10px] text-slate-400">earlier</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{entry.note || ""}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(entry.recorded_on)}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => remove(entry)} className="text-xs text-slate-400 hover:text-rose-600 font-bold" aria-label={`Delete ${entry.tooth} entry`}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
};
