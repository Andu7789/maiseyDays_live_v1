// Draws a QR code as SVG from the module grid made by the qrcode package.

export type Matrix = { size: number; data: ArrayLike<number> };

export const QUIET = 4; // blank border (in modules) that scanners need around the code

export const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

// SVG of the code (with its quiet zone) in module units, optionally with a caption underneath.
export const buildQrSvg = (m: Matrix, fg: string, paw: boolean, extra: { caption?: string; attrs?: string } = {}) => {
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

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// The code alone as an image at an exact pixel size, ready to draw on a canvas.
export const loadQrImage = async (m: Matrix, fg: string, paw: boolean, px: number) => {
  const img = new Image();
  img.src = svgDataUrl(buildQrSvg(m, fg, paw, { attrs: `width="${px}" height="${px}"` }));
  await img.decode();
  return img;
};
