import React, { useEffect, useState } from "react";

// An iPhone home screen app resumes the page it already had open instead of reloading,
// so after a deploy Rachel could keep seeing the old version until she force closes it.
// Whenever the app comes back to the front, compare the live site's bundle with the one
// running here and offer a one tap update. A bar rather than an automatic reload, so a
// half typed booking is never thrown away.

const BUNDLE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const CHECK_GAP_MS = 60_000;

const runningBundle = () => {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute("src");
  return src?.match(BUNDLE)?.[0] ?? null;
};

export const UpdateBanner: React.FC = () => {
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const current = runningBundle();
    if (!current) return; // dev server, nothing to compare
    let lastCheck = 0;
    const check = async () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < CHECK_GAP_MS) return;
      lastCheck = Date.now();
      try {
        const html = await (await fetch("/", { cache: "no-store" })).text();
        const live = html.match(BUNDLE)?.[0];
        if (live && live !== current) {
          setStale(true);
          setDismissed(false);
        }
      } catch {
        // Offline, try again next time the app comes to the front.
      }
    };
    void check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 15 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(timer);
    };
  }, []);

  if (!stale || dismissed) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[60] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-3 rounded-2xl bg-slate-900 text-white shadow-2xl p-3 pl-5">
        <p className="flex-1 text-sm font-bold">A new version of Salon Manager is ready.</p>
        <button type="button" onClick={() => setDismissed(true)} className="px-3 py-2 rounded-xl text-sm font-bold text-slate-200 hover:text-white">
          Later
        </button>
        <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-sm font-black hover:bg-emerald-400">
          Update
        </button>
      </div>
    </div>
  );
};
