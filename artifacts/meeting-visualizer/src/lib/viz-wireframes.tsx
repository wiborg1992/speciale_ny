/**
 * Wireframe SVG-thumbnails til retningskort-dialog.
 * Skematiske, grå-på-mørk, håndtegnet-agtige — ikke rigtige visualiseringer.
 * Ét SVG pr. VizFamily.
 */

import React from "react";

export type VizFamilyId =
  | "hmi_interface"
  | "user_journey"
  | "workflow_process"
  | "physical_product"
  | "requirements_matrix"
  | "management_summary"
  | "engagement_analytics"
  | "persona_research"
  | "service_blueprint"
  | "comparison_evaluation"
  | "design_system"
  | "ux_prototype"
  | "generic";

interface WireframeProps {
  className?: string;
}

const STROKE = "#6b7280";
const STROKE_LIGHT = "#4b5563";
const FILL_BOX = "#1f2937";
const FILL_DARK = "#111827";

export function HmiWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="8" y="8" width="44" height="28" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="58" y="8" width="44" height="28" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="108" y="8" width="44" height="28" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="14" y="14" width="22" height="4" rx="1" stroke={STROKE} strokeWidth="0.6" fill={STROKE_LIGHT} />
      <rect x="14" y="22" width="12" height="8" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <rect x="30" y="22" width="12" height="8" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <rect x="64" y="12" width="16" height="8" rx="8" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="84" y="14" width="12" height="4" rx="1" stroke={STROKE} strokeWidth="0.6" fill={STROKE_LIGHT} />
      <rect x="114" y="12" width="8" height="8" rx="4" stroke="#16a34a" strokeWidth="0.8" fill="#14532d" />
      <rect x="126" y="12" width="8" height="8" rx="4" stroke="#b45309" strokeWidth="0.8" fill="#451a03" />
      <rect x="138" y="12" width="8" height="8" rx="4" stroke="#dc2626" strokeWidth="0.8" fill="#450a0a" />
      <rect x="8" y="42" width="92" height="24" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="8" y1="50" x2="100" y2="50" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <rect x="12" y="53" width="14" height="10" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="30" y="55" width="14" height="8" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="48" y="51" width="14" height="12" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="66" y="56" width="14" height="7" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="106" y="42" width="46" height="52" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="110" y="46" width="38" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="110" y="54" width="38" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="110" y="62" width="38" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="110" y="70" width="24" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="8" y="72" width="92" height="22" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="30" y1="72" x2="30" y2="94" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="52" y1="72" x2="52" y2="94" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="74" y1="72" x2="74" y2="94" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <rect x="12" y="76" width="12" height="14" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="34" y="80" width="12" height="10" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
    </svg>
  );
}

export function JourneyWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="2" y="2" width="28" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="0.7" fill={FILL_BOX} />
      <line x1="30" y1="2" x2="30" y2="98" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="2" y1="22" x2="158" y2="22" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="2" y1="42" x2="158" y2="42" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="2" y1="62" x2="158" y2="62" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="2" y1="82" x2="158" y2="82" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <rect x="5" y="6" width="22" height="12" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="5" y="26" width="22" height="12" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="5" y="46" width="22" height="12" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="5" y="66" width="22" height="12" rx="0.5" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <line x1="62" y1="22" x2="62" y2="82" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="95" y1="22" x2="95" y2="82" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="128" y1="22" x2="128" y2="82" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <rect x="34" y="6" width="24" height="12" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <rect x="67" y="6" width="24" height="12" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <rect x="100" y="6" width="24" height="12" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <rect x="133" y="6" width="22" height="12" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <rect x="34" y="25" width="24" height="14" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="67" y="25" width="24" height="14" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="100" y="25" width="24" height="14" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="133" y="25" width="22" height="14" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <polyline points="46,62 79,52 112,68 145,56" stroke={STROKE} strokeWidth="1" fill="none" strokeDasharray="2 1" />
      <circle cx="46" cy="62" r="2.5" stroke={STROKE} strokeWidth="0.7" fill={FILL_DARK} />
      <circle cx="79" cy="52" r="2.5" stroke={STROKE} strokeWidth="0.7" fill={FILL_DARK} />
      <circle cx="112" cy="68" r="2.5" stroke={STROKE} strokeWidth="0.7" fill={FILL_DARK} />
      <circle cx="145" cy="56" r="2.5" stroke={STROKE} strokeWidth="0.7" fill={FILL_DARK} />
      <rect x="34" y="65" width="24" height="12" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="67" y="65" width="24" height="12" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="100" y="65" width="24" height="12" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="133" y="65" width="22" height="12" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
    </svg>
  );
}

export function WorkflowWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="14" y="8" width="28" height="16" rx="8" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="42" y1="16" x2="54" y2="16" stroke={STROKE} strokeWidth="0.8" markerEnd="url(#arr)" />
      <rect x="54" y="8" width="28" height="16" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="82" y1="16" x2="94" y2="16" stroke={STROKE} strokeWidth="0.8" />
      <polygon points="94,12 108,16 94,20" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <line x1="108" y1="16" x2="118" y2="16" stroke={STROKE} strokeWidth="0.8" />
      <rect x="118" y="8" width="28" height="16" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="101" y1="20" x2="101" y2="38" stroke={STROKE} strokeWidth="0.7" strokeDasharray="2 1" />
      <rect x="72" y="38" width="28" height="16" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="86" y1="38" x2="86" y2="30" stroke={STROKE} strokeWidth="0.7" />
      <line x1="86" y1="30" x2="101" y2="30" stroke={STROKE} strokeWidth="0.7" />
      <line x1="86" y1="54" x2="86" y2="62" stroke={STROKE} strokeWidth="0.7" />
      <rect x="54" y="62" width="28" height="16" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="68" y1="62" x2="68" y2="54" stroke={STROKE} strokeWidth="0.7" />
      <line x1="68" y1="54" x2="86" y2="54" stroke={STROKE} strokeWidth="0.7" />
      <line x1="82" y1="70" x2="40" y2="70" stroke={STROKE} strokeWidth="0.7" />
      <rect x="12" y="62" width="28" height="16" rx="8" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="40" y1="70" x2="26" y2="70" stroke={STROKE} strokeWidth="0.7" />
      <line x1="118" y1="16" x2="146" y2="16" stroke={STROKE} strokeWidth="0.7" />
      <rect x="120" y="56" width="28" height="16" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="132" y1="24" x2="132" y2="56" stroke={STROKE} strokeWidth="0.7" strokeDasharray="2 1" />
      <line x1="101" y1="38" x2="132" y2="38" stroke={STROKE} strokeWidth="0.7" strokeDasharray="2 1" />
      <line x1="132" y1="38" x2="132" y2="56" stroke={STROKE} strokeWidth="0.7" />
      <rect x="8" y="84" width="144" height="8" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      <rect x="10" y="86" width="40" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.4" fill={FILL_DARK} />
    </svg>
  );
}

export function ProductWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <ellipse cx="68" cy="52" rx="40" ry="42" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <ellipse cx="68" cy="52" rx="26" ry="28" stroke={STROKE_LIGHT} strokeWidth="0.6" fill={FILL_DARK} />
      <ellipse cx="68" cy="52" rx="10" ry="10" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <line x1="108" y1="18" x2="90" y2="30" stroke={STROKE} strokeWidth="0.6" strokeDasharray="2 1" />
      <line x1="118" y1="40" x2="96" y2="46" stroke={STROKE} strokeWidth="0.6" strokeDasharray="2 1" />
      <line x1="116" y1="60" x2="96" y2="58" stroke={STROKE} strokeWidth="0.6" strokeDasharray="2 1" />
      <line x1="108" y1="80" x2="92" y2="70" stroke={STROKE} strokeWidth="0.6" strokeDasharray="2 1" />
      <rect x="108" y="10" width="44" height="12" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="110" y="13" width="28" height="3" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="110" y="18" width="20" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="110" y="32" width="44" height="12" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="112" y="35" width="28" height="3" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="112" y="40" width="20" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="110" y="54" width="44" height="12" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="112" y="57" width="28" height="3" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="112" y="62" width="20" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="108" y="76" width="44" height="12" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="110" y="79" width="28" height="3" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="110" y="84" width="20" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
    </svg>
  );
}

export function RequirementsWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="148" height="14" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <line x1="40" y1="6" x2="40" y2="94" stroke={STROKE} strokeWidth="0.6" />
      <line x1="80" y1="6" x2="80" y2="94" stroke={STROKE} strokeWidth="0.6" />
      <line x1="106" y1="6" x2="106" y2="94" stroke={STROKE} strokeWidth="0.6" />
      <line x1="128" y1="6" x2="128" y2="94" stroke={STROKE} strokeWidth="0.6" />
      <line x1="6" y1="20" x2="154" y2="20" stroke={STROKE} strokeWidth="0.6" />
      <line x1="6" y1="34" x2="154" y2="34" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <line x1="6" y1="48" x2="154" y2="48" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <line x1="6" y1="62" x2="154" y2="62" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <line x1="6" y1="76" x2="154" y2="76" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <rect x="8" y="9" width="28" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="44" y="9" width="32" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="84" y="9" width="18" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="109" y="9" width="14" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="131" y="9" width="18" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      {[22, 36, 50, 64, 78].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="28" height="9" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.4" />
          <rect x="44" y={y} width="32" height="9" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.4" />
          <rect x="84" y={y + 2} width="10" height="5" rx="2.5" fill={i % 3 === 0 ? "#16a34a" : i % 3 === 1 ? "#b45309" : "#1d4ed8"} fillOpacity="0.7" />
          <rect x="109" y={y + 2} width="14" height="5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.4" />
          <rect x="131" y={y + 2} width="18" height="5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.4" />
        </g>
      ))}
    </svg>
  );
}

export function ManagementWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="36" height="30" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="46" y="6" width="36" height="30" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="86" y="6" width="36" height="30" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="126" y="6" width="28" height="30" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="10" y="10" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="10" y="18" width="28" height="10" rx="0.5" stroke={STROKE} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="50" y="10" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="50" y="18" width="28" height="10" rx="0.5" stroke={STROKE} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="90" y="10" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="90" y="18" width="28" height="10" rx="0.5" stroke={STROKE} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="130" y="10" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="130" y="18" width="20" height="10" rx="0.5" stroke={STROKE} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="6" y="42" width="74" height="52" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="6" y1="52" x2="80" y2="52" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <rect x="10" y="56" width="8" height="32" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill="#1d4ed8" fillOpacity="0.5" />
      <rect x="22" y="62" width="8" height="26" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill="#16a34a" fillOpacity="0.5" />
      <rect x="34" y="48" width="8" height="40" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill="#1d4ed8" fillOpacity="0.5" />
      <rect x="46" y="58" width="8" height="30" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill="#16a34a" fillOpacity="0.5" />
      <rect x="58" y="52" width="8" height="36" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill="#1d4ed8" fillOpacity="0.5" />
      <rect x="86" y="42" width="68" height="52" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <line x1="86" y1="52" x2="154" y2="52" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      {[56, 64, 72, 80, 88].map((y, i) => (
        <g key={i}>
          <rect x="90" y={y} width="24" height="5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
          <rect x="118" y={y + 1} width={16 + i * 2} height="3" rx="1" fill={STROKE_LIGHT} fillOpacity="0.6" />
        </g>
      ))}
    </svg>
  );
}

export function EngagementWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="148" height="16" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="10" y="10" width="40" height="4" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="90" y="10" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="114" y="10" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="6" y="26" width="96" height="66" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <polyline points="14,82 26,68 38,72 50,58 62,62 74,48 86,52 98,38" stroke={STROKE} strokeWidth="1" fill="none" />
      <polyline points="14,86 26,80 38,76 50,72 62,70 74,66 86,68 98,58" stroke={STROKE_LIGHT} strokeWidth="0.7" fill="none" strokeDasharray="3 2" />
      <line x1="6" y1="92" x2="102" y2="92" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      <line x1="14" y1="26" x2="14" y2="92" stroke={STROKE_LIGHT} strokeWidth="0.5" />
      {[26, 50, 74, 98].map((x, i) => (
        <rect key={i} x={x - 2} y={88} width="4" height="4" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.5" />
      ))}
      <rect x="106" y="26" width="48" height="16" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="110" y="29" width="18" height="3" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="110" y="34" width="28" height="6" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="106" y="46" width="48" height="16" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="110" y="49" width="18" height="3" rx="0.5" fill={STROKE_LIGHT} />
      <rect x="110" y="54" width="36" height="6" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="106" y="66" width="48" height="26" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      {[70, 76, 82].map((y, i) => (
        <g key={i}>
          <rect x="110" y={y} width="18" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
          <rect x="132" y={y} width={10 + i * 4} height="3" rx="1" fill={STROKE_LIGHT} fillOpacity="0.5" />
        </g>
      ))}
    </svg>
  );
}

export function PersonaWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="44" height="88" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <circle cx="28" cy="22" r="12" stroke={STROKE} strokeWidth="0.8" fill={FILL_DARK} />
      <circle cx="28" cy="18" r="5" stroke={STROKE} strokeWidth="0.6" fill={FILL_BOX} />
      <path d="M 18 28 Q 28 24 38 28" stroke={STROKE} strokeWidth="0.6" fill="none" />
      <rect x="10" y="38" width="36" height="4" rx="0.5" fill={STROKE} fillOpacity="0.8" />
      <rect x="14" y="44" width="28" height="3" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.6" />
      <rect x="10" y="52" width="36" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="10" y="56" width="36" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="10" y="60" width="28" height="2" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      {["●", "●", "●"].map((_, i) => (
        <g key={i}>
          <circle cx="12" cy={70 + i * 8} r="2" stroke={STROKE} strokeWidth="0.5" fill={FILL_DARK} />
          <rect x="16" y={68 + i * 8} width="28" height="4" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
        </g>
      ))}
      <rect x="54" y="6" width="102" height="40" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="58" y="10" width="30" height="4" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="58" y="17" width="90" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="58" y="21" width="90" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="58" y="25" width="74" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="58" y="32" width="20" height="4" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.7" />
      <rect x="82" y="33" width="60" height="3" rx="1.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="82" y="33" width="42" height="3" rx="1.5" fill={STROKE_LIGHT} fillOpacity="0.4" />
      <rect x="54" y="50" width="50" height="44" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="58" y="54" width="22" height="4" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      {[62, 68, 74, 80, 86].map((y, i) => (
        <g key={i}>
          <circle cx="61" cy={y + 2} r="1.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill="none" />
          <rect x="65" y={y} width="34" height="4" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
        </g>
      ))}
      <rect x="108" y="50" width="48" height="44" rx="2" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="112" y="54" width="22" height="4" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="112" y="62" width="40" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="112" y="67" width="40" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="112" y="72" width="32" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="112" y="80" width="40" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="112" y="85" width="28" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
    </svg>
  );
}

export function BlueprintWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="2" y="2" width="24" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="0.7" fill={FILL_BOX} />
      <line x1="26" y1="2" x2="26" y2="98" stroke={STROKE} strokeWidth="0.6" />
      <line x1="2" y1="26" x2="158" y2="26" stroke={STROKE} strokeWidth="0.7" />
      <line x1="2" y1="50" x2="158" y2="50" stroke={STROKE} strokeWidth="0.7" />
      <line x1="2" y1="74" x2="158" y2="74" stroke={STROKE} strokeWidth="0.7" />
      <line x1="60" y1="2" x2="60" y2="98" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <line x1="94" y1="2" x2="94" y2="98" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <line x1="128" y1="2" x2="128" y2="98" stroke={STROKE_LIGHT} strokeWidth="0.4" />
      <rect x="4" y="6" width="20" height="16" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="4" y="30" width="20" height="16" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="4" y="54" width="20" height="16" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="4" y="78" width="20" height="16" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      {[[30, 6], [64, 6], [98, 6], [132, 6],
        [30, 30], [64, 30], [98, 30], [132, 30],
        [30, 54], [64, 54], [98, 54], [132, 54],
        [30, 78], [64, 78], [98, 78], [132, 78],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="28" height="20" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
      ))}
      <polyline points="44,16 78,10 112,18 146,14" stroke={STROKE} strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ComparisonWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="72" height="14" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="82" y="6" width="72" height="14" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="10" y="9" width="40" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="86" y="9" width="40" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <line x1="80" y1="6" x2="80" y2="94" stroke={STROKE} strokeWidth="0.8" />
      <line x1="6" y1="20" x2="154" y2="20" stroke={STROKE} strokeWidth="0.5" />
      {[22, 36, 50, 64, 78].map((y, i) => (
        <g key={i}>
          <rect x="8" y={y} width="68" height="12" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
          <rect x="84" y={y} width="68" height="12" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_BOX} />
          <rect x="12" y={y + 3} width="38" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
          <rect x="88" y={y + 3} width="38" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
          {i % 2 === 0 && <rect x="12" y={y + 7} width="24" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />}
          {i % 2 === 0 && <rect x="88" y={y + 7} width="24" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />}
        </g>
      ))}
      <rect x="6" y="92" width="148" height="2" rx="1" fill={STROKE_LIGHT} fillOpacity="0.3" />
    </svg>
  );
}

export function DesignSystemWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="148" height="12" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="10" y="9" width="28" height="4" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="6" y="22" width="32" height="24" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={14 + i * 8} cy={34} r="5" stroke={STROKE_LIGHT} strokeWidth="0.5"
          fill={["#1d4ed8", "#7c3aed", "#059669", "#d97706"][i]} fillOpacity="0.7" />
      ))}
      <rect x="6" y="50" width="32" height="44" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="10" y="54" width="24" height="4" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.5" />
      <rect x="10" y="60" width="24" height="4" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="10" y="66" width="24" height="4" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="10" y="72" width="24" height="10" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="10" y="84" width="24" height="6" rx="3" stroke={STROKE} strokeWidth="0.6" fill="#1d4ed8" fillOpacity="0.5" />
      <rect x="42" y="22" width="50" height="30" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="46" y="26" width="24" height="4" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.5" />
      <rect x="46" y="32" width="40" height="8" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="46" y="42" width="18" height="6" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="66" y="42" width="18" height="6" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="42" y="56" width="50" height="38" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="46" y="60" width="24" height="4" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.5" />
      <rect x="46" y="66" width="42" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="46" y="70" width="42" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="46" y="74" width="32" height="2.5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="96" y="22" width="58" height="72" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="100" y="26" width="24" height="4" rx="0.5" fill={STROKE_LIGHT} fillOpacity="0.5" />
      {[32, 40, 48, 56, 64, 72, 80].map((y, i) => (
        <rect key={i} x="100" y={y} width={28 + (i % 3) * 8} height="5" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      ))}
    </svg>
  );
}

export function UxPrototypeWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="44" height="88" rx="4" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="10" y="12" width="36" height="6" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="10" y="22" width="36" height="24" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="10" y="50" width="16" height="8" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="30" y="50" width="16" height="8" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="10" y="62" width="36" height="6" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="10" y="70" width="36" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.4" fill={FILL_DARK} />
      <rect x="12" y="82" width="32" height="8" rx="3" stroke={STROKE} strokeWidth="0.7" fill="#1d4ed8" fillOpacity="0.5" />
      <line x1="56" y1="34" x2="66" y2="34" stroke={STROKE} strokeWidth="0.8" markerEnd="url(#arr)" />
      <rect x="66" y="6" width="44" height="88" rx="4" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="70" y="12" width="36" height="6" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="70" y="22" width="36" height="24" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="70" y="50" width="36" height="14" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="70" y="68" width="36" height="6" rx="1" stroke={STROKE_LIGHT} strokeWidth="0.5" fill={FILL_DARK} />
      <rect x="72" y="82" width="32" height="8" rx="3" stroke={STROKE} strokeWidth="0.7" fill="#1d4ed8" fillOpacity="0.5" />
      <line x1="116" y1="34" x2="126" y2="34" stroke={STROKE} strokeWidth="0.8" />
      <rect x="126" y="6" width="28" height="88" rx="4" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="128" y="12" width="24" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.4" fill={FILL_DARK} />
      <rect x="128" y="20" width="24" height="28" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.4" fill={FILL_DARK} />
      <rect x="128" y="52" width="24" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.4" fill={FILL_DARK} />
      <rect x="128" y="58" width="24" height="4" rx="0.5" stroke={STROKE_LIGHT} strokeWidth="0.4" fill={FILL_DARK} />
    </svg>
  );
}

export function GenericWireframe({ className }: WireframeProps) {
  return (
    <svg viewBox="0 0 160 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="96" rx="2" stroke={STROKE_LIGHT} strokeWidth="1" fill={FILL_DARK} />
      <rect x="6" y="6" width="148" height="14" rx="1" stroke={STROKE} strokeWidth="0.8" fill={FILL_BOX} />
      <rect x="10" y="9" width="48" height="5" rx="0.5" fill={STROKE} fillOpacity="0.7" />
      <rect x="6" y="24" width="68" height="40" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="8" y="26" width="64" height="20" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="10" y="50" width="48" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="10" y="55" width="40" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="78" y="24" width="76" height="40" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="82" y="28" width="68" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="82" y="33" width="68" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="82" y="38" width="52" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="82" y="46" width="30" height="12" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="116" y="46" width="30" height="12" rx="1" stroke={STROKE} strokeWidth="0.6" fill={FILL_DARK} />
      <rect x="6" y="68" width="148" height="26" rx="1" stroke={STROKE} strokeWidth="0.7" fill={FILL_BOX} />
      <rect x="10" y="72" width="40" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="10" y="77" width="40" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="10" y="82" width="32" height="3" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
      <rect x="60" y="72" width="90" height="14" rx="0.5" fill={FILL_DARK} stroke={STROKE_LIGHT} strokeWidth="0.3" />
    </svg>
  );
}

export const VIZ_WIREFRAMES: Record<VizFamilyId, (props: WireframeProps) => React.ReactElement> = {
  hmi_interface: HmiWireframe,
  user_journey: JourneyWireframe,
  workflow_process: WorkflowWireframe,
  physical_product: ProductWireframe,
  requirements_matrix: RequirementsWireframe,
  management_summary: ManagementWireframe,
  engagement_analytics: EngagementWireframe,
  persona_research: PersonaWireframe,
  service_blueprint: BlueprintWireframe,
  comparison_evaluation: ComparisonWireframe,
  design_system: DesignSystemWireframe,
  ux_prototype: UxPrototypeWireframe,
  generic: GenericWireframe,
};

export function VizWireframe({ family, className }: { family: VizFamilyId; className?: string }) {
  const Comp = VIZ_WIREFRAMES[family] ?? GenericWireframe;
  return <Comp className={className} />;
}
