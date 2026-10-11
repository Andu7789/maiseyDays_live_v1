import React from "react";
import { TOOTH_CHART_VIEWBOX, TOOTH_FILL, TOOTH_SHAPES } from "./toothChartLayout";

interface Props {
  selected: string | null;
  /** Findings per tooth, e.g. { "108": ["Fractured"] }. Teeth in here are outlined. */
  findings: Record<string, string[]>;
  onSelect: (tooth: string) => void;
}

const GONE = new Set(["Missing", "Extracted"]);

/** Clickable dog tooth diagram. Colours match the paper chart: incisors blue, canines green, premolars red, molars grey. */
export const ToothChart: React.FC<Props> = ({ selected, findings, onSelect }) => (
  <svg viewBox={TOOTH_CHART_VIEWBOX} className="w-full max-w-sm mx-auto select-none" role="group" aria-label="Dog tooth chart">
    <text x="720" y="760" textAnchor="middle" fontSize="34" fontWeight="700" fill="#64748b">
      Upper Jaw
    </text>
    <text x="720" y="1290" textAnchor="middle" fontSize="34" fontWeight="700" fill="#64748b">
      Lower Jaw
    </text>
    {TOOTH_SHAPES.map((tooth) => {
      const found = findings[tooth.id] || [];
      const gone = found.length > 0 && found.every((f) => GONE.has(f));
      const flagged = found.length > 0 && !gone;
      const isSelected = selected === tooth.id;
      const label = `Tooth ${tooth.id}${found.length ? `: ${found.join(", ")}` : ""}`;
      return (
        <g
          key={tooth.id}
          role="button"
          tabIndex={0}
          aria-label={label}
          aria-pressed={isSelected}
          onClick={() => onSelect(tooth.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect(tooth.id);
            }
          }}
          className="cursor-pointer outline-none focus-visible:[&_ellipse]:stroke-emerald-600"
        >
          <title>{label}</title>
          <line x1={tooth.labelX + (tooth.anchor === "end" ? 6 : -6)} y1={tooth.labelY - 8} x2={tooth.x} y2={tooth.y} stroke="#e87a6e" strokeWidth="3" opacity="0.7" />
          {/* generous invisible hit area so small teeth are easy to tap */}
          <circle cx={tooth.x} cy={tooth.y} r={Math.max(tooth.rx, tooth.ry) + 10} fill="transparent" />
          <ellipse
            cx={tooth.x}
            cy={tooth.y}
            rx={tooth.rx}
            ry={tooth.ry}
            fill={gone ? "#ffffff" : TOOTH_FILL[tooth.kind]}
            fillOpacity={gone ? 1 : 0.9}
            stroke={isSelected ? "#059669" : flagged ? "#b91c1c" : gone ? "#64748b" : "#475569"}
            strokeWidth={isSelected ? 9 : flagged ? 8 : 3}
            strokeDasharray={gone ? "8 6" : undefined}
          />
          {flagged && <circle cx={tooth.x + tooth.rx * 0.7} cy={tooth.y - tooth.ry * 0.7} r="11" fill="#b91c1c" stroke="#ffffff" strokeWidth="3" />}
          <text x={tooth.labelX} y={tooth.labelY} textAnchor={tooth.anchor} fontSize="30" fontWeight={isSelected || found.length ? 800 : 600} fill={isSelected ? "#047857" : found.length ? "#b91c1c" : "#334155"}>
            {tooth.id}
          </text>
        </g>
      );
    })}
  </svg>
);
