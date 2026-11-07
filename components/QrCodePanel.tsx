import React, { useEffect, useState } from "react";
import { LOCATIONS } from "../constants";

// QR codes for posters, business cards, flyers and stickers. Everything is built in the
// browser as vector SVG, so the downloads stay sharp at any print size.

const SITE_URL = "https://maiseydaysdoggrooming.co.uk/";
const BOOK_URL = `${SITE_URL}#book`;
const SITE_LABEL = "maiseydaysdoggrooming.co.uk";
const PHONE = LOCATIONS[0]?.phone ?? "07368 465966";
const QUIET = 4; // blank border (in modules) that scanners need around the code
const PNG_SIZE = 2048;

type Target = "book" | "home" | "review" | "custom";
type Matrix = { size: number; data: ArrayLike<number> };

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

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The paw from the app icon, drawn on a rounded square in the code's colour.
const pawBadge = (centre: number, side: number, fg: string) => {
  const s = side / 512;
  const x0 = centre - side / 2;
  const p = (v: number) => (x0 + v * s).toFixed(3);
  // White patch snapped to whole modules, so no half cut squares show around it.
  const lo = Math.floor(x0 - side * 0.1);
  const hi = Math.ceil(x0 + side + side * 0.1);
  const toes = [
    [138, 183, 50],
    [213, 128, 47],
    [303, 128, 47],
    [373, 183, 50],
  ]
    .map(([cx, cy, r]) => `<circle cx="${p(cx)}" cy="${p(cy)}" r="${(r * s).toFixed(3)}" fill="#fff"/>`)
    .join("");
  return (
    `<rect x="${lo}" y="${lo}" width="${hi - lo}" height="${hi - lo}" fill="#fff" shape-rendering="crispEdges"/>` +
    `<rect x="${x0.toFixed(3)}" y="${x0.toFixed(3)}" width="${side.toFixed(3)}" height="${side.toFixed(3)}" rx="${(side * 0.22).toFixed(3)}" fill="${fg}"/>` +
    toes +
    `<ellipse cx="${p(256)}" cy="${p(318)}" rx="${(113 * s).toFixed(3)}" ry="${(87 * s).toFixed(3)}" fill="#fff"/>`
  );
};

// SVG of just the code (with its quiet zone), in module units.
const buildQrSvg = (m: Matrix, fg: string, paw: boolean, extra: { caption?: string; attrs?: string } = {}) => {
  const dim = m.size + QUIET * 2;
  let d = "";
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.data[r * m.size + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.data[r * m.size + c]) c++;
      d += `M${start + QUIET} ${r + QUIET}h${c - start}v1h${start - c}z`;
    }
  }
  const caption = extra.caption?.trim() ?? "";
  const capH = caption ? dim * 0.15 : 0;
  // Shrink long captions so they fit the width of the code.
  const fontSize = Math.min(dim * 0.085, (dim * 0.92) / (caption.length * 0.56 || 1));
  const text = caption
    ? `<text x="${dim / 2}" y="${(dim + capH * 0.2).toFixed(3)}" font-family="Outfit, Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize.toFixed(3)}" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${escapeXml(caption)}</text>`
    : "";
  const h = dim + capH;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${h.toFixed(3)}" ${extra.attrs ?? ""}>` +
    `<rect width="${dim}" height="${h.toFixed(3)}" fill="#fff"/>` +
    `<path d="${d}" fill="${fg}" shape-rendering="crispEdges"/>` +
    (paw ? pawBadge(dim / 2, m.size * 0.22, fg) : "") +
    text +
    `</svg>`
  );
};

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const isAppleMobile = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Same fix as the Dog Grooming app: on an iPhone or iPad a downloaded file opens on a
// preview screen with no way to save a picture to Photos, so pictures go through the
// share sheet there instead (Save Image, WhatsApp, AirDrop). Safari only allows the share
// sheet straight after a tap, so callers must pass a ready made blob, never await first.
const saveFile = async (blob: Blob, filename: string) => {
  if (blob.type === "image/png" && isAppleMobile()) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Share refused, fall back to a normal download below.
      }
    }
  }
  downloadBlob(blob, filename);
};

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

// Draw the code onto a canvas, then add the caption with the site's own font.
const buildPng = async (m: Matrix, fg: string, paw: boolean, caption: string): Promise<Blob> => {
  const img = new Image();
  img.src = svgDataUrl(buildQrSvg(m, fg, paw, { attrs: `width="${PNG_SIZE}" height="${PNG_SIZE}"` }));
  await img.decode();
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

const printPage = (title: string, css: string, body: string) => {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeXml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
html, body { margin: 0; background: #fff; }
body { font-family: Outfit, Arial, Helvetica, sans-serif; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { width: 210mm; height: 297mm; box-sizing: border-box; overflow: hidden; }
svg { display: block; }
@media screen { body { background: #e2e8f0; } .sheet { background: #fff; margin: 12px auto; box-shadow: 0 2px 12px rgba(0,0,0,.15); } }
.bar { position: sticky; top: 0; display: flex; justify-content: center; padding: 12px; background: #0f172a; }
.bar button { font: 700 16px Outfit, Arial, sans-serif; padding: 12px 28px; border: 0; border-radius: 999px; background: #059669; color: #fff; cursor: pointer; }
@media print { .bar { display: none; } }
${css}
</style></head><body><div class="bar"><button type="button" onclick="window.print()">Print or save as PDF</button></div>${body}
<script>window.addEventListener("load", function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 250); }); });</script>
</body></html>`);
  w.document.close();
  return true;
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
  useEffect(() => {
    setPng(null);
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
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const chooseTarget = (t: Target) => {
    // Swap the caption too, unless Rachel has written her own.
    if (TARGETS.some((x) => x.caption === caption) || !caption.trim()) setCaption(TARGETS.find((x) => x.id === t)?.caption ?? "");
    setTarget(t);
  };

  const downloadPng = () => {
    if (png) void saveFile(png, `${fileBase}.png`);
  };

  const downloadSvg = () => {
    if (!matrix) return;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${buildQrSvg(matrix, fg, paw, { caption: cleanCaption })}`;
    void saveFile(new Blob([svg], { type: "image/svg+xml" }), `${fileBase}.svg`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
    } catch {
      setNotice("Couldn't copy, select the link and copy it by hand");
    }
  };

  const openPrint = (kind: "poster" | "cards" | "stickers") => {
    if (!matrix) return;
    const qr = buildQrSvg(matrix, fg, paw);
    const cap = escapeXml(cleanCaption);
    let ok = false;
    if (kind === "poster") {
      ok = printPage(
        "Maisey Days QR poster",
        `.poster { padding: 24mm 18mm 20mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }
.brand { font-size: 30pt; font-weight: 800; color: ${fg}; line-height: 1.1; }
.tag { font-size: 14pt; font-weight: 600; color: #475569; letter-spacing: .25em; text-transform: uppercase; margin-top: 3mm; }
.headline { font-size: 38pt; font-weight: 800; line-height: 1.1; max-width: 170mm; }
.qr svg { width: 125mm; height: 125mm; }
.hint { font-size: 14pt; color: #475569; margin-top: 4mm; }
.contact { font-size: 16pt; font-weight: 600; line-height: 1.6; }`,
        `<div class="sheet poster">
  <div><div class="brand">Maisey Days</div><div class="tag">Dog Grooming</div></div>
  ${cap ? `<div class="headline">${cap}</div>` : ""}
  <div><div class="qr">${qr}</div><div class="hint">Point your phone camera at the code</div></div>
  <div class="contact">${escapeXml(PHONE)}<br>${SITE_LABEL}</div>
</div>`,
      );
    } else if (kind === "cards") {
      const card = `<div class="card"><div class="qr">${qr}</div><div class="info"><div class="brand">Maisey Days</div><div class="tag">Dog Grooming</div>${cap ? `<div class="cap">${cap}</div>` : ""}<div class="line">${escapeXml(PHONE)}</div><div class="line site">${SITE_LABEL}</div></div></div>`;
      ok = printPage(
        "Maisey Days QR business cards",
        `.cards { padding: 11mm 20mm; display: grid; grid-template-columns: 85mm 85mm; grid-auto-rows: 55mm; }
.card { box-sizing: border-box; border: 0.2mm dashed #cbd5e1; display: flex; align-items: center; gap: 3mm; padding: 4mm; overflow: hidden; }
.card .qr svg { width: 36mm; height: 36mm; }
.info { min-width: 0; }
.brand { font-size: 15pt; font-weight: 800; color: ${fg}; line-height: 1; }
.tag { font-size: 6.5pt; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: #475569; margin: 1.2mm 0 3mm; }
.cap { font-size: 8pt; font-weight: 600; margin-bottom: 2.5mm; line-height: 1.2; }
.line { font-size: 8pt; line-height: 1.45; }
.site { font-size: 6.5pt; }`,
        `<div class="sheet cards">${card.repeat(10)}</div>`,
      );
    } else {
      const sticker = `<div class="sticker"><div class="qr">${qr}</div>${cap ? `<div class="cap">${cap}</div>` : ""}</div>`;
      ok = printPage(
        "Maisey Days QR stickers",
        `.stickers { padding: 12.5mm 15mm; display: grid; grid-template-columns: repeat(3, 60mm); grid-auto-rows: 68mm; }
.sticker { box-sizing: border-box; border: 0.2mm dashed #cbd5e1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm; padding: 3mm; text-align: center; }
.sticker .qr svg { width: 48mm; height: 48mm; }
.cap { font-size: 9pt; font-weight: 700; color: ${fg}; line-height: 1.2; }`,
        `<div class="sheet stickers">${sticker.repeat(12)}</div>`,
      );
    }
    if (!ok) setError("Your browser blocked the print window. Allow pop ups for this site and try again.");
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
            <p className="text-sm text-slate-600 mb-3">Opens an A4 page ready to print or save as PDF.</p>
            <div className="space-y-3">
              <button type="button" onClick={() => openPrint("poster")} disabled={!matrix} className={`${btn} bg-white border-slate-200 text-slate-800 hover:border-slate-300`}>
                A4 poster
                <span className="block text-sm font-medium text-slate-600">For the window, noticeboards and vets</span>
              </button>
              <button type="button" onClick={() => openPrint("cards")} disabled={!matrix} className={`${btn} bg-white border-slate-200 text-slate-800 hover:border-slate-300`}>
                Business cards
                <span className="block text-sm font-medium text-slate-600">10 per sheet with cutting lines, standard 85 x 55mm</span>
              </button>
              <button type="button" onClick={() => openPrint("stickers")} disabled={!matrix} className={`${btn} bg-white border-slate-200 text-slate-800 hover:border-slate-300`}>
                Stickers and labels
                <span className="block text-sm font-medium text-slate-600">12 per sheet, 5cm codes for leads, bags and flyers</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
