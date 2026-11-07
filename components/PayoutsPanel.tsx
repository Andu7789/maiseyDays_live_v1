import React, { useEffect, useState } from "react";
import { LOCATIONS } from "../constants";
import { StripePayout, StripePayoutLine, getStripePayoutLines, getStripePayouts } from "../services/bookingService";

// Stripe pays deposits to the bank in batches, and the bank only shows one reference per batch.
// This lists each payout with the customers whose deposits (and refunds) are inside it.

const money = (pence: number) => `${pence < 0 ? "−" : ""}£${(Math.abs(pence) / 100).toFixed(2)}`;
const day = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const groomDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const salonName = (id: string | null) => LOCATIONS.find((l) => l.id === id)?.name.replace(/ Branch$/, "") ?? null;

const STATUS: Record<StripePayout["status"], { label: string; when: string; className: string }> = {
  paid: { label: "In your bank", when: "Arrived", className: "bg-emerald-100 text-emerald-800" },
  in_transit: { label: "On the way", when: "Due", className: "bg-sky-100 text-sky-800" },
  pending: { label: "On the way", when: "Due", className: "bg-sky-100 text-sky-800" },
  failed: { label: "Failed", when: "Was due", className: "bg-rose-100 text-rose-800" },
  canceled: { label: "Cancelled", when: "Was due", className: "bg-slate-200 text-slate-700" },
};

type LinesState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; lines: StripePayoutLine[] };

export const PayoutsPanel: React.FC = () => {
  const [payouts, setPayouts] = useState<StripePayout[] | null>(null);
  const [notPaidOut, setNotPaidOut] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, LinesState>>({});

  const loadLines = async (id: string) => {
    setLines((prev) => ({ ...prev, [id]: { status: "loading" } }));
    try {
      const result = await getStripePayoutLines(id);
      setLines((prev) => ({ ...prev, [id]: { status: "ready", lines: result.lines } }));
    } catch (err: any) {
      setLines((prev) => ({ ...prev, [id]: { status: "error", message: err?.message || "Couldn't load this payout" } }));
    }
  };

  const toggle = (payout: StripePayout) => {
    if (open === payout.id) return setOpen(null);
    setOpen(payout.id);
    if (payout.automatic && !lines[payout.id]) loadLines(payout.id);
  };

  const load = async () => {
    setError(null);
    setPayouts(null);
    setLines({});
    try {
      const result = await getStripePayouts();
      setPayouts(result.payouts);
      setNotPaidOut(result.notPaidOut);
      // Open the newest one straight away, it's the one Rachel is most likely matching against her bank.
      const first = result.payouts[0];
      if (first) {
        setOpen(first.id);
        if (first.automatic) loadLines(first.id);
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't load payouts from Stripe");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section aria-labelledby="payouts-heading" className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 id="payouts-heading" className="text-2xl font-black text-slate-800">Payouts</h2>
          <p className="text-slate-600 mt-1 max-w-xl">
            Stripe sends deposits to your bank in batches, so one bank payment can cover several customers. Tap a payout to see who it's from.
          </p>
        </div>
        <button onClick={load} disabled={payouts === null && !error} className="px-4 py-2 rounded-xl border-2 border-slate-200 font-bold text-slate-700 hover:border-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors">
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 p-4">
          {error}
        </p>
      )}

      {!error && payouts === null && <p className="text-slate-500" aria-live="polite">Loading payouts from Stripe…</p>}

      {payouts && (
        <>
          {notPaidOut > 0 && (
            <p className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 p-4">
              <strong>{money(notPaidOut)}</strong> is still with Stripe and will be in a future payout.
            </p>
          )}

          {payouts.length === 0 && <p className="text-slate-500">No payouts yet. They'll show here once Stripe sends money to your bank.</p>}

          <ul className="space-y-3">
            {payouts.map((payout) => {
              const status = STATUS[payout.status] ?? STATUS.pending;
              const isOpen = open === payout.id;
              const state = lines[payout.id];
              return (
                <li key={payout.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggle(payout)}
                    aria-expanded={isOpen}
                    aria-controls={`payout-${payout.id}`}
                    className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                  >
                    <span>
                      <span className="block text-xl font-black text-slate-800">{money(payout.amount)}</span>
                      <span className="block text-sm text-slate-600">
                        {status.when} {day(payout.arrivalDate)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${status.className}`}>{status.label}</span>
                      <span aria-hidden="true" className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div id={`payout-${payout.id}`} className="border-t border-slate-200 bg-slate-50 p-4">
                      {!payout.automatic && <p className="text-slate-600">This payout was sent by hand from Stripe, so Stripe can't list what's inside it.</p>}
                      {payout.automatic && (!state || state.status === "loading") && <p className="text-slate-500" aria-live="polite">Loading…</p>}
                      {state?.status === "error" && <p role="alert" className="text-rose-700">{state.message}</p>}
                      {state?.status === "ready" && <PayoutLines lines={state.lines} total={payout.amount} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

const PayoutLines: React.FC<{ lines: StripePayoutLine[]; total: number }> = ({ lines, total }) => {
  if (!lines.length) return <p className="text-slate-600">Stripe didn't list anything in this payout.</p>;

  const received = lines.filter((l) => l.kind === "payment").reduce((sum, l) => sum + l.amount, 0);
  const refunded = lines.filter((l) => l.kind === "refund").reduce((sum, l) => sum + l.amount, 0);
  const fees = lines.reduce((sum, l) => sum + l.fee, 0);
  const other = lines.filter((l) => l.kind === "other").reduce((sum, l) => sum + l.amount, 0);
  const sorted = [...lines].sort((a, b) => a.created - b.created);

  return (
    <>
      <ul className="divide-y divide-slate-200">
        {sorted.map((line) => {
          const name = line.kind === "other" ? line.description : line.ownerName || "Unknown customer";
          const details = [
            line.dogName,
            line.groomDate ? `groom ${groomDay(line.groomDate)}` : null,
            salonName(line.locationId),
          ].filter(Boolean);
          return (
            <li key={line.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-800">
                  {line.kind === "refund" && <span className="text-rose-700">Refund: </span>}
                  {name}
                </p>
                {details.length > 0 && <p className="text-sm text-slate-600">{details.join(", ")}</p>}
                {line.kind !== "other" && !line.matched && <p className="text-sm text-amber-800">No booking found for this payment</p>}
              </div>
              <span className={`font-bold whitespace-nowrap ${line.amount < 0 ? "text-rose-700" : "text-slate-800"}`}>{money(line.amount)}</span>
            </li>
          );
        })}
      </ul>

      <dl className="mt-3 pt-3 border-t-2 border-slate-300 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-600">Deposits received</dt>
        <dd className="text-right text-slate-800">{money(received)}</dd>
        {refunded !== 0 && (
          <>
            <dt className="text-slate-600">Refunds</dt>
            <dd className="text-right text-rose-700">{money(refunded)}</dd>
          </>
        )}
        {other !== 0 && (
          <>
            <dt className="text-slate-600">Other Stripe adjustments</dt>
            <dd className="text-right text-slate-800">{money(other)}</dd>
          </>
        )}
        <dt className="text-slate-600">Stripe fees</dt>
        <dd className="text-right text-slate-800">{money(-fees)}</dd>
        <dt className="font-black text-slate-800">Paid to your bank</dt>
        <dd className="text-right font-black text-slate-800">{money(total)}</dd>
      </dl>
    </>
  );
};
