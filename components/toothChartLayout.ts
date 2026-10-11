// Layout for the dog tooth diagram, laid out like Rachel's paper chart (modified Triadan numbering):
// 1xx upper right, 2xx upper left, 3xx lower left, 4xx lower right.
// Coordinates are in SVG units of the chart's viewBox.

export type ToothKind = "incisor" | "canine" | "premolar" | "molar";

export interface ToothShape {
  id: string;
  kind: ToothKind;
  x: number;
  y: number;
  rx: number;
  ry: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "end";
}

export const TOOTH_CHART_VIEWBOX = "380 300 700 1560";

export const toothKind = (id: string): ToothKind => {
  const n = Number(id) % 100;
  if (n <= 3) return "incisor";
  if (n === 4) return "canine";
  if (n <= 8) return "premolar";
  return "molar";
};

export const TOOTH_FILL: Record<ToothKind, string> = {
  incisor: "#7cc4f0",
  canine: "#8cc63f",
  premolar: "#e87a6e",
  molar: "#9a9a9a",
};

const size = (id: string): [number, number] => {
  if (id === "108" || id === "208") return [30, 38];
  if (id === "109" || id === "209" || id === "309" || id === "409") return [30, 44];
  if (id === "110" || id === "210" || id === "310" || id === "410") return [20, 24];
  if (id === "311" || id === "411") return [14, 18];
  const kind = toothKind(id);
  if (kind === "incisor") return [17, 24];
  if (kind === "canine") return [26, 44];
  return [16, 24];
};

// id, tooth centre, label position
const RAW: [string, number, number, number, number, "start" | "end"][] = [
  // upper jaw, dog's right (left of the picture)
  ["101", 712, 392, 648, 338, "end"],
  ["102", 688, 404, 630, 366, "end"],
  ["103", 663, 425, 606, 394, "end"],
  ["104", 628, 458, 557, 466, "end"],
  ["105", 612, 553, 537, 552, "end"],
  ["106", 600, 617, 523, 612, "end"],
  ["107", 575, 690, 498, 682, "end"],
  ["108", 540, 775, 459, 768, "end"],
  ["109", 520, 878, 440, 871, "end"],
  ["110", 525, 950, 445, 944, "end"],
  // upper jaw, dog's left
  ["201", 745, 392, 812, 331, "start"],
  ["202", 770, 405, 832, 366, "start"],
  ["203", 790, 430, 848, 396, "start"],
  ["204", 830, 468, 895, 476, "start"],
  ["205", 835, 565, 905, 566, "start"],
  ["206", 850, 630, 915, 628, "start"],
  ["207", 880, 700, 944, 697, "start"],
  ["208", 915, 778, 983, 777, "start"],
  ["209", 925, 880, 997, 874, "start"],
  ["210", 925, 950, 1002, 943, "start"],
  // lower jaw, dog's left
  ["301", 738, 1728, 834, 1803, "start"],
  ["302", 772, 1700, 864, 1755, "start"],
  ["303", 795, 1665, 886, 1704, "start"],
  ["304", 840, 1590, 905, 1586, "start"],
  ["305", 835, 1515, 913, 1514, "start"],
  ["306", 850, 1465, 928, 1463, "start"],
  ["307", 865, 1400, 945, 1405, "start"],
  ["308", 885, 1320, 965, 1323, "start"],
  ["309", 915, 1205, 995, 1209, "start"],
  ["310", 918, 1110, 1000, 1112, "start"],
  ["311", 920, 1058, 1000, 1058, "start"],
  // lower jaw, dog's right
  ["401", 695, 1728, 590, 1808, "end"],
  ["402", 665, 1700, 562, 1762, "end"],
  ["403", 643, 1665, 545, 1712, "end"],
  ["404", 600, 1590, 497, 1590, "end"],
  ["405", 603, 1512, 513, 1515, "end"],
  ["406", 590, 1465, 503, 1463, "end"],
  ["407", 575, 1400, 486, 1403, "end"],
  ["408", 553, 1320, 462, 1322, "end"],
  ["409", 530, 1205, 445, 1207, "end"],
  ["410", 527, 1112, 452, 1113, "end"],
  ["411", 528, 1058, 455, 1059, "end"],
];

export const TOOTH_SHAPES: ToothShape[] = RAW.map(([id, x, y, labelX, labelY, anchor]) => {
  const [rx, ry] = size(id);
  return { id, kind: toothKind(id), x, y, rx, ry, labelX, labelY, anchor };
});

export const ALL_TEETH = TOOTH_SHAPES.map((t) => t.id).sort();
