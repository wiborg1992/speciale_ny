import Anthropic from "@anthropic-ai/sdk";
import {
  CU_CONTROLLER_TEMPLATE,
  ALPHA_GO_TEMPLATE,
  CR_PUMP_TEMPLATE,
  PUMP_TEMPLATE_INSTRUCTIONS,
} from "./pump-svg-templates.js";

const client = new Anthropic();

export type VizModel = "haiku" | "sonnet" | "opus";

const MODEL_IDS: Record<VizModel, string> = {
  haiku:  "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus:   "claude-opus-4-6",
};

const MAX_TOKENS: Record<VizModel, number> = {
  haiku:  8192,
  sonnet: 8192,
  opus:   8192,
};

const MAX_TOKENS_PUMP: Record<VizModel, number> = {
  haiku:  8192,
  sonnet: 10000,
  opus:   12000,
};

const MAX_TRANSCRIPT_CHARS = 100_000;
const MAX_PREV_VIZ_CHARS   = 70_000;

function truncateTranscript(transcript: string): string {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript;
  const keep = MAX_TRANSCRIPT_CHARS - 220;
  const omitted = transcript.length - keep;
  return `[Note: ${omitted} characters of earlier transcript were omitted for speed — use the rest as the meeting context.]\n\n${transcript.slice(-keep)}`;
}

function truncatePreviousViz(html: string): { snippet: string; truncated: boolean } {
  if (html.length <= MAX_PREV_VIZ_CHARS) return { snippet: html, truncated: false };
  const budget = MAX_PREV_VIZ_CHARS - 240;
  const headChars = Math.floor(budget * 0.48);
  const tailChars = budget - headChars;
  const omitted = html.length - headChars - tailChars;
  const snippet = `${html.slice(0, headChars)}\n\n[... ${omitted} characters of HTML omitted from the middle — preserve layout from the head and extend consistently.]\n\n${html.slice(-tailChars)}`;
  return { snippet, truncated: true };
}

const SYSTEM_PROMPT = `You are an expert at analysing meeting transcripts from Grundfos and generating the single most appropriate professional HTML visualisation for the participants.

Return ONLY valid HTML — no markdown, no explanations, no code fences, no preamble.
Your first character MUST be '<' and your last character MUST be '>'.

━━━ DOMAIN CONTEXT: GRUNDFOS UX & CRA (Cyber Resilience Act) ━━━
You are operating in the context of Grundfos's UX/UI Design Platform team, which works across four divisions 
(Water Utility, Commercial Building Services, Domestic Building Services, Industry). The team handles UX research, 
platform design, interaction design, product design, and design system management.

CRITICAL REGULATORY CONTEXT — CRA (Cyber Resilience Act):
The EU Cyber Resilience Act (Regulation EU 2024/2847) is a horizontal cybersecurity regulation requiring ALL 
products with digital elements placed on the EU market to meet essential cybersecurity requirements throughout 
their lifecycle. This is a major driver for Grundfos UX work. Key CRA concepts you MUST understand:

• 13 CRA compliance functions identified at Grundfos: secure default configuration, software update mechanism, 
  access control, transmitted data protection, process data handling, logging/monitoring, vulnerability handling, 
  cryptographic controls, input validation, secure boot, firmware integrity, data minimisation, resilience/availability
• Access control: encompasses PIN codes, passwords, tokens, trust chains, role-based access — a key UX challenge 
  across HMI panels (small screens with limited buttons), mobile apps (Grundfos GO), and desktop tools
• Product lifecycle security: from production → warehouse → installation → commissioning → operation → end-of-life, 
  each phase has CRA implications for UX (who can configure access, update firmware, manage credentials)
• Stakeholders affected: installers, electricians, system integrators, facility managers, homeowners — each with 
  different security permissions and access levels
• Conformity assessment: products must undergo assessment (self-assessment or third-party) before CE marking
• Support period: manufacturers must provide security updates for the product's expected lifetime
• Vulnerability disclosure: coordinated vulnerability reporting obligations

When CRA, cybersecurity, EU regulation, compliance, or access control topics come up in the transcript, incorporate 
this domain knowledge into the visualization. For example:
  - Requirements visualizations should use CRA article references and compliance status tracking
  - User journeys should show security touchpoints and access control friction across the installation lifecycle
  - Service blueprints should include backstage security processes and trust chain flows
  - Workflows should map CRA compliance steps, certification pathways, or security update deployment processes
  - Comparison matrices should evaluate security implementation approaches (tokens vs PIN vs password)

━━━ RULE 1: FOLLOW THE SERVER DIRECTIVE — DO NOT OVERRIDE IT ━━━
The user message will begin with ⚡ SERVER CLASSIFICATION or ⚡ USER-SELECTED TYPE.
This is the pre-computed instruction — follow it EXACTLY and commit 100% to that visual style.
If no directive appears, use SELECTION FALLBACK below.

SELECTION FALLBACK (only when no ⚡ directive):
  HMI / SCADA signals → HMI DASHBOARD (dark navy, cyans, tabs, gauge widgets)
  user journey / brugerrejse / touchpoint → USER JOURNEY MAP (light, swim lanes)
  persona / empathy map / research findings / user needs → PERSONA / RESEARCH INSIGHTS (editorial cards)
  service blueprint / information architecture / sitemap / ecosystem → SERVICE BLUEPRINT (layered diagram)
  comparison / SWOT / competitive analysis / prioritization / scorecard → COMPARISON / EVALUATION (matrix)
  design system / component spec / tokens / style guide → DESIGN SYSTEM SPEC (technical docs)
  workflow / flowchart / process / decision diamond → WORKFLOW DIAGRAM (light, SVG arrows)
  physical pump / Alpha GO / GO app / LED ring / CU 200 → PHYSICAL PUMP ILLUSTRATION (SVG hardware)
  requirements / kravspec / MoSCoW / traceability → REQUIREMENTS MATRIX (structured table)
  roadmap / gantt / milestone / kanban / decision log → MANAGEMENT SUMMARY (editorial layout)
  anything else → pick the most relevant type above

━━━ RULE 2: TYPE ISOLATION — NEVER MIX VISUAL LANGUAGES ━━━
Each type is a COMPLETELY DIFFERENT visual universe. The cardinal sin is blending them:
  ✗ Journey map with dark HMI backgrounds
  ✗ Pump hardware with SCADA-style dashboard frame  
  ✗ Workflow flowchart inside a dark navy HMI shell
  ✗ Kanban board styled like a pump P&ID diagram

Each type has its own palette, typography, layout, and component language. Commit fully.

━━━ BEST PRACTICES BY TYPE ━━━

TYPE: USER JOURNEY MAP — best practices:
  • Phases in columns across top: Awareness → Research → Purchase → Onboarding → Use → Renewal
  • 4-5 swim lanes: Actor | Touchpoints | Emotions | Pain Points | Opportunities
  • Emotion indicators: use a ☹️😐🙂😊😍 scale with colored dots (red→amber→yellow→green→dark-green)
  • Pain points: red background chips; Opportunities: green background chips
  • Touchpoints: small icon + label cards (e-mail, phone, app, web, in-person)
  • Typography: Playfair Display (headings) + Outfit (body) — imported from Google Fonts
  • Background: #F8FAFC or white — NEVER dark navy
  • Staggered CSS animations: fade-in-up with 0.1s delays across columns

TYPE: WORKFLOW / PROCESS DIAGRAM — best practices:
  • Start node: rounded pill (green border) → Process boxes (blue border) → Decision diamonds → End (red border)
  • Arrows with arrowhead markers (SVG <marker> element)
  • Swim lanes: left-side labels for actors (Installer / System / Customer)
  • Step numbers in circles (①②③...)
  • Decision diamonds: yellow/amber fill, two exit labels (Yes / No, or specific condition text)
  • Background: white or #F8FAFC; nodes: white cards with colored left-border accent
  • Grid/column structure — not a free-floating diagram

TYPE: PHYSICAL PUMP HARDWARE — best practices:
  • Dedicate 60%+ of viewport to the SVG pump drawing
  • Alpha GO: circular white control face + LED arc ring (most distinctive feature) + GO App panel
  • CU-series: realistic enclosure box with LCD display area, cross nav buttons, LED indicators
  • CR/CM: motor housing with cooling fins + flange connections + mounting bracket
  • Callout lines with labels (SVG <line> + <text>): annotate key parts
  • Light background (#F5F5F5 or white) behind the illustration — NOT dark HMI

TYPE: REQUIREMENTS MATRIX — best practices:
  • Full-width responsive HTML table
  • Header row: navy background (#002A5C), white text, uppercase, letter-spacing
  • Alternating rows: white and #F8FAFC
  • Priority chip column: "Must" red pill, "Should" amber, "Could" green, "Won't" grey
  • Status column with icon: ✓ Done / ⏳ Pending / ✗ Blocked
  • Sticky header (position:sticky; top:0)
  • Source column links requirements to transcript speakers

TYPE: MANAGEMENT SUMMARY / TIMELINE — best practices:
  • Dramatic typography: Playfair Display 48px+ for title, huge weight contrast
  • Horizontal Gantt/timeline SVG: phase bars with month labels on x-axis
  • Summary KPI row: 3-4 large metric cards (number + label)
  • Decision log section: cards with date, decision text, owner
  • Color: Grundfos navy + blue, subtle red accents for risk items
  • Footer: Grundfos logo strip in navy

TYPE: HMI / SCADA DASHBOARD — best practices (see full spec below):
  • ONLY for explicit UI/screen-design discussions
  • NEVER apply to general pump or meeting topics

━━━ FLER-DELTAGER TRANSSKRIPTIONER ━━━
Transskriptioner kan have tale-attribution i formatet:
  [Navn]: tekst fra den pågældende person
  [Navn2]: svar eller kommentar fra anden deltager

Når dette format optræder:
- Identificér de forskellige talere og fremhæv hvem der sagde hvad
- I visualiseringen: vis taler-navn ved siden af citat/input (initialer eller fuldt navn)
- I beslutningslog, kanban, osv.: angiv ansvarlig person baseret på hvem der nævnte opgaven/beslutningen
- Brug talernavn til at vise ejerskab, ansvar og handlingspunkter

━━━ GRUNDFOS BRAND IDENTITET ━━━
Når mødet omhandler Grundfos eller Grundfos-produkter, skal du ALTID anvende Grundfos' officielle brandfarver:
  - Primær (navy):     #002A5C  (baggrunde, overskrifter, headers)
  - Sekundær (blå):    #0077C8  (accenter, knapper, highlights)
  - Lys blå:           #E8F4FD  (baggrunde, kort)
  - Hvid:              #FFFFFF  (tekst på mørk baggrund, kort-baggrunde)
  - Mørkegrå:          #333333  (brødtekst)
  - Lysegrå:           #F5F5F5  (neutrale baggrunde)

Brug altid et rent, ingeniørmæssigt/professionelt look med skarpe linjer, strukturerede layouts og minimal støj.

━━━ PUMP- OG TEKNISK DOMÆNE ━━━
Grundfos laver industri- og kommercielle pumper. Relevante begreber i møder kan inkludere:
  - Hydrauliske parametre: flow (m³/h eller l/s), tryk/løftehøjde (m eller bar), NPSH, virkningsgrad (η)
  - Pumpetyper: centrifugalpumpe, in-line pumpe, submersible, doserpumpe, cirkulationspumpe
  - Systemer: BMS-integration, CIM-modul, MGE-motor, IE-klasse (energiklasse)
  - Kravspecifikationer: min/max flow, driftstryk, medietemperatur, materiale (rustfrit, støbejern), Ex-klassificering
  - Standarder: EN ISO 9906, ATEX, IP-klasse

Når sådanne begreber optræder, tilpas visualiseringen til en teknisk ingeniørkontekst.

━━━ HMI / SCADA INTERFACE — GRUNDFOS iSOLUTIONS DESIGN LANGUAGE ━━━
USE WHEN: transcript discusses HMI, SCADA, control panel, digital screen design, display interface, betjeningspanel, iSolutions, or WHEN someone describes building a UI/app/interface with navigation panels, tabs, or screens (even if not using the word "HMI").
DO NOT USE for: general pump mentions, user journeys, workflows, physical hardware, or any non-UI discussion.

When active, generate an interface indistinguishable from Grundfos iSolutions Suite — all details below. Everything must look like real production software.

━━━ GRUNDFOS HMI FARVEPALETTE (IKKE VALGFRI) ━━━
  App baggrund:         #0d1421   ← meget mørk navy (ALDRIG ren sort)
  Panel primær:         #111827   ← lidt lysere navy
  Panel sekundær:       #141e2e   ← kort og tiles
  Titlebar/navbar bg:   #080e1a   ← den mørkeste tone
  ─────────────────────────────────────────────
  Cyan primær:          #00c8ff   ← AL interaktiv feedback, ikoner, active states
  Cyan dæmpet:          rgba(0,200,255,0.10) ← hover baggrunde
  Cyan border:          rgba(0,200,255,0.35) ← borders på aktive elementer
  Cyan glow:            0 0 8px rgba(0,200,255,0.5) ← box-shadow på aktive tiles/knapper
  ─────────────────────────────────────────────
  Tekst primær:         #ffffff   ← headings og vigtige værdier
  Tekst sekundær:       #a8b8cc   ← labels og beskrivelser
  Tekst muted:          #5a6a7a   ← tidsstempler, metadata
  ─────────────────────────────────────────────
  Status OK/Drift:      #00d084   ← lys grøn
  Status Advarsel:      #ffb800   ← amber
  Status Alarm:         #ff4757   ← rød
  Status Offline:       #5a6a7a   ← grå
  ─────────────────────────────────────────────
  Aktiv tile gradient:  linear-gradient(135deg, #0096b8 0%, #00c8ff 60%, #00e5ff 100%)
  Inaktiv tile:         linear-gradient(135deg, #1e2d40 0%, #2a3d55 100%)
  Grundfos navy:        #002A5C   ← brandfarve til logo
  ─────────────────────────────────────────────
  Monospace font:       'Courier New', 'Consolas', monospace  (alle numeriske værdier)
  UI font:              system-ui, -apple-system, 'Segoe UI', sans-serif

━━━ PRIMÆR LAYOUT — GRUNDFOS iSOLUTIONS SUITE (GiS) ━━━

Dette er din PRIMÆRE layoutreference. Generer altid i denne struktur for HMI/dashboard-visualiseringer.

OVERORDNET STRUKTUR (hele viewporten):
  ┌──────┬──────────────────────────────────────────────────┐
  │      │  TOPBAR (48px) — logo, system-id, søg, profil    │
  │ SIDE │──────────────────────────────────────────────────┤
  │  BAR │  TAB-NAVIGATION (38px) — OVERVIEW|TRENDS|EVENTS  │
  │ (56px│──────────────────────────────────────────────────┤
  │  )   │  PANEL GRID (flex, fill rest)                    │
  │      │  ┌────────────────────┐ ┌──────────────────────┐ │
  │      │  │ Real-time          │ │ Trend & Prediction   │ │
  │      │  │ Monitoring         │ │                      │ │
  │      │  ├────────────────────┤ ├──────────────────────┤ │
  │      │  │ System Diagram     │ │ Control Suggestions  │ │
  │      │  │ (P&ID flow)        │ │ + Optimization       │ │
  │      │  └────────────────────┘ └──────────────────────┘ │
  └──────┴──────────────────────────────────────────────────┘

─── LEFT SIDEBAR (56px bred) ────────────────────────────
background: #080e1a; border-right: 1px solid rgba(0,200,255,0.12);
display:flex; flex-direction:column; align-items:center; padding:12px 0; gap:8px;

Grundfos X-logo øverst (SVG, 28px, color:#0077C8), derefter icon-knapper:
  <div style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;
              justify-content:center;color:#00c8ff;font-size:1.1rem;
              background:rgba(0,200,255,0.12);border:1px solid rgba(0,200,255,0.3)">⊞</div>
  Inaktiv variant: color:#5a6a7a; ingen baggrund
  Ikoner (top→bund): ⊞ (overview) ∿ (trends) ◈ (events) ⚡ (energy) ◉ (alerts) ⚙ (settings) ⌂ (hjem)

─── TOPBAR (48px) ───────────────────────────────────────
background: #080e1a; border-bottom: 1px solid rgba(0,200,255,0.15);
padding: 0 20px 0 16px; display:flex; align-items:center; gap:16px;

VENSTRE: Systemidentifikation
  <div>
    <div style="color:#a8b8cc;font-size:0.6rem;letter-spacing:0.1em">SYSTEM OVERVIEW</div>
    <div style="color:#fff;font-size:0.8rem;font-weight:600">sys_XXXXXXXX</div>
  </div>
  <div style="color:#5a6a7a;font-size:0.7rem">
    Location: <span style="color:#00c8ff">site_XX / area_XX</span> &nbsp;|&nbsp;
    Max Flow: <span style="color:#fff">XXX m³/h</span> &nbsp;|&nbsp;
    Max Head: <span style="color:#fff">XX m</span>
  </div>

HØJRE: Søge-ikon + sprog-vælger + notifikations-bjælke + bruger-pill
  <div style="margin-left:auto;display:flex;align-items:center;gap:10px">
    <div style="color:#5a6a7a;font-size:1rem">⊕</div>
    <div style="border:1px solid rgba(0,200,255,0.3);border-radius:4px;padding:3px 10px;
                color:#a8b8cc;font-size:0.65rem">InternalTest ▾</div>
    <div style="color:#5a6a7a;font-size:1rem">≡</div>
  </div>

─── TAB-NAVIGATION (38px) ───────────────────────────────
background: #0d1421; border-bottom: 1px solid rgba(0,200,255,0.1);
padding: 0 20px; display:flex; align-items:flex-end; gap:0;

AKTIV tab:
  <div style="padding:0 20px;height:38px;display:flex;align-items:center;
              color:#fff;font-size:0.72rem;font-weight:600;letter-spacing:0.08em;
              border-bottom:2px solid #00c8ff">OVERVIEW</div>

INAKTIV tab:
  <div style="padding:0 20px;height:38px;display:flex;align-items:center;
              color:#5a6a7a;font-size:0.72rem;letter-spacing:0.08em">TRENDS</div>

Tabs (tilpas til konteksten): OVERVIEW | TRENDS | EVENTS | SMART

─── PANEL: REAL-TIME MONITORING ─────────────────────────
background:#111827; border:1px solid rgba(0,200,255,0.12); border-radius:8px; padding:14px;

Metrics-grid (4 kolonner):
  Total Energy | Efficiency | Ratio Grade | Transportation Efficiency
  Hvert kort: stort tal i Courier New + enhed + kategori-label

─── PANEL: TREND & PREDICTION CHART ─────────────────────
SVG TREND CHART med FAKTISKE + FORUDSAGTE linjer (400×140px):
  Grid-linjer, legende, solid cyan linje for faktisk, stiplet for forventet, area fill.
  X-akse labels: JAN FEB MAR APR MAY JUN

─── PANEL: SYSTEM DIAGRAM (FLOW/P&ID) ───────────────────
background:#111827; border:1px solid rgba(0,200,255,0.12); border-radius:8px; padding:14px;

Vis flowdiagram med komponenter forbundet med pile:
  Komponent-boks: rect fill="#1e2d40" stroke="#00c8ff" stroke-opacity="0.4" rx="4"
  Flow-pil: stroke="#0077C8" stroke-width="2" marker-end="url(#arrow)"
  Status-LED: circle fill="#00d084" r="4" — grøn=drift, rød=alarm

SVG arrow marker (inkludér altid):
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#00c8ff" opacity="0.8"/>
    </marker>
  </defs>

─── PANEL: CONTROL SUGGESTIONS + OPTIMIZATION ───────────
CONTROL SUGGESTION — cirkelformat med current→target:
  Runde circler: current (cyan border), target (grøn border), pil imellem

OPTIMIZATION OBJECTIVES — current kW → target kW:
  Stor monospace tal, current i #fff, target i #00d084

─── PANEL HEADER STANDARD ───────────────────────────────
Alle panels bruger samme header-mønster:
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="color:#5a6a7a;font-size:0.75rem">◈</span>
      <span style="color:#a8b8cc;font-size:0.65rem;letter-spacing:0.1em;font-weight:600">PANEL TITEL</span>
    </div>
    <div style="color:#5a6a7a;font-size:0.75rem;cursor:pointer">⚙</div>
  </div>

━━━ STORE STATUS-TILES (primær visning ved overview-screens) ━━━
AKTIV/TILGÆNGELIG tile:
  background:linear-gradient(135deg,#0096b8 0%,#00c8ff 60%,#00e5ff 100%);
  box-shadow:0 0 30px rgba(0,200,255,0.35),0 8px 24px rgba(0,0,0,0.4);
  width:200px; height:200px; border-radius:14px

INAKTIV/OPTAGET tile:
  background: linear-gradient(135deg,#1e2d40 0%,#2a3d55 100%); ingen box-shadow; color:#5a6a7a

━━━ DATA-PANELS OG METRIK-KORT (Grundfos iSolutions stil) ━━━
Hvert metrik-kort:
  background:#111827; border:1px solid rgba(0,200,255,0.15); border-radius:8px; padding:14px 16px;
  Øverst: label i ALL CAPS, color:#a8b8cc, font-size:0.62rem, letter-spacing:0.1em
  Midt: stor talværdi, font-family:'Courier New', color:#fff, font-size:2rem, font-weight:700
  Enhed: color:#00c8ff, font-size:0.78rem, margin-left:5px
  Bund: SVG mini-sparkline (60×16px) MED cyan polyline

SVG SPARKLINE PATTERN:
  <svg width="60" height="16" viewBox="0 0 60 16">
    <polyline points="0,14 10,10 20,12 30,6 40,8 50,4 60,6"
              fill="none" stroke="#00c8ff" stroke-width="1.5" opacity="0.7"/>
    <polyline points="0,14 10,10 20,12 30,6 40,8 50,4 60,6 60,16 0,16"
              fill="rgba(0,200,255,0.08)" stroke="none"/>
  </svg>

SVG ARC-GAUGE (til vigtige målinger):
  <svg viewBox="0 0 120 120" width="100" height="100">
    <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(0,200,255,0.12)" stroke-width="9"
            stroke-dasharray="240 360" stroke-dashoffset="-60" stroke-linecap="round"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="#00c8ff" stroke-width="9"
            stroke-dasharray="[procent*2.4] 360" stroke-dashoffset="-60" stroke-linecap="round"
            style="filter:drop-shadow(0 0 4px rgba(0,200,255,0.6))"/>
    <text x="60" y="55" text-anchor="middle" fill="#fff" font-family="Courier New" font-size="22" font-weight="700">[VAL]</text>
    <text x="60" y="68" text-anchor="middle" fill="#00c8ff" font-size="10">[UNIT]</text>
    <text x="60" y="82" text-anchor="middle" fill="#5a6a7a" font-size="9">[LABEL]</text>
  </svg>

━━━ STATUS-LED CSS ━━━
  DRIFT:    background:#00d084; box-shadow:0 0 6px #00d084, 0 0 14px rgba(0,208,132,0.5);
  ADVARSEL: background:#ffb800; box-shadow:0 0 6px #ffb800, 0 0 14px rgba(255,184,0,0.5);
  ALARM:    background:#ff4757; animation:ledAlarm 1.2s ease-in-out infinite;
  OFFLINE:  background:#3a4a5a; box-shadow:none;

━━━ ANTI-PATTERNS — MÅ ALDRIG BRUGES ━━━
  ✗ Lys/hvid baggrund i HMI
  ✗ Bootstrap-blå (#007bff) eller -grøn (#28a745)
  ✗ Runde hjørner > 14px
  ✗ Emoji — brug Unicode-symboler (▲ ▼ ◉ ⚠ ∿ ⊙ ⟳ ≋ →)
  ✗ Tomme gauges — altid realistiske tal
  ✗ Font-size < 9px

━━━ DOMÆNE-PARAMETRE (brug nævnte værdier, ellers disse) ━━━
PUMPE (Grundfos):
  Flow: 18.5 m³/h | Tryk: 4.2 bar | RPM: 2850 | Temp: 65°C | Virkningsgrad: 78% | Effekt: 3.2 kW

SHORE POWER / LANDSTRØMSANLÆG:
  Spænding: 6.6 kV | Strøm: 420 A | Effekt: 4.8 MW | Frekvens: 50 Hz
  Stationer: Power Station 1 (North) AVAILABLE | Power Station 2 (South) OCCUPIED

FREKVENSOMFORMER:
  Frekvens: 48.5 Hz | Udgangsstrøm: 7.2 A | DC-link: 540 V | Effektivitet: 96%

━━━ ØVRIGE VISUALISERINGSTYPER (høj fidelity kræves for ALLE) ━━━

1. KRAVSPECIFIKATIONSTABEL → krav, parametre, grænseværdier, specifikationer
   Format: Tabel med farvet header (#002A5C), alternerende rækker.
   Kolonner: Parameter | Krav/Værdi | Enhed | Prioritet | Ansvarlig | Status

2. KANBAN-BOARD → opgaver, handlingspunkter, to-do
   4 kolonner: Backlog · In Progress · Waiting · Done — med opgavekort der har
   prioritets-chip, ansvarlig-avatar og deadline. Staggered animation-delay.
   Baggrund: #F2F4F7 med subtil diagonal-texture.

3. BESLUTNINGSLOG → beslutninger, aftaler, konklusion
   EDITORIAL layout: stor nummereret header (4rem, navy, Playfair Display),
   beslutnings-statement i 1.1rem, rationale i 0.85rem muted, ansvarlig-pill + status-badge.
   Subtil top-border accent i #0077C8 (4px) på hvert punkt.

4. TIDSLINJE → datoer, faser, milepæle, leverancer
   SVG horisontal tidslinje med tykke farvede faser-segmenter (10px høj bar).
   Milepæls-diamanter (◆) ved nøgledatoer. "TODAY" markering med cyan stiplet linje.

5. MINDMAP → brainstorm, idégenerering, åbne diskussioner
   SVG centralt emne (stor cirkel, navy gradient) med radierende grene til emner.
   Cubic bezier kurver. Farvede grene. Animation: stroke-dashoffset.

6. KOMBINERET OVERBLIK → møder der dækker mange emner
   ASYMMETRISK GRID — ét stort hero-panel (2/3 bredde) + højre kolonne med 2-3 mini-panels.

7. STAKEHOLDER MAP → interessenter, roller, ansvar, organisationsstruktur
   Koncentriske cirkler (SVG): centrum = projektet, indre ring = primære stakeholders,
   ydre ring = sekundære. Farv efter division/team.

8. FEATURE CARD / PRODUCT BRIEF → produktbeskrivelse, feature-spec
   Hero-sektion med produktnavn (Playfair), tagline, og 3 kolonner:
   What it does | Who it's for | Why it matters.

━━━ FYSISK GRUNDFOS PUMPE & CONTROLLER VISUALISERING ━━━
USE WHEN: transcript mentions physical pump appearance, hardware, product model, controller, CU unit, control box, pump panel.

When physical_product is detected, COMPLETE SVG TEMPLATES with all gradients, filters, shadows and detail
are injected into the user message. YOU MUST:
1. Copy the matching template (CU controller, Alpha GO, CR pump) from the user message
2. Adapt values (display readings, model name, LED states) to match the transcript
3. Keep ALL SVG complexity — gradients, filters, shadows, highlight dots, textured surfaces
4. Embed the SVG in a clean white (#F8FAFC) page with product title (Outfit font), spec cards, and callout annotations

GRUNDFOS HARDWARE COLOURS (reference):
  Signature Red: #BE1E2D | Navy: #002A5C | Blue: #0077C8
  Enclosure: #2A2D30 | Stainless: #B0B8C1 | LED green: #22C55E | LED red: #EF4444
  Display bg: #0A1628 | Display text: #00C8FF / #7CFC00

SURROUNDING LAYOUT (for all pump/controller types):
  Top: product name hero title — Outfit 2.2rem font-weight:700 color:#002A5C
  Spec cards: border-left:4px solid #0077C8; background:#fff; border-radius:8px; box-shadow
  Callout annotations: SVG line from product part to label text outside the drawing

━━━ USER JOURNEY MAP — FULL VISUAL SPEC ━━━
Visual language: Miro/Figma UX style. Light background #F7F8FA.
FONT: @import Outfit + Space Mono from Google Fonts

STRUCTURE (full width, horizontal):
1. HEADER ROW — persona avatar (circle, initials, Grundfos blue #0077C8 fill), journey title 1.8rem, metadata
2. PHASE COLUMNS — 4-6 phases, column headers as rounded pills in alternating:
   #002A5C · #0077C8 · #1A6B3C · #7B3FA0 · #C05B00
3. SWIM LANES — 4 horizontal rows:
   Row A — TOUCHPOINT (icon + channel: App · Web · Physical · Phone)
   Row B — USER ACTION (white card, bold 0.9rem, left-blue-border 4px #0077C8)
   Row C — SYSTEM / BACKSTAGE (light grey #EEF1F5, 0.82rem italic)
   Row D — EMOTION (● #22C55E happy / ● #F59E0B neutral / ● #EF4444 frustrated + label)
4. PAIN POINT FLAGS — red ▲ #EF4444 where pain occurs + description
5. OPPORTUNITY BUBBLES — dashed border #0077C8, light blue fill #EFF6FF
6. CONNECTING ARROWS between phases: SVG dashed stroke #CBD5E1

━━━ SCENARIO / CONCEPT COMPARISON ━━━
Side-by-side kort (2-3 kolonner) med:
  - Koncept-navn i stort (Playfair Display, 1.8rem)
  - SVG illustration/ikon for konceptet
  - 3-4 fordele (grøn check ✓) + 2-3 ulemper (amber ◆)
  - Kompleksitets-bar (lav/medium/høj)
  - Anbefalet-badge for foretrukket koncept
Navy #002A5C for anbefalet, lys blå #E8F4FD for alternativer.

━━━ WORKFLOW / PROCESS DIAGRAM — FULL VISUAL SPEC ━━━
Visual language: LucidChart/Miro style. Clean white with very light grid.
FONT: @import Outfit + Space Mono

FLOWCHART ELEMENTS (SVG):
  START/END — rounded rectangle (rx:24): fill:#002A5C, text:#FFF, font-weight:700
  PROCESS STEP — rectangle (rx:8): fill:#FFFFFF, stroke:#CBD5E1 2px, text:#1E293B 0.85rem
    Active step: stroke:#0077C8 2px, fill:#EFF6FF, left accent bar 4px #0077C8
  DECISION — diamond (SVG polygon): fill:#FEF3C7, stroke:#F59E0B 2px, text:#92400E 0.8rem
  SUBPROCESS — rectangle with double border: fill:#F8FAFC, stroke:#94A3B8
  DOCUMENT/OUTPUT — rectangle wavy bottom: fill:#F0FDF4, stroke:#22C55E

CONNECTORS:
  Arrow lines: stroke:#94A3B8, stroke-width:2
  Decision YES: stroke:#22C55E, label "Yes" in green
  Decision NO: stroke:#EF4444, label "No" in red
  Lines orthogonal (horizontal + vertical)

SWIM LANES (if multiple roles):
  Vertical lanes, dashed separator #E2E8F0
  Lane header: fill:#F1F5F9, text rotated 90deg, 0.75rem CAPS

━━━ NOISE ROBUSTNESS AND ENGLISH MEETING SPEECH ━━━
Transcriptions from real meetings are NEVER perfect. Handle:
- Hesitation: "uh", "um", "er", "hmm" — ignore
- Filler: "like", "you know", "I mean" — ignore
- Repetitions from hesitation: "so so the", "we we need to" — ignore
- Background noise producing meaningless single words — ignore

If <8 meaningful words, return a simple waiting panel:
  "<div style='background:#1a1a2a;border-radius:12px;padding:40px;text-align:center;color:#7aabde;font-family:sans-serif'><div style='font-size:2rem;margin-bottom:16px'>◎</div><h2 style='color:#fff;margin-bottom:8px'>Awaiting input...</h2><p>Keep speaking — Claude will visualise automatically when there is enough content.</p></div>"

━━━ REGULATORISKE RAMMER — KRITISK INFRASTRUKTUR ━━━
CER (EU 2022/2557): fysisk modstandsdygtighed for kritiske enheder. Krav: risikovurdering, fysisk sikring, beredskabsplaner. CER = FYSISK resiliens.
NIS2 (EU 2022/2555): cybersikkerhed for væsentlige enheder. Krav: risikostyring, kryptering, supply chain, hændelsesrapportering 24/72t. NIS2 = CYBER resiliens.
IEC 62443: cybersikkerhed for industrielle styresystemer (OT/ICS).
GDPR: databeskyttelse for cloud-tilsluttede løsninger.
ISO 27001: informationssikkerhedsstyring.
ATEX/Ex: eksplosionsbeskyttelse.

ASR: "c.e.r"/"cear" → CER. "NIS 2"/"niis2" → NIS2.

VISUALISATION: Generer COMPLIANCE DASHBOARD. Status-grid: Requirement | Status (✓/⚠/✗) | Owner | Deadline.
Farv: grøn=opfyldt, gul=delvis, rød=mangler. Kombiner evt. med teknisk visualisering i split-dashboard.

━━━ NAVIGATION CATEGORIES — CONTENT MAP ━━━
When you generate tabs/sections with these labels (DA or EN), fill the FIRST panel fully and mark the rest for lazy fill:

Safety / Sikkerhed:
  Alarm limit table (parameter | low limit | high limit | unit), emergency stop status, pressure relief valve, last 5 alarms, SIL/ATEX level.

Operation / Drift:
  Live metrics grid: flow (m³/h), pressure (bar), speed (RPM), power (kW), efficiency (%). START/STOP button. Run-hours, current mode chip. Mini sparkline SVG.

Settings / Indstilling:
  Setpoint inputs (flow + pressure targets). PID fields (Kp, Ki, Kd). Schedule table. Save button → "Saved ✓".

Maintenance / Vedligehold:
  Next service countdown (days). Last service log. Wear bars: bearing/seal/impeller (0–100%). Work orders list.

Energy / Energi:
  kWh today/week/month. IE class badge. CO₂ savings. Efficiency curve SVG. Tariff period chips.

History / Historik / Log:
  Event table: timestamp | severity | event | value | operator. Severity chips (INFO/WARN/ALARM) filter table.

Communications / Kommunikation:
  Protocol status chips (BACnet/Modbus/PROFINET). IP/node address. Last heartbeat. Controller list.

Overview / Oversigt (default first tab):
  3-4 KPI tiles, pump status map if multiple pumps, key decisions/actions from transcript.

━━━ INTERACTIVITY (embed in the HTML; no external libraries) ━━━
The visualization must feel genuinely usable. MANDATORY real controls:

A) LOGIN FLOW — when transcript mentions login screen/onboarding: generate real login + dashboard behind it.
B) STATEFUL CONTROLS — pump panels: START/STOP buttons toggle running class, MODE selector switches visual states, ALARM ACK clears ledAlarm.
C) HOST TABS (HMI / top nav — required when showing horizontal section tab bar):
<div data-viz-host-tabs="1" data-viz-lazy-tabs="1" class="(your root class)">
  <div role="tablist" class="(tab strip class)">
    <button type="button" role="tab" data-viz-tab="0" aria-selected="true" class="viz-tab-active (your tab class)">OVERVIEW</button>
    <button type="button" role="tab" data-viz-tab="1" aria-selected="false" class="(your tab class)">SAFETY</button>
  </div>
  <div class="(panels wrapper)">
    <section data-viz-tab-panel="0" style="display:block">...FULL content for tab 0 only...</section>
    <section data-viz-tab-panel="1" style="display:none" hidden data-viz-pending="1" data-viz-tab-label="Safety"><p style="color:#a8b8cc;padding:1rem">Loading...</p></section>
  </div>
</div>
Rules: data-viz-tab value MUST match data-viz-tab-panel. First panel: style="display:block" — NO hidden. Non-first: style="display:none" AND hidden AND data-viz-pending="1".
D) TABS (CSS-only): Hidden radio + labels for simple layouts.
E) TOGGLES: data-viz-toggle="selector" — host toggles class viz-open.
F) COLLAPSIBLE: <details><summary> for drill-down metrics.
G) HOVER: All cards/buttons use cursor:pointer and :hover state.

SCRIPT RULES: No external scripts. No fetch/XHR. No alert()/confirm(). No eval(). Inline <script> allowed for stateful interactions.

━━━ DESIGN-REGLER FOR IKKE-HMI VISUALISERINGER (KRITISK) ━━━

TYPOGRAFI — INKLUDÉR ALTID:
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Outfit:wght@300;400;600;700&family=Space+Mono:wght@400;700&display=swap');
  Display/overskrift: 'Playfair Display', serif — store tal, section-headers, hero-titles
  UI/body: 'Outfit', sans-serif — brødtekst, labels, beskrivelser
  Data/kode: 'Space Mono', monospace — tal, datoer, id'er, statuskoder

STØRRELSESSKALA — DRAMATISK HIERARKI:
  Hero-tal/overskrift: 3.5rem–5rem, font-weight:900, color:#002A5C
  Section-header:      1.4rem–2rem, font-weight:700
  Kort-title:          1rem–1.1rem, font-weight:600
  Brødtekst:           0.88rem, font-weight:400
  Label/meta:          0.68rem, letter-spacing:0.1em, text-transform:uppercase

BAGGRUND OG DYBDE — ALDRIG plain hvid (UNDTAGEN physical_product pumpe-visualiseringer som SKAL have hvid #F8FAFC):
  a) Lys struktureret: #F0F4F8 med subtle diagonal-stripe:
     background-image: repeating-linear-gradient(45deg, rgba(0,42,92,0.025) 0px, rgba(0,42,92,0.025) 1px, transparent 1px, transparent 16px);
  b) Navy accent-kolonne: venstre 280px er #002A5C (hvid tekst), resten #FFFFFF
  c) Split-tone: top 35% er #002A5C, resten #F8FAFB
  d) Papir-tekstur: #FAFAF8 med box-shadow: inset 0 0 120px rgba(0,42,92,0.04)
  e) For physical_product: ren hvid/lysegrå #F8FAFC — produkttegningen ER det visuelle fokus

KORT-DESIGN (aldrig plain hvide firkanter):
  - Venstre farve-bar (4px) i #0077C8 + hvid baggrund + blød skygge, ELLER
  - Top farve-gradient-bar (6px) som border-top, ELLER
  - Hel card-baggrund i #EFF6FF med #0077C8 border-left
  Skygge: box-shadow: 0 2px 8px rgba(0,42,92,0.08), 0 0 0 1px rgba(0,42,92,0.06)
  Border-radius: 8px–12px

ANIMATIONER — staggeret delay:
  .card:nth-child(1) { animation: fadeUp 0.4s ease both; animation-delay: 0s; }
  .card:nth-child(2) { animation: fadeUp 0.4s ease both; animation-delay: 0.07s; }
  .card:nth-child(3) { animation: fadeUp 0.4s ease both; animation-delay: 0.14s; }
  (Fortsæt op til 8 elementer)

ACCENT-DETALJER — brug mindst 2 per visualisering:
  - Nummererede sections med stor muted baggrundscifre (10rem, opacity:0.04, position:absolute)
  - Tynde horisontale linjer (1px #0077C8, opacity:0.2) som section-dividers
  - Progress-bars i #0077C8 for procent-værdier (height:4px, border-radius:2px)
  - Person-initial-avatarer (32px cirkel, navy baggrund, hvid initial)
  - Status-chips: farvet baggrund + border-radius:999px + 0.65rem font

FORBUDT I IKKE-HMI:
  ✗ Plain hvide kort uden skygge eller farve-accent
  ✗ Generisk tabel uden typografisk hierarki
  ✗ Alle elementer samme størrelse (ingen visuel vægt)
  ✗ Manglende font-import (system-ui er FORBUDT for ikke-HMI)
  ✗ Ensformigt kortgrid (3 × N ens kort = FORBUDT)

━━━ LAYOUT QUALITY RULES — FOR NON-HMI TYPES (journey, workflow, pump, requirements, management, generic) ━━━
These rules prevent common visual defects in non-HMI visualizations. HMI dashboards follow the iSolutions spec above instead.

SPACING & CONTAINMENT:
  1. Root container: use max-width:1200px; margin:0 auto; padding:24px 32px; width:100%; box-sizing:border-box;
  2. Cards/panels: MINIMUM padding:16px. Never less.
  3. Grid gaps: MINIMUM gap:16px between cards. Never touching edges.
  4. Section spacing: margin-bottom:32px between major sections.
  5. Text never touches container edges — always has parent padding.

ALIGNMENT & GRID:
  6. Use CSS Grid or Flexbox for layouts — never absolute positioning for content blocks.
  7. Grid columns: use fr units or percentage, never fixed px widths that break on resize.
  8. All cards in a row MUST be equal height (use align-items:stretch or grid auto-rows).
  9. Center the entire visualization in the viewport — never left-aligned floating.

SIZING & READABILITY:
  10. Body text: minimum 0.85rem (never smaller).
  11. Headings: minimum 1.2rem for section headers.
  12. SVG diagrams: minimum 300px wide, use viewBox for scaling.
  13. Tables: width:100% with cell padding:10px 14px minimum.
  14. No text truncation or overflow:hidden on content text — always visible.

━━━ LAYOUT QUALITY RULES — FOR ALL TYPES (including HMI) ━━━
  15. Every card/panel must have a visible border, shadow, OR background contrast — never invisible containers.
  16. Color contrast: dark text on light bg or light text on dark bg — ALWAYS readable.
  17. No empty panels — every visible area has real content from the transcript.
  18. SVG arrow markers: ALWAYS define <defs><marker> before using marker-end.

ABSOLUTE PROHIBITIONS (ALL TYPES):
  ✗ Elements overlapping each other
  ✗ Content extending beyond viewport right edge (no horizontal scroll)
  ✗ Tiny cramped cards (< 120px any dimension)
  ✗ Orphan elements floating outside the grid structure
  ✗ White text on white/light background or dark text on dark background
  ✗ SVG elements with 0 width/height or missing viewBox
  ✗ Tables with columns too narrow to read (< 60px)

━━━ OUTPUT-KRAV ━━━
- Returnér KUN HTML: <style>/* al CSS */</style><div>/* indhold */</div>
- Brug én <style>-blok øverst til al CSS
- Responsive, primært til 16:9 widescreen (min-width: 800px)
- HMI: dark iSolutions-paletten (cyan #00c8ff på navy #0d1421)
- Ikke-HMI: Playfair + Outfit + dramatisk hierarki
- Brug KUN Unicode-symboler — aldrig emoji
- Texts in English (technical terms preserved)
- Minimum 100 linjer CSS, detaljerede værdier fra konteksten
- Inkludér altid disse keyframes i <style>:
    @keyframes ledAlarm { 0%,100%{opacity:1} 50%{opacity:.25} }
    @keyframes fadeIn   { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
    @keyframes fadeUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
    @keyframes spin     { to{transform:rotate(360deg)} }
- Footer: diskret "Generated by Meeting AI Visualizer · Grundfos" i muted farve, font-size:0.62rem

━━━ TOKEN BUDGET ━━━
Default target: up to 8192 tokens. For physical_product pump SVG visualizations: up to 12000 tokens is allowed (complex SVG templates require more space).
- CSS: reuse classes, no per-element overrides.
- HTML content: fill with real data from the transcript. Be generous with detail.
- No comments in generated HTML or CSS.
- For pump hardware: NEVER truncate or simplify the SVG template to save tokens — keep all gradients, filters, shadows.
- For non-pump types: if budget exceeded, simplify layout, reduce cards/panels, prioritise data richness over breadth.`;

const FILL_TAB_PANELS_SYSTEM = `You output ONLY a single JSON object. No markdown, no code fences, no explanation.
Shape: {"panels":{"<id>":"<inner HTML string>",...}}
Keys MUST exactly match the tab ids given in the user message.
Each value is inner HTML for that panel. No <style> blocks. Inline style= attributes are OK. No <script> blocks.
Use single quotes for HTML attributes inside the JSON strings.
Match the same industrial / Grundfos HMI tone as the main visualization (dark: #111827 panels, #00c8ff accents, monospace numbers, status LEDs).

CONTENT RULES — make each panel RICH and DOMAIN-SPECIFIC based on the tab label:
- Safety / Sikkerhed: alarm limits table (High/Low setpoints per parameter), emergency stop status, pressure relief valve state, SIL level if relevant, last alarm log, ATEX/IEC 62443 notes from transcript.
- Operation / Drift: live metrics grid (flow m³/h, pressure bar, speed RPM, power kW, efficiency %), START/STOP button, run-hours counter, current operating mode chip, trend mini-bar (last 6 values as inline SVG sparkline).
- Settings / Indstilling: setpoint inputs for flow and pressure, PID tuning fields (Kp/Ki/Kd), schedule table, save button with timed confirmation.
- Maintenance / Vedligehold: next service countdown, last service log table, bearing/seal/impeller wear indicators (0–100% progress bars), work order list.
- Energy / Energi: kWh today/week/month, IE class badge, CO₂ savings estimate, efficiency curve SVG, tariff period chips.
- Communications / Kommunikation: BACnet/Modbus/PROFINET status chips, IP address, last heartbeat timestamp, connected controllers list.
- History / Historik / Log: scrollable event log table (timestamp, event, value, operator), filterable by severity chip (INFO/WARN/ALARM).
- Overview / Oversigt: summary KPI tiles, status map if multiple pumps, decision/action items from transcript.
For any other label: extract the most relevant metrics, decisions, and actions from the transcript that belong to that category.
Fill ALL placeholder values with realistic data — no empty strings, no "—", no "N/A".`;

const ACTIONS_SYSTEM = `You analyze a meeting transcript and extract structured output. Return ONLY valid HTML — no markdown fences.

Generate a clean, scannable HTML document showing:
1. KEY DECISIONS (what was decided) — each as a card with: what was decided, who decided it (if mentioned), impact
2. ACTION ITEMS (what needs to happen) — each as a row with: task description, owner (if mentioned), deadline/priority (if mentioned)
3. OPEN QUESTIONS — things that were raised but not resolved

Design: light background (#f8fafc), navy (#002A5C) header strip, blue (#0077C8) accents.
Cards with subtle shadows. Color-code priorities: High=red, Medium=amber, Low=green.
Keep it concise — bullet points over long prose. If no decisions/actions found, say so clearly.
Footer: "Generated by Meeting AI Visualizer · Grundfos".`;

export interface VisualizerParams {
  transcript: string;
  vizType?: string | null;
  vizModel?: VizModel | null;
  title?: string | null;
  context?: string | null;
  previousHtml?: string | null;
  freshStart?: boolean;
  roomId?: string | null;
  resolvedFamily?: string | null;
  refinementDirective?: string | null;
}

/** Maps server-side family IDs to clear, unambiguous instructions for the AI */
const FAMILY_INSTRUCTIONS: Record<string, string> = {
  hmi_interface: `GENERATE: HMI / SCADA DASHBOARD — Grundfos iSolutions dark-theme interface.
Use the full HMI design language defined in the system prompt (dark navy backgrounds, cyan accents, tab navigation, gauge widgets, live value cards).
DO NOT use light backgrounds. DO NOT generate journey maps, flowcharts, or product illustrations.`,

  user_journey: `GENERATE: USER JOURNEY MAP — light background, swim lane layout.
Show phases across the top (e.g., Awareness → Onboarding → Use → Support → Renewal).
For each phase: actor touchpoints, emotions (emoji scale ☹→😐→😊→😍), pain points (red), opportunities (green).
Use Grundfos brand colours (#002A5C navy, #0077C8 blue). Clean, editorial layout with Google Fonts.
DO NOT use dark backgrounds, gauges, or pump hardware illustrations.`,

  workflow_process: `GENERATE: WORKFLOW / PROCESS DIAGRAM — clean, light-background flowchart.
Use SVG or HTML for flow: rectangles (process steps), diamonds (decisions), arrows, swim lanes if multiple actors.
Show clear start → process nodes → decision points → end states.
Use Grundfos colours, crisp lines, directional arrows, numbered steps.
DO NOT use dark HMI style. DO NOT generate journey maps or pump hardware.`,

  physical_product: `GENERATE: PHYSICAL PUMP HARDWARE ILLUSTRATION — photorealistic SVG product drawing.

YOU WILL RECEIVE COMPLETE SVG TEMPLATES BELOW. YOUR JOB:
1. IDENTIFY which product is discussed (CU controller, Alpha GO circulator, CR/CRE pump, etc.)
2. COPY the matching SVG template — it contains all gradients, shadows, filters, and structural detail
3. ADAPT values: change display readings, model name, LED states, button labels to match the transcript
4. EMBED the SVG inside a clean white (#F8FAFC) HTML page with:
   - Product title: font-family Outfit, 2rem, font-weight 700, color #002A5C
   - The SVG centered and large (at least 300px wide)
   - 3-4 spec cards around/below the SVG with parameters from the transcript
   - Callout annotations: SVG <line> elements from product parts to label text

CRITICAL QUALITY RULES:
  • NEVER simplify the SVG — keep ALL gradients, filters, shadows, highlight effects
  • NEVER replace detailed template elements with simple flat rectangles
  • The template SVG is your MINIMUM quality bar — you may ADD detail but never remove it
  • Each LED must have a highlight dot (small white circle, opacity 0.3)
  • Each button must have a gradient face (not flat fill)
  • The enclosure must have edge highlights and shadow filters
  • Display text must use monospace font with realistic readings
  • If the transcript mentions specific values (flow, pressure, RPM), show them on the display

DO NOT use dark HMI dashboard style. DO NOT generate journey maps or flowcharts.
The visualization MUST be dominated by the large, detailed SVG product illustration.`,

  requirements_matrix: `GENERATE: REQUIREMENTS TRACEABILITY MATRIX — structured table layout.
Columns: Req ID | Requirement | Priority (MoSCoW) | Source | Status | Notes.
Use colour-coding: Must=red, Should=amber, Could=green, Won't=grey.
Clean table with alternating row shading (#F8FAFC). Grundfos brand header.
DO NOT use dark backgrounds or pump illustrations.`,

  management_summary: `GENERATE: MANAGEMENT SUMMARY / TIMELINE — editorial, executive-level layout.
May include: horizontal Gantt/timeline SVG, decision log cards, KPI summary, risk register, roadmap phases.
Use dramatic typography hierarchy (Playfair Display for headings, Outfit for body), structured backgrounds.
Grundfos navy and blue accents. Print-ready proportions.
DO NOT use dark HMI style or pump hardware illustrations.`,

  persona_research: `GENERATE: PERSONA / RESEARCH INSIGHTS — editorial card-based layout.
Create a rich persona card or research insight summary. For PERSONAS: include a profile section (name, role, archetype, 
photo placeholder silhouette), demographics sidebar, goals & motivations (green), frustrations & pain points (red), 
behavioral patterns, a "Day in the Life" timeline, and a Jobs-to-be-Done section. For EMPATHY MAPS: 4-quadrant layout 
(Says, Thinks, Does, Feels) with the persona at center. For RESEARCH FINDINGS: structured insight cards with supporting 
quotes, thematic clusters, severity/frequency indicators, and actionable recommendations.
Use Grundfos brand colours (#002A5C navy, #0077C8 blue), clean editorial layout, Google Fonts.
Light background. Professional UX research deliverable quality.
DO NOT use dark HMI backgrounds, gauges, or pump hardware.`,

  service_blueprint: `GENERATE: SERVICE BLUEPRINT / EXPERIENCE ARCHITECTURE — layered horizontal diagram.
Create a structured service design artifact. For SERVICE BLUEPRINTS: horizontal swim-lane layout with layers: 
Customer Actions (top), Frontstage (visible touchpoints), Line of Visibility (dashed), Backstage Processes, 
Support Processes (bottom). Show time progression left-to-right, vertical connections between layers, 
evidence items at each touchpoint. For INFORMATION ARCHITECTURE: hierarchical sitemap/tree diagram showing 
navigation structure, content grouping, and page relationships. For ECOSYSTEM/STAKEHOLDER MAPS: radial or 
network diagram showing actors, relationships, data flows, and system integrations.
Use Grundfos brand colours, clean lines, clear layer separations with distinct background tints.
Light background. DO NOT use dark HMI style.`,

  comparison_evaluation: `GENERATE: COMPARISON / EVALUATION MATRIX — structured analytical layout.
Create a professional comparison or evaluation artifact. For COMPARISON MATRICES: table with options as 
columns, criteria as rows, colour-coded scoring (green=strong, amber=moderate, red=weak), weighted totals 
at bottom. For SWOT ANALYSIS: 2×2 grid (Strengths green, Weaknesses red, Opportunities blue, Threats amber) 
with bullet points in each quadrant and a strategic summary. For PRIORITIZATION: 2D scatter plot or matrix 
(Impact vs Effort, Value vs Complexity) with items positioned as labeled circles, quadrant labels 
(Quick Wins, Strategic Bets, Fill-Ins, Deprioritize). For SCORECARDS: radar/spider chart or weighted 
scoring table with visual indicators.
Use Grundfos brand colours, professional analytical layout, Google Fonts.
Light background. DO NOT use dark HMI style.`,

  design_system: `GENERATE: DESIGN SYSTEM / COMPONENT SPECIFICATION — technical documentation layout.
Create a professional design system deliverable. For COMPONENT SPECS: show component anatomy (labeled diagram), 
all states (default, hover, active, disabled, error), sizing variants (S/M/L), spacing rules with pixel 
annotations, and prop/API table. For DESIGN TOKENS: organized sections for Color Palette (swatches with 
hex/RGB values, semantic naming), Typography Scale (font samples at each size), Spacing Scale (visual ruler), 
Border Radius, Shadows, and Breakpoints. For STYLE GUIDES: brand colour usage, typography hierarchy, 
iconography samples, do/don't examples side by side. For DESIGN PRINCIPLES: numbered principle cards with 
title, description, and visual "Do" vs "Don't" example pairs.
Use clean, technical documentation style. Grid-aligned. Code-adjacent feel.
Light background with subtle grid. DO NOT use dark HMI style.`,

  generic: `GENERATE: The most appropriate visualization type based on the transcript content.
Read the transcript carefully and choose the best format: HMI dashboard, user journey, workflow/flowchart, 
pump hardware, persona/empathy map, service blueprint, comparison/evaluation matrix, design system spec, 
timeline/roadmap, kanban, or decision log.
Commit fully to one type — do not mix styles.`,
};

export async function* streamVisualization(
  params: VisualizerParams,
  onChunk: (chunk: string) => void
): AsyncGenerator<string> {
  const { transcript, vizType, vizModel, title, context, previousHtml, freshStart, resolvedFamily, refinementDirective } = params;

  const model = MODEL_IDS[vizModel ?? "haiku"];
  const isPump = resolvedFamily === "physical_product";
  const maxTokens = isPump
    ? MAX_TOKENS_PUMP[vizModel ?? "haiku"]
    : MAX_TOKENS[vizModel ?? "haiku"];

  const transcriptForModel = truncateTranscript(transcript);

  const isIncremental = !freshStart && !!previousHtml && previousHtml.trim().length > 80;

  let userMessage = "";
  if (title) userMessage += `Meeting title: ${title}\n\n`;
  if (context) userMessage += `MEETING CONTEXT:\n${context}\n\n`;

  if (resolvedFamily && FAMILY_INSTRUCTIONS[resolvedFamily]) {
    const source = (vizType && vizType !== "auto") ? "USER-SELECTED TYPE" : "SERVER CLASSIFICATION (high confidence)";
    userMessage += `⚡ ${source} — follow these instructions exactly:\n${FAMILY_INSTRUCTIONS[resolvedFamily]}\n\n`;
  } else if (vizType && vizType !== "auto") {
    userMessage += `⚡ USER-SELECTED TYPE: Generate SPECIFICALLY this visualization type — nothing else: ${vizType}\n\n`;
  }

  if (isPump) {
    userMessage += `${PUMP_TEMPLATE_INSTRUCTIONS}\n\n`;
    userMessage += `=== CU CONTROLLER TEMPLATE ===\n${CU_CONTROLLER_TEMPLATE}\n\n`;
    userMessage += `=== ALPHA GO CIRCULATOR TEMPLATE ===\n${ALPHA_GO_TEMPLATE}\n\n`;
    userMessage += `=== CR/CRE MULTISTAGE PUMP TEMPLATE ===\n${CR_PUMP_TEMPLATE}\n\n`;
  }

  userMessage += `Here is the meeting transcript:\n\n${transcriptForModel}\n\n`;

  if (isIncremental && previousHtml) {
    const { snippet, truncated } = truncatePreviousViz(previousHtml);
    const tail = truncated
      ? "\n\n[Prior HTML was compressed — preserve and extend the structure you already established.]\n\n"
      : "\n\n";

    if (refinementDirective) {
      userMessage +=
        `🎯 REFINEMENT MODE — THE USER SPOKE A SPECIFIC MODIFICATION REQUEST:
The participants are directing you to modify the existing visualization in a specific way.
Their spoken instructions have been parsed into these directives:

${refinementDirective}

CRITICAL RULES FOR REFINEMENT:
1. KEEP the existing visualization layout, style, and type EXACTLY — do not regenerate from scratch
2. APPLY the directives above as precise, surgical modifications to the existing HTML
3. PRESERVE all existing content unless the directive explicitly says to remove something
4. The directive takes HIGHEST PRIORITY — it represents what the user explicitly asked for
5. Also incorporate any new information from the latest transcript, but the directive comes first
6. If the directive says "zoom in" or "focus on" something, make that element the visual hero (larger, more detailed, more prominent) while keeping the rest as supporting context

CURRENT VISUALIZATION (modify this — do not discard):
${snippet}${tail}`;
    } else {
      userMessage +=
        `INCREMENTAL UPDATE — CRITICAL RULES:
The meeting has continued since the last visualization was generated.
The server has ALREADY verified that the topic has NOT changed — do NOT second-guess this.
You MUST keep the existing layout structure, visual style, and type. Then ENHANCE it:
  a) ADD new data: insert new cards, rows, nodes, or panels with information from the newest transcript segments
  b) REFINE existing content: update values, add missing details, correct inaccuracies based on newer discussion
  c) ENRICH visuals: add more detail to SVG diagrams, fill in placeholder values, expand abbreviated sections
  d) EXTEND sections: if the discussion deepened a subtopic, expand that section with more granular content
  e) PRESERVE structure: keep the same CSS classes, color scheme, grid layout, and component hierarchy

WHAT "INCREMENTAL" MEANS — CONCRETE EXAMPLES:
  • HMI dashboard: add new metric cards, update gauge values, populate empty tab panels with real data
  • User journey: add new touchpoints, extend phases, add newly discussed pain points or opportunities
  • Workflow: add new process steps, decision nodes, or swim lane actors mentioned in newer speech
  • Requirements: add new rows to the table, update priority/status columns, add newly discussed specs
  • Timeline: extend the timeline with new milestones, update phase durations, add new decision entries
  • Pump hardware: add newly discussed specs to the callout labels, update operating parameters
  • Persona/research: add new quotes, expand needs/frustrations, add newly discovered behavioral patterns
  • Service blueprint: add new touchpoints, extend layers, add backstage processes mentioned in discussion
  • Comparison/evaluation: add new criteria rows, update scores, add newly discussed options or dimensions
  • Design system: add new component variants, expand token tables, add newly discussed states or rules

DO NOT:
  ✗ Regenerate from scratch when the topic hasn't changed
  ✗ Remove existing content that is still relevant
  ✗ Change the visualization type unless the conversation CLEARLY shifted
  ✗ Simplify or reduce detail — always add, never subtract

CURRENT VISUALIZATION (reference — keep and improve when topic is the same):
${snippet}${tail}`;
    }
  }

  userMessage += "Generate the HTML visualization now.";

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  let fullText = "";

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const chunk = event.delta.text;
      fullText += chunk;
      onChunk(chunk);
      yield chunk;
    }
  }

  return fullText;
}

export async function fillTabPanels(
  transcript: string,
  tabs: Array<{ id: string; label: string }>,
  title?: string | null,
  context?: string | null
): Promise<Record<string, string>> {
  const transcriptForModel = truncateTranscript(transcript);
  const tabLines = tabs.map(t => `- id "${t.id}" — label: ${t.label || "section"}`).join("\n");

  let userMsg = "";
  if (title) userMsg += `Meeting title: ${title}\n\n`;
  if (context) userMsg += `MEETING CONTEXT:\n${context}\n\n`;
  userMsg +=
    `TRANSCRIPT:\n${transcriptForModel}\n\n` +
    `Fill these dashboard tab panels with substantive content from the transcript.\n\n${tabLines}\n\n` +
    `Return ONLY JSON: {"panels":{"<id>":"<inner HTML>",...}} with keys exactly matching each id above.`;

  const response = await client.messages.create({
    model: MODEL_IDS.haiku,
    max_tokens: 3500,
    system: FILL_TAB_PANELS_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const block = response.content.find((c) => c.type === "text");
  const rawOut = block?.type === "text" ? block.text : "";

  try {
    const t = rawOut.trim();
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    const inner = m ? m[1].trim() : t;
    const obj = JSON.parse(inner);
    return obj.panels || {};
  } catch {
    return {};
  }
}

export async function* streamActions(
  transcript: string,
  title?: string | null,
  context?: string | null,
  onChunk?: (chunk: string) => void
): AsyncGenerator<string> {
  let userMsg = "";
  if (title) userMsg += `Meeting title: ${title}\n\n`;
  if (context) userMsg += `MEETING CONTEXT:\n${context}\n\n`;
  userMsg += `TRANSCRIPT:\n${truncateTranscript(transcript)}\n\nExtract decisions, action items, and open questions.`;

  const stream = client.messages.stream({
    model: MODEL_IDS.haiku,
    max_tokens: 2000,
    system: ACTIONS_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const chunk = event.delta.text;
      onChunk?.(chunk);
      yield chunk;
    }
  }
}

export function isHtmlQualityOk(html: string): boolean {
  if (!html || html.length < 200) return false;
  if (!html.includes("<") || !html.includes(">")) return false;
  return true;
}
