import React from "react";
import { ORAL_CARE_TERMS, ORAL_CARE_TERMS_INTRO } from "../constants";

/** The emmi®-pet oral hygiene terms, shown on the intake form and the online booking agreement. */
export const OralCareTerms: React.FC = () => (
  <div className="space-y-4">
    <p>{ORAL_CARE_TERMS_INTRO}</p>
    {ORAL_CARE_TERMS.map((section) => (
      <div key={section.heading}>
        <h4 className="font-black text-slate-800 mb-1">{section.heading}</h4>
        {section.intro && <p className="mb-1">{section.intro}</p>}
        <ul className={`space-y-1 ${section.intro ? "list-disc ml-5" : ""}`}>
          {section.points.map((point, i) => (
            <li key={i}>
              {point.label && <strong>{point.label}: </strong>}
              {point.text}
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

/** Same terms as plain HTML for the printable signed agreement. */
export const oralCareTermsHtml = () =>
  `<p>${ORAL_CARE_TERMS_INTRO}</p>` +
  ORAL_CARE_TERMS.map(
    (section) =>
      `<h3>${section.heading}</h3>${section.intro ? `<p>${section.intro}</p>` : ""}<ul>${section.points.map((p) => `<li>${p.label ? `<strong>${p.label}:</strong> ` : ""}${p.text}</li>`).join("")}</ul>`,
  ).join("");
