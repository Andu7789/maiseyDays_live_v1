import React, { useEffect, useState } from "react";
import { LOCATIONS } from "../constants";
import { Matrix, buildQrSvg, loadQrImage, svgDataUrl } from "./qrArt";
import { SheetKind, buildSheetPdf } from "./qrSheets";

// QR codes for posters, business cards, flyers and stickers. Everything is built in the
// browser, so it works the same in the website admin and the home screen app.

const SITE_URL = "https://maiseydaysdoggrooming.co.uk/";
const BOOK_URL = `${SITE_URL}#book`;
const SITE_LABEL = "maiseydaysdoggrooming.co.uk";
const PHONE = LOCATIONS[0]?.phone ?? "07368 465966";
const PNG_SIZE = 2048;

type Target = "book" | "home" | "review" | "custom";

const TARGETS: { id: Target; label: string; hint: string; caption: string }[] = [
  { id: "book", label: "Book online", hint: "Opens the booking form straight away. Best for posters and business cards.", caption: "Scan to book your groom" },
  { id: "home", label: "Website home page", hint: "Opens the main website so people can look around first.", caption: "Scan to visit our website" },
  { id: "review", label: "Leave a Google review", hint: "Handy on the counter or on a card you hand over after a groom.", caption: "Scan to leave us a review" },
  { id: "custom", label: "Another link", hint: "Any web address, for example a Facebook page.", caption: "Scan me" },
];

const COLOURS = [
  { id: "green", label: "Maisey green", hex: "#047857" },
  { id: "navy", label: "Navy", hex: "#1e2a5a" },
  { id: "black", label: "Black", hex: "#000000" },
] as const;
type ColourId = (typeof COLOURS)[number]["id"];

const SHEETS: { id: SheetKind; label: string; hint: string; file: string }[] = [
  { id: "poster", label: "A4 poster", hint: "For the window, noticeboards and vets", file: "poster" },
  { id: "cards", label: "Business cards", hint: "10 per sheet with cutting lines, standard 85 x 55mm", file: "business-cards" },
  { id: "stickers", label: "Stickers and labels", hint: "12 per sheet, 5cm codes for leads, bags and flyers", file: "stickers" },
];

const isAppleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const downloadBlob = (blob: Blob, filename: string) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

type SaveResult = "done" | "cancelled" | "tap-again";

// Same fix as the Dog Grooming app: on an iPhone or iPad a downloaded file opens on a
// preview screen with no way to save a picture to Photos, and in the home screen app it
// can leave Rachel stuck on that screen. So pictures and PDFs go through the share sheet
// there instead (Save Image, Print, Save to Files, WhatsApp, AirDrop). Safari only allows
// the share sheet straight after a tap, so if the file took too long to make we keep it
// and ask for one more tap rather than falling back to a download.
const saveFile = async (blob: Blob, filename: string): Promise<SaveResult> => {
  if (isAppleMobile() && (blob.type === "image/png" || blob.type === "application/pdf")) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return "done";
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
        return "tap-again";
      }
    }
  }
  downloadBlob(blob, filename);
  return "done";
};

// Draw the code onto a canvas, then add the caption with the site's own font.
const buildPng = async (m: Matrix, fg: string, paw: boolean, caption: string): Promise<Blob> => {
  const img = await loadQrImage(m, fg, paw, PNG_SIZE);
  const capH = caption ? Math.round(PNG_SIZE * 0.15) : 0;
  const canvas = document.createElement("canvas");
  canvas.width = PNG_SIZE;
  canvas.height = PNG_SIZE + capH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, PNG_SIZE, PNG_SIZE);
  if (caption) {
    let px = Math.round(PNG_SIZE * 0.085);
    try {
      await document.fonts.load(`700 ${px}px Outfit`);
    } catch {}
    ctx.font = `700 ${px}px Outfit, Arial, sans-serif`;
    while (ctx.measureText(caption).width > PNG_SIZE * 0.92 && px > 20) {
      px -= 4;
      ctx.font = `700 ${px}px Outfit, Arial, sans-serif`;
    }
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(caption, PNG_SIZE / 2, PNG_SIZE + capH * 0.2);
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG export failed"))), "image/png"));
};

export const QrCodePanel: React.FC<{ reviewLink: string }> = ({ reviewLink }) => {
  const [target, setTarget] = useState<Target>("book");
  const [customUrl, setCustomUrl] = useState("");
  const [colour, setColour] = useState<ColourId>("green");
  const [paw, setPaw] = useState(true);
  const [caption, setCaption] = useState(TARGETS[0].caption);
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [sheets, setSheets] = useState<Partial<Record<SheetKind, Blob>>>({});
  const [making, setMaking] = useState<SheetKind | null>(null);
  const appleMobile = isAppleMobile();

  const fg = COLOURS.find((c) => c.id === colour)?.hex ?? "#000000";
  const url = target === "book" ? BOOK_URL : target === "home" ? SITE_URL : target === "review" ? reviewLink.trim() : customUrl.trim();
  const urlOk = /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url);
  const fileBase = `maisey-days-qr-${target}`;
  const cleanCaption = caption.trim();

  useEffect(() => {
    if (!urlOk) {
      setMatrix(null);
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then(({ create }) => {
        if (cancelled) return;
        // High error correction leaves room for the paw in the middle.
        const qr = create(url, { errorCorrectionLevel: paw ? "H" : "M" });
        setMatrix({ size: qr.modules.size, data: qr.modules.data });
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't make the QR code. Please refresh the page and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [url, urlOk, paw]);

  // Build the PNG ahead of the tap so the iPhone share sheet opens straight away.
  // Any change also throws away PDFs made with the old settings.
  useEffect(() => {
    setPng(null);
    setSheets({});
    if (!matrix) return;
    let cancelled = false;
    const t = setTimeout(() => {
      buildPng(matrix, fg, paw, cleanCaption)
        .then((b) => !cancelled && setPng(b))
        .catch(() => !cancelled && setError("Couldn't make the PNG. Try the SVG download instead."));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [matrix, fg, paw, cleanCaption]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const chooseTarget = (t: Target) => {
    // Swap the caption too, unless Rachel has written her own.
    if (TARGETS.some((x) => x.caption === caption) || !caption.trim()) setCaption(TARGETS.find((x) => x.id === t)?.caption ?? "");
    setTarget(t);
  };

  const afterSave = (r: SaveResult) => {
    if (r === "tap-again") setNotice("It's ready. Tap the button again to save or print it.");
  };

  const downloadPng = async () => {
    if (png) afterSave(await saveFile(png, `${fileBase}.png`));
  };

  const downloadSvg = () => {
    if (!matrix) return;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${buildQrSvg(matrix, fg, paw, { caption: cleanCaption })}`;
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${fileBase}.svg`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
    } catch {
      setNotice("Couldn't copy, select the link and copy it by hand");
    }
  };

  // On a computer the PDF opens in a new tab ready to print. The tab is opened during the
  // tap (so pop up blockers allow it) and filled in once the PDF is made.
  const openSheet = async (kind: SheetKind) => {
    if (!matrix || making) return;
    const name = `maisey-days-${SHEETS.find((s) => s.id === kind)?.file ?? kind}.pdf`;
    const ready = sheets[kind];
    let win: Window | null = null;
    if (!appleMobile) {
      win = window.open("", "_blank");
      win?.document.write('<p style="font:18px Arial,sans-serif;padding:32px;color:#334155">Making your PDF...</p>');
    }
    let blob = ready;
    if (!blob) {
      setMaking(kind);
      try {
        blob = await buildSheetPdf(kind, matrix, { fg, paw, caption: cleanCaption, phone: PHONE, site: SITE_LABEL });
        setSheets((s) => ({ ...s, [kind]: blob }));
      } catch {
        win?.close();
        setError("Couldn't make the PDF. Please try again.");
        return;
      } finally {
        setMaking(null);
      }
    }
    if (appleMobile) afterSave(await saveFile(blob, name));
    else if (win) win.location.href = URL.createObjectURL(blob);
    else downloadBlob(blob, name);
  };

  const reviewMissing = !reviewLink.trim();
  const btn = "w-full text-left px-4 py-3 rounded-2xl border-2 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8">
      <h2 className="text-2xl font-black mb-2 text-slate-800">QR Code</h2>
      <p className="text-slate-600 mb-8 max-w-2xl">Make a QR code for posters, business cards, flyers and stickers. People point their phone camera at it and it opens the page you choose.</p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          <fieldset>
            <legend className="text-lg font-bold text-slate-800 mb-3">Where should it take people?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TARGETS.map((t) => {
                const disabled = t.id === "review" && reviewMissing;
                return (
                  <label key={t.id} className={`flex gap-3 p-4 rounded-2xl border-2 transition-all ${disabled ? "opacity-60 cursor-not-allowed border-slate-200" : "cursor-pointer"} ${target === t.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="radio" name="qr-target" value={t.id} checked={target === t.id} disabled={disabled} onChange={() => chooseTarget(t.id)} className="mt-1 w-4 h-4 accent-emerald-600 shrink-0" />
                    <span>
                      <span className="block font-bold text-slate-800">{t.label}</span>
                      <span className="block text-sm text-slate-600 mt-0.5">{disabled ? "Add your Google review link in Settings first." : t.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {target === "custom" && (
              <div className="mt-4">
                <label htmlFor="qr-custom-url" className="block text-sm font-bold text-slate-700 mb-2">
                  Web address
                </label>
                <input id="qr-custom-url" type="url" inputMode="url" placeholder="https://www.facebook.com/..." value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none" />
                {customUrl.trim() && !urlOk && <p className="text-sm text-rose-700 mt-2">Start the address with https:// and include the full link.</p>}
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor="qr-caption" className="block text-lg font-bold text-slate-800 mb-1">
              Words under the code
            </label>
            <p className="text-sm text-slate-600 mb-3">Used on the downloads and the print sheets. Leave it blank for none.</p>
            <input id="qr-caption" type="text" maxLength={40} value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none" />
          </div>

          <fieldset>
            <legend className="text-lg font-bold text-slate-800 mb-3">Colour</legend>
            <div className="flex flex-wrap gap-3">
              {COLOURS.map((c) => (
                <label key={c.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 cursor-pointer transition-all ${colour === c.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="qr-colour" value={c.id} checked={colour === c.id} onChange={() => setColour(c.id)} className="sr-only" />
                  <span aria-hidden="true" className="w-6 h-6 rounded-full ring-2 ring-white shadow" style={{ backgroundColor: c.hex }} />
                  <span className="font-bold text-slate-700">{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={paw} onChange={(e) => setPaw(e.target.checked)} className="mt-1 w-5 h-5 accent-emerald-600" />
            <span>
              <span className="block font-bold text-slate-800">Put the Maisey Days paw in the middle</span>
              <span className="block text-sm text-slate-600">The code still scans fine, it just looks more like yours.</span>
            </span>
          </label>

          <div className="p-5 bg-amber-50 border-2 border-amber-200 rounded-2xl text-sm text-amber-950">
            <p className="font-bold text-amber-900 mb-2">Printing tips</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Keep the code at least 2.5cm wide. Bigger is better on posters people see from across a room.</li>
              <li>Always scan a test print with your phone before ordering a big batch.</li>
              <li>Keep the white border around the code and print on a light background.</li>
              <li>Print the sheets at actual size (100%), not "fit to page", so business cards come out at 85 x 55mm.</li>
              <li>If a printing company asks for artwork, send them the SVG. For Canva, Word or Facebook, use the PNG.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-5 rounded-3xl border-2 border-slate-100 bg-slate-50">
            <div className="bg-white rounded-2xl p-3 aspect-square flex items-center justify-center">
              {matrix ? (
                <img src={svgDataUrl(buildQrSvg(matrix, fg, paw, { caption: cleanCaption }))} alt={`QR code that opens ${url}`} className="w-full h-full object-contain" />
              ) : (
                <p className="text-sm text-slate-500 text-center px-6">{target === "custom" ? "Type a web address to see your QR code." : "Making your QR code..."}</p>
              )}
            </div>
            {urlOk && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Opens</p>
                <p className="text-sm text-slate-800 break-all">{url}</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={copyLink} className="flex-1 px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-sm font-bold text-slate-700 hover:border-slate-300">
                    Copy link
                  </button>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-3 py-2 rounded-xl bg-white border-2 border-slate-200 text-sm font-bold text-slate-700 hover:border-slate-300">
                    Test link
                  </a>
                </div>
              </div>
            )}
          </div>

          <div role="status" aria-live="polite" className="text-sm">
            {error && <p className="text-rose-700 font-bold">{error}</p>}
            {notice && <p className="text-emerald-700 font-bold">{notice}</p>}
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3">Download</h3>
            <div className="space-y-3">
              <button type="button" onClick={downloadPng} disabled={!png} className={`${btn} bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700`}>
                {matrix && !png ? "Getting it ready..." : appleMobile ? "Save picture (PNG)" : "Download PNG"}
                <span className="block text-sm font-medium text-emerald-50">{appleMobile ? "Save to Photos, or send by WhatsApp or AirDrop" : "For Canva, Word, Facebook and home printing"}</span>
              </button>
              <button type="button" onClick={downloadSvg} disabled={!matrix} className={`${btn} bg-white border-slate-200 text-slate-800 hover:border-slate-300`}>
                Download SVG
                <span className="block text-sm font-medium text-slate-600">For printing companies only. Phones can't open it in Photos or WhatsApp, so use the PNG for those.</span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Print ready sheets</h3>
            <p className="text-sm text-slate-600 mb-3">{appleMobile ? "Makes an A4 PDF. Then choose Print, Save to Files, or send it to a print shop." : "Opens an A4 PDF in a new tab, ready to print."}</p>
            <div className="space-y-3">
              {SHEETS.map((s) => (
                <button key={s.id} type="button" onClick={() => openSheet(s.id)} disabled={!matrix || making !== null} className={`${btn} bg-white border-slate-200 text-slate-800 hover:border-slate-300`}>
                  {making === s.id ? "Making the PDF..." : s.label}
                  <span className="block text-sm font-medium text-slate-600">{appleMobile && sheets[s.id] ? "Ready, tap to save or print" : s.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
