import { Matrix, loadQrImage } from "./qrArt";

// Print ready A4 sheets as PDF files. Each page is drawn on a 300dpi canvas in the
// site's Outfit font, then wrapped in a one page PDF at the exact A4 size, so posters,
// business cards and stickers come out at their real measurements. A PDF (rather than
// a print window) is what works on an iPhone home screen app, where pop up windows and
// printing from a page are unreliable: the share sheet there offers Print and Save to Files.

export type SheetKind = "poster" | "cards" | "stickers";

const MM = 300 / 25.4; // canvas pixels per millimetre
const PT = 0.3528 * MM; // canvas pixels per typographic point
const A4_W = Math.round(210 * MM);
const A4_H = Math.round(297 * MM);
const INK = "#0f172a";
const MUTED = "#475569";
const CUT_LINE = "#cbd5e1";

type Brand = { fg: string; paw: boolean; caption: string; phone: string; site: string };

const font = (weight: number, px: number) => `${weight} ${px}px Outfit, Arial, Helvetica, sans-serif`;

const ensureFonts = async () => {
  try {
    await Promise.all([400, 600, 700, 900].map((w) => document.fonts.load(font(w, 40))));
  } catch {
    // Falls back to Arial, still fine to print.
  }
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(next).width <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

// Set a font, shrinking it until the text fits the width.
const fitFont = (ctx: CanvasRenderingContext2D, text: string, weight: number, px: number, maxWidth: number) => {
  ctx.font = font(weight, px);
  while (ctx.measureText(text).width > maxWidth && px > 8) {
    px -= 2;
    ctx.font = font(weight, px);
  }
  return px;
};

// Letter spaced text (canvas letterSpacing isn't in every Safari yet).
const drawSpaced = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "center") => {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((ch, i) => {
    ctx.fillText(ch, cx, y);
    cx += widths[i] + spacing;
  });
  ctx.textAlign = prev;
};

const cutBox = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  ctx.save();
  ctx.strokeStyle = CUT_LINE;
  ctx.lineWidth = 0.2 * MM;
  ctx.setLineDash([1 * MM, 0.8 * MM]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
};

const drawPoster = (ctx: CanvasRenderingContext2D, qr: HTMLImageElement, b: Brand) => {
  const cx = A4_W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = b.fg;
  ctx.font = font(900, 30 * PT);
  ctx.fillText("Maisey Days", cx, 40 * MM);
  ctx.fillStyle = MUTED;
  ctx.font = font(600, 14 * PT);
  drawSpaced(ctx, "DOG GROOMING", cx, 50 * MM, 14 * PT * 0.25, "center");

  if (b.caption) {
    ctx.fillStyle = INK;
    ctx.font = font(900, 38 * PT);
    let y = 82 * MM;
    for (const line of wrapLines(ctx, b.caption, 170 * MM).slice(0, 2)) {
      ctx.fillText(line, cx, y);
      y += 38 * PT * 1.1;
    }
  }

  const size = 125 * MM;
  ctx.drawImage(qr, cx - size / 2, 105 * MM, size, size);
  ctx.fillStyle = MUTED;
  ctx.font = font(400, 14 * PT);
  ctx.fillText("Point your phone camera at the code", cx, 241 * MM);
  ctx.fillStyle = INK;
  ctx.font = font(600, 16 * PT);
  ctx.fillText(b.phone, cx, 263 * MM);
  ctx.fillText(b.site, cx, 271 * MM);
};

const drawCards = (ctx: CanvasRenderingContext2D, qr: HTMLImageElement, b: Brand) => {
  const cardW = 85 * MM;
  const cardH = 55 * MM;
  const qrSize = 36 * MM;
  const textW = 38 * MM;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Lay the text block out once, then centre it on every card.
  ctx.font = font(700, 8 * PT);
  const capLines = b.caption ? wrapLines(ctx, b.caption, textW).slice(0, 2) : [];
  const brandPx = fitFont(ctx, "Maisey Days", 900, 15 * PT, textW);
  const sitePx = fitFont(ctx, b.site, 400, 6.5 * PT, textW);
  const blockH = brandPx * 1.05 + 1.2 * MM + 6.5 * PT + 3 * MM + (capLines.length ? capLines.length * 8 * PT * 1.25 + 2 * MM : 0) + 8 * PT * 1.45 + sitePx;

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 2; col++) {
      const x = 20 * MM + col * cardW;
      const y = 11 * MM + row * cardH;
      cutBox(ctx, x, y, cardW, cardH);
      ctx.drawImage(qr, x + 4 * MM, y + (cardH - qrSize) / 2, qrSize, qrSize);

      const tx = x + 43 * MM;
      let ty = y + (cardH - blockH) / 2;
      ctx.fillStyle = b.fg;
      ctx.font = font(900, brandPx);
      ctx.fillText("Maisey Days", tx, ty);
      ty += brandPx * 1.05 + 1.2 * MM;
      ctx.fillStyle = MUTED;
      ctx.font = font(600, 6.5 * PT);
      drawSpaced(ctx, "DOG GROOMING", tx, ty, 6.5 * PT * 0.2, "left");
      ty += 6.5 * PT + 3 * MM;
      ctx.fillStyle = INK;
      if (capLines.length) {
        ctx.font = font(700, 8 * PT);
        for (const line of capLines) {
          ctx.fillText(line, tx, ty);
          ty += 8 * PT * 1.25;
        }
        ty += 2 * MM;
      }
      ctx.font = font(400, 8 * PT);
      ctx.fillText(b.phone, tx, ty);
      ty += 8 * PT * 1.45;
      ctx.font = font(400, sitePx);
      ctx.fillText(b.site, tx, ty);
    }
  }
};

const drawStickers = (ctx: CanvasRenderingContext2D, qr: HTMLImageElement, b: Brand) => {
  const cellW = 60 * MM;
  const cellH = 68 * MM;
  const qrSize = 48 * MM;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.font = font(700, 9 * PT);
  const capLines = b.caption ? wrapLines(ctx, b.caption, 54 * MM).slice(0, 2) : [];
  const capH = capLines.length ? 1 * MM + capLines.length * 9 * PT * 1.2 : 0;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 15 * MM + col * cellW;
      const y = 12.5 * MM + row * cellH;
      cutBox(ctx, x, y, cellW, cellH);
      const top = y + (cellH - qrSize - capH) / 2;
      ctx.drawImage(qr, x + (cellW - qrSize) / 2, top, qrSize, qrSize);
      ctx.fillStyle = b.fg;
      let ty = top + qrSize + 1 * MM;
      for (const line of capLines) {
        ctx.fillText(line, x + cellW / 2, ty);
        ty += 9 * PT * 1.2;
      }
    }
  }
};

// A one page A4 PDF holding a single full page JPEG.
const jpegToPdf = (jpeg: Uint8Array, pxW: number, pxH: number): Blob => {
  const enc = new TextEncoder();
  const W = 595.28;
  const H = 841.89;
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: string | Uint8Array) => {
    const bytes = typeof p === "string" ? enc.encode(p) : p;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsets[n]).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
};

export const buildSheetPdf = async (kind: SheetKind, m: Matrix, brand: Brand): Promise<Blob> => {
  await ensureFonts();
  const qrPx = Math.round((kind === "poster" ? 125 : kind === "cards" ? 36 : 48) * MM);
  const qr = await loadQrImage(m, brand.fg, brand.paw, qrPx).catch(() => null);
  const canvas = document.createElement("canvas");
  canvas.width = A4_W;
  canvas.height = A4_H;
  const ctx = canvas.getContext("2d");
  if (!ctx || !qr) throw new Error("Canvas not supported");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, A4_W, A4_H);
  ctx.imageSmoothingEnabled = false;
  if (kind === "poster") drawPoster(ctx, qr, brand);
  else if (kind === "cards") drawCards(ctx, qr, brand);
  else drawStickers(ctx, qr, brand);
  const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG export failed"))), "image/jpeg", 0.92));
  canvas.width = canvas.height = 0; // free the big canvas straight away on phones
  return jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), A4_W, A4_H);
};
