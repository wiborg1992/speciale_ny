import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import {
  CU_CONTROLLER_TEMPLATE,
  ALPHA_GO_TEMPLATE,
  CR_PUMP_TEMPLATE,
  PUMP_TEMPLATE_INSTRUCTIONS,
} from "./pump-svg-templates.js";
import {
  adaptAuxiliarySystemPrompt,
  adaptSystemPromptForDomain,
  brandNameForDomain,
  normalizeWorkspaceDomain,
  type WorkspaceDomain,
} from "./workspace-domain.js";
import type { MeetingEssenceForPrompt } from "./meeting-essence.js";

const client = new Anthropic();

let _openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI | null {
  if (_openaiClient) return _openaiClient;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseURL || !apiKey) return null;
  _openaiClient = new OpenAI({ apiKey, baseURL });
  return _openaiClient;
}

let _geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (_geminiClient) return _geminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _geminiClient = new GoogleGenAI({ apiKey });
  return _geminiClient;
}

export type VizModel =
  | "haiku"
  | "sonnet"
  | "opus"
  | "gemini-flash"
  | "gemini-pro";

const MODEL_IDS: Record<VizModel, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  "gemini-flash": "gemini-2.5-flash",
  "gemini-pro": "gemini-2.5-pro",
};

const GEMINI_MODELS = new Set<VizModel>(["gemini-flash", "gemini-pro"]);

const OPENAI_FALLBACK_MODEL = "gpt-4o";

const MAX_TOKENS: Record<VizModel, number> = {
  haiku: 8192,
  sonnet: 8192,
  opus: 8192,
  "gemini-flash": 8192,
  "gemini-pro": 8192,
};

const MAX_TOKENS_PUMP: Record<VizModel, number> = {
  haiku: 8192,
  sonnet: 10000,
  opus: 12000,
  "gemini-flash": 8192,
  "gemini-pro": 12000,
};

/** Sekundær appendix — stadig cap'et, men FOKUS-sektionen er primær (seneste ord). */
const MAX_TRANSCRIPT_CHARS = 72_000;
const MAX_PREV_VIZ_CHARS = 70_000;
/** Matcher klassifikatorens tail — "hvad driver figuren nu" */
const PRIMARY_FOCUS_WORDS = 280;

function sliceTailWords(text: string, wordCount: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= wordCount) return text.trim();
  return words.slice(-wordCount).join(" ");
}

function truncateTranscript(transcript: string): string {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript;
  const keep = MAX_TRANSCRIPT_CHARS - 220;
  const omitted = transcript.length - keep;
  return `[Note: ${omitted} characters of earlier transcript were omitted for speed — use the rest as the meeting context.]\n\n${transcript.slice(-keep)}`;
}

function truncatePreviousViz(html: string): {
  snippet: string;
  truncated: boolean;
} {
  if (html.length <= MAX_PREV_VIZ_CHARS)
    return { snippet: html, truncated: false };
  const budget = MAX_PREV_VIZ_CHARS - 240;
  const headChars = Math.floor(budget * 0.48);
  const tailChars = budget - headChars;
  const omitted = html.length - headChars - tailChars;
  const snippet = `${html.slice(0, headChars)}\n\n[... ${omitted} characters of HTML omitted from the middle — preserve layout from the head and extend consistently.]\n\n${html.slice(-tailChars)}`;
  return { snippet, truncated: true };
}

const SYSTEM_PROMPT_GRUNDFOS = `You are an expert at analysing meeting transcripts from Grundfos and generating the single most appropriate professional HTML visualisation for the participants.

Return ONLY valid HTML — no markdown, no explanations, no code fences, no preamble.
Your first character MUST be '<' and your last character MUST be '>'.

━━━ RULE 0: DEFAULT OUTPUT IS A VISUAL PROTOTYPE — NOT MEETING NOTES OR DICTATION ━━━
This product is Meeting AI **Visualizer**: participants expect a **designed visual working prototype** they can read at a glance — dashboard, diagram, card grid, timeline, HMI panels, journey map, workflow, table, etc.
  ABSOLUTELY AVOID as the main deliverable:
  • "Meeting minutes" / referat / recap pages whose primary content is polished prose or bullet lists that merely restate what was said (dictation dressed up with typography)
  • Long text columns with no structural UI: no cards, no grid, no SVG figure, no table, no dashboard chrome, no swim lanes — even if it looks "beautiful", that is the WRONG output for this tool
  • ⛔ A "Notes", "Observations", "AI notes", "Meeting notes", or any plain-text append section BELOW the visualization — this is NEVER acceptable even as a secondary element. If you cannot fit new information into the existing visual structure, create a NEW card, tile, or panel for it instead.
  YOU MUST:
  • Include at least one strong **visual structure**: CSS Grid/Flex **cards**, **SVG** flow/timeline/journey, **table** with real columns, **dashboard** regions/KPI tiles, **HMI-style** widgets, journey **swim lanes**, or similar — filled with content *inferred from* the transcript, not copy-pasted as running speech
  • If the transcript is thin or vague: still ship a credible **prototype** with clearly labeled placeholders — it must remain visibly a UI/diagram artifact, not a note page
  • Prefer interactive-feeling layout (tabs, sections, metric tiles) over essay layout; text belongs *inside* structured components
  • ⚡ MANDATORY FULL INTERACTIVITY — ZERO DEAD ZONES: Every element that **looks** interactive MUST actually work in the browser. Concretely: (1) every tab bar switches visible content on click via JavaScript, (2) every form input accepts keystrokes and every save/apply/submit button gives visual feedback ("Saved ✓", button color change) via JS, (3) every checkbox toggles its checked state and updates any linked counter or summary, (4) every filter chip, dropdown, or search field hides/shows the rows or cards it targets, (5) every navigation item reveals the correct section. The minimum is ALL interactive-looking elements have JavaScript event handlers — not "at least one script block". Static decorative tabs, dead filter chips, or forms that do nothing on click are NEVER acceptable.
  • ALL transcript content — including spoken UI change requests, button changes, layout feedback — must be incorporated INTO the visualization as actual visual changes (new/updated components, revised labels, changed layouts), NEVER as a text note appended below.
  Dense editorial layouts (management summary, decision log) are allowed when the type calls for it — but they MUST still use **structured sections** (KPI row, timeline bar, decision **cards**, owner chips) — never a plain "notepad" aesthetic.

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
  • Footer: Generated by Meeting AI Visualizer

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

GOLDEN RULE: Every element that looks interactive MUST be interactive — no dead zones, no decorative controls.
End every visualization with a single inline <script> IIFE that wires all patterns you used.

─── A) TABS — USE FOR ALL VISUALIZATION FAMILIES ───
Any tab strip (period tabs, section tabs, sub-panels) in ANY family must use JavaScript, not CSS-only radio tricks.

HTML structure (use string IDs, not integers, for readability):
  <div data-viz-host-tabs="1">
    <div role="tablist" class="(your tab strip class)">
      <button type="button" role="tab" data-viz-tab="overview" aria-selected="true" class="viz-tab-active (your class)">Overview</button>
      <button type="button" role="tab" data-viz-tab="details" aria-selected="false" class="(your class)">Details</button>
    </div>
    <section data-viz-tab-panel="overview" style="display:block">...FULL content...</section>
    <section data-viz-tab-panel="details" style="display:none" hidden>...FULL content...</section>
  </div>

Rules: data-viz-tab value MUST equal data-viz-tab-panel value. First panel: style="display:block", no hidden. All other panels: style="display:none" AND hidden (both). All panels FULLY rendered — no lazy placeholders for non-HMI families. Multiple tab hosts on one page are fine.

Tab script (include once, handles ALL [data-viz-host-tabs] on the page):
  <script>(function(){document.querySelectorAll('[data-viz-host-tabs]').forEach(function(host){host.querySelectorAll('[role="tab"]').forEach(function(tab){tab.addEventListener('click',function(){var id=tab.getAttribute('data-viz-tab');host.querySelectorAll('[role="tab"]').forEach(function(t){t.setAttribute('aria-selected',t===tab?'true':'false');t.classList.toggle('viz-tab-active',t===tab);});host.querySelectorAll('[data-viz-tab-panel]').forEach(function(p){var show=p.getAttribute('data-viz-tab-panel')===id;p.style.display=show?'block':'none';if(show){p.removeAttribute('hidden');}else{p.setAttribute('hidden','');}});});});});})()</script>

─── B) HMI LAZY TABS (hmi_interface family only) ───
Same HTML + script as A, but add data-viz-lazy-tabs="1" to the host and make non-first panels lazy:
  <section data-viz-tab-panel="safety" style="display:none" hidden data-viz-pending="1" data-viz-tab-label="Safety">
    <p style="color:#a8b8cc;padding:1rem">Loading…</p>
  </section>
The tab script above already handles lazy panels; the iframe host fills them on first open.

─── C) NAV MENUS / SIDEBARS (section switching) ───
Wrap nav + sections together in a data-viz-nav-root so multiple nav groups on one page never interfere.

HTML:
  <div data-viz-nav-root>
    <nav data-viz-nav>
      <a href="#" data-viz-nav-item="overview" class="viz-nav-active">Overview</a>
      <a href="#" data-viz-nav-item="analysis">Analysis</a>
    </nav>
    <section data-viz-section="overview" style="display:block">...full content...</section>
    <section data-viz-section="analysis" style="display:none" hidden>...full content...</section>
  </div>

Script snippet (sections scoped to the nearest [data-viz-nav-root], no global collision):
  document.querySelectorAll('[data-viz-nav]').forEach(function(nav){var root=nav.closest('[data-viz-nav-root]')||nav.parentElement;nav.querySelectorAll('[data-viz-nav-item]').forEach(function(link){link.addEventListener('click',function(e){e.preventDefault();var id=link.getAttribute('data-viz-nav-item');nav.querySelectorAll('[data-viz-nav-item]').forEach(function(l){l.classList.toggle('viz-nav-active',l===link);});root.querySelectorAll('[data-viz-section]').forEach(function(s){var show=s.getAttribute('data-viz-section')===id;s.style.display=show?'block':'none';if(show){s.removeAttribute('hidden');}else{s.setAttribute('hidden','');}});});});});

─── D) FILTER CHIPS (filterable tables, card grids, lists) ───
HTML:
  <div data-viz-filter-host>
    <button type="button" data-viz-filter="all" class="viz-filter-active">All</button>
    <button type="button" data-viz-filter="must">Must</button>
    <button type="button" data-viz-filter="should">Should</button>
  </div>
  Rows/cards: <tr data-viz-row-cat="must">…</tr>   or   <div data-viz-row-cat="must">…</div>

Script snippet:
  document.querySelectorAll('[data-viz-filter-host]').forEach(function(host){host.querySelectorAll('[data-viz-filter]').forEach(function(chip){chip.addEventListener('click',function(){var cat=chip.getAttribute('data-viz-filter');host.querySelectorAll('[data-viz-filter]').forEach(function(c){c.classList.toggle('viz-filter-active',c===chip);});host.querySelectorAll('[data-viz-row-cat]').forEach(function(row){row.style.display=(cat==='all'||row.getAttribute('data-viz-row-cat')===cat)?'':'none';});});});});

─── E) FORMS & SAVE / APPLY BUTTONS ───
Standard <input>, <textarea>, <select> accept user input natively — no extra JS needed.
Save/Apply buttons MUST give visual feedback:
  <button type="button" data-viz-save>Save</button>   (optional: data-viz-save-label="Applied ✓")

Script snippet:
  document.querySelectorAll('[data-viz-save]').forEach(function(btn){btn.addEventListener('click',function(){var label=btn.getAttribute('data-viz-save-label')||'Saved \u2713';var orig=btn.textContent;var origBg=btn.style.background;btn.textContent=label;btn.style.background='#16a34a';btn.style.color='#fff';setTimeout(function(){btn.textContent=orig;btn.style.background=origBg;btn.style.color='';},2000);});});

─── F) CHECKBOXES ───
<span role="checkbox" aria-checked="false" tabindex="0" data-viz-checkbox class="(your class)">☐</span>

Script snippet:
  document.querySelectorAll('[data-viz-checkbox]').forEach(function(box){function toggle(){var checked=box.getAttribute('aria-checked')==='true';box.setAttribute('aria-checked',checked?'false':'true');box.textContent=checked?'\u2610':'\u2611';box.closest('[data-viz-check-row]')&&box.closest('[data-viz-check-row]').classList.toggle('viz-checked',!checked);}box.addEventListener('click',toggle);box.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();toggle();}});});

─── G) TOGGLES / EXPAND-COLLAPSE ───
<button type="button" data-viz-toggle="#my-panel">Show details ▾</button>
<div id="my-panel" style="display:none">...content...</div>

Script snippet:
  document.querySelectorAll('[data-viz-toggle]').forEach(function(btn){btn.addEventListener('click',function(){var target=document.querySelector(btn.getAttribute('data-viz-toggle'));if(!target)return;var open=target.style.display!=='none';target.style.display=open?'none':'block';});});

─── H) COLLAPSIBLE SECTIONS ───
<details><summary>Section title</summary>...content...</details>
Native HTML — no script needed.

─── I) STATEFUL CONTROLS (pump panels) ───
START/STOP buttons: toggle a running CSS class on the panel and flip button text/color.
MODE selector: onChange swaps panel visual state and updates a mode badge.
ALARM ACK: click removes the alarm indicator class and disables the button.

─── J) LOGIN FLOW ───
When transcript mentions login/onboarding: show a login form. Clicking "Sign in" hides #login-screen, reveals #dashboard. Any password accepted in prototype mode (or validate one fixed demo credential).

─── K) HOVER — always ───
All clickable elements: cursor:pointer in CSS + :hover state (color, background, or shadow change).

SCRIPT RULES: No external scripts except Chart.js (cdn.jsdelivr.net) for charts with inline data only. No fetch/XHR. No alert()/confirm(). No eval(). Combine all patterns into one IIFE at end of <body>.

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
- Footer: diskret "Generated by Meeting AI Visualizer" i muted farve, font-size:0.62rem

━━━ TOKEN BUDGET ━━━
Default target: up to 8192 tokens. For physical_product pump SVG visualizations: up to 12000 tokens is allowed (complex SVG templates require more space).
- CSS: reuse classes, no per-element overrides.
- HTML content: fill with real data from the transcript. Be generous with detail.
- No comments in generated HTML or CSS.
- For pump hardware: NEVER truncate or simplify the SVG template to save tokens — keep all gradients, filters, shadows.
- For non-pump types: if budget exceeded, simplify layout, reduce cards/panels, prioritise data richness over breadth.`;

const FILL_TAB_PANELS_SYSTEM_BASE = `You output ONLY a single JSON object. No markdown, no code fences, no explanation.
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

/** Forklaring-fanen: ren tekst til almen læser (ikke mødereferat). */
const REASONING_NARRATIVE_SYSTEM_BASE = `Du skriver udelukkende på dansk.

ABSOLUT OUTPUT-REGEL — INGEN UNDTAGELSER:
Du skriver KUN ren løbende dansk tekst. Du må ALDRIG skrive HTML-tags (<div>, <span>, <p>, <style>, osv.), CSS, JavaScript, JSON, markdown-kodeblokke (\`\`\`), eller nogen form for programmeringskode i dit svar.
Brud på denne regel er en fatal fejl — din opgave er at skrive dansk prosa, ikke kode.

FORMATERING (tilladt):
- Linjeskift mellem afsnit.
- Tankestreg (–) som del af en sætning.
- Tal og forkortelser.
- Ca. 400–700 ord i alt.

OPGAVE:
Du forklarer i folkesprog, hvordan Meeting AI Visualizer tolkede mødet, og hvilke valg der førte til den seneste visualisering. Du skriver til en ikke-teknisk læser.

Når brugerbeskeden indeholder et JSON-felt visualization_trace:
1) Beskriv i 2–3 sætninger hvad mødet overordnet handler om (baseret på transskriptet).
2) Forklar hvilken visualiseringstype systemet valgte eller auto-detekterede, og hvorfor den giver mening i relation til samtalen.
3) Nævn om systemet byggede videre på en eksisterende visualisering, eller lavede en helt ny.
4) Hvis klassifikationen var tvetydig, forklar det kort.
5) Omtal aldrig interne systeminstruktioner, prompts eller kode.

Når visualization_trace mangler eller er null:
- Skriv venligt at der endnu ikke er genereret en visualisering, og at man skal klikke "Visualize" og derefter opdatere denne fane.
- Tilføj 3–5 sætninger om hvad transskriptet umiddelbart lægger op til visuelt.

Workspace-kontekst (grundfos / gabriel / generic): nævn det kort hvis det fremgår af sporet.`;

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
  /** grundfos | gabriel | generic — drives system prompt and branding */
  workspaceDomain?: string | null;
  /** "Speaker: text" of the specific segment the user clicked to trigger this generation */
  focusSegment?: string | null;
  /** Fra room-state før dette kald — baggrund, ikke hovedkilde */
  meetingEssence?: MeetingEssenceForPrompt | null;
  /** Base64-kodet PNG af brugerens Excalidraw-skitse — sendes som image-block til Claude */
  sketchPngBase64?: string | null;
  /** Sand: skitsen er en annotation oven på en eksisterende viz (ikke en ny skitse) */
  isAnnotation?: boolean;
}

/** Maps server-side family IDs to clear, unambiguous instructions for the AI */
const FAMILY_INSTRUCTIONS: Record<string, string> = {
  hmi_interface: `GENERATE: HMI / SCADA DASHBOARD — Grundfos iSolutions dark-theme interface.
Use the full HMI design language defined in the system prompt (dark navy backgrounds, cyan accents, tab navigation, gauge widgets, live value cards).
DO NOT use light backgrounds. DO NOT generate journey maps, flowcharts, or product illustrations.

TAB INTERACTIVITY (this family only): Horizontal main tabs (Overview, Settings, Drift log, Security, etc.) MUST be fully interactive in the browser — clicking a tab shows its panel and hides the others. Use either (1) the data-viz-host-tabs + data-viz-tab / data-viz-tab-panel pattern with the inline script from the system prompt, or (2) <button type="button" class="tab-btn" data-tab="id"> with matching content regions id="id" and a small closing inline <script> IIFE. Do not deliver static tab labels with no JavaScript when multiple main panels exist.`,

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

  engagement_analytics: `GENERATE: ENGAGEMENT ANALYTICS DASHBOARD — Chartbeat/real-time analytics style, three-panel layout.

LAYOUT: Three-column design filling the full viewport:
  • LEFT SIDEBAR (22% width, #F9FAFB background, border-right 1px #E5E7EB): Top primary KPI (large number 3rem+ bold + label, e.g. "284 Concurrents"), 2–3 secondary KPIs with labeled inline progress bars (Recirculation %, Engaged Time mm:ss). Below: labeled checkbox filter groups — Subscribers (Guest/Subscriber/Registered/Unspecified), Visitor Frequency (New/Returning/Loyal/Unclassified), Device (Mobile/Desktop/Tablet). Each filter group has a small bold heading.
  • CENTER PANEL (54% width, white): Stacked area/line chart in top third with tab navigation TODAY / 7-DAY / 30-DAY — ALL tabs functional JS. Chart uses Chart.js from cdn.jsdelivr.net/npm/chart.js with inline dataset arrays (no fetch). Below chart: article/content table with columns "Concurrents ↕ | Title | Engaged Time | Pageviews" — clicking column headers re-sorts the table asc/desc with ▲/▼ indicator. Row hover: #F0F9FF highlight. Table rows are data-viz-row-cat attributed for filter integration.
  • RIGHT PANEL (24% width, #F9FAFB, border-left 1px #E5E7EB): "Traffic" section heading + "by Source" toggle label. Horizontal bar rows: source name | colored bar | percentage (Internal=teal, Direct=coral/orange, Search=green, Social=purple, Links/Other=gray). Separator. "Referrers" section: list of referrer domains with numeric counts right-aligned.

INTERACTIVITY — ALL FOUR REQUIRED:
  1. TODAY / 7-DAY / 30-DAY tabs: clicking switches Chart.js dataset to pre-defined inline arrays for that range; active tab gets border-bottom accent style.
  2. Sidebar checkboxes: checking/unchecking any filter updates which table rows are visible (filter by data-viz-row-cat attribute on each row).
  3. Column sort: clicking a <th> cycles asc/desc; updates visible rows order and shows ▲ / ▼.
  4. Row hover highlight via CSS :hover or JS mouseenter.

COLORS: Editorial neutral — white center, #F9FAFB sidebars, #2D6A4F or #0D9488 accent (deep green/teal), #374151 primary text, #6B7280 secondary text, #E5E7EB borders. No purple/blue gradients. Traffic bars each get a distinct muted color (not all the same).
TYPOGRAPHY: font-variant-numeric: tabular-nums on all KPI numbers. Section headings: Playfair Display or Georgia serif 1rem bold. Data rows: Inter or system-sans 13–14px.
CHART: Stacked area chart, 4–5 colored series matching Traffic panel colors. X-axis: time labels (hours for TODAY, days for 7-DAY/30-DAY). Y-axis: concurrent count. Use placeholder coherent data when transcript lacks specifics; add a discreet "Example data" footnote beneath chart.
DATA: Extract all engagement figures, traffic sources, article/content titles, time ranges from the transcript. When the meeting is conceptual or lacks exact figures, use plausible round-number placeholders so the dashboard reads as a convincing preview.

DO NOT use dark HMI backgrounds. DO NOT use pump/hardware templates. DO NOT generate a plain bullet-list summary.`,

  ux_prototype: `GENERATE: CLICKABLE MULTI-SCREEN UX PROTOTYPE — navigable interactive mockup.

Build 2–4 distinct screens (views/states) based on what the transcript describes. Show ONE screen at a time; JavaScript manages all navigation.

SCREEN STRUCTURE (mandatory):
  • Each screen occupies the full viewport — only one is visible at a time (others: display:none)
  • Every screen has a persistent top navigation bar or header showing: product/app name + current screen label (e.g. "2 / 3 — Detail View")
  • Navigation elements (buttons, nav items, cards, CTAs, links) MUST transition to the next logical screen when clicked
  • Every screen except the first MUST have a clearly visible "← Back" or "← Home" button
  • Screen transitions: use CSS opacity + transform fade (0.25s) for polished feel

SCREENS TO GENERATE based on transcript:
  • Derive screen names and content from what's discussed. If the meeting describes an app flow, generate those exact screens. If conceptual, use coherent placeholder screens appropriate to the product type.
  • Label each screen meaningfully: e.g. Home → Product List → Detail → Checkout, or Dashboard → Settings → Profile, etc.

JAVASCRIPT — one trailing inline IIFE:
  const screens = document.querySelectorAll('[data-screen]');
  function showScreen(id) {
    screens.forEach(s => { s.style.opacity='0'; setTimeout(()=>s.style.display='none',200); });
    const target = document.querySelector('[data-screen="'+id+'"]');
    target.style.display='block'; setTimeout(()=>target.style.opacity='1',20);
  }
  document.querySelectorAll('[data-go]').forEach(btn =>
    btn.addEventListener('click', () => showScreen(btn.dataset.go))
  );
  showScreen('screen-1'); // show first screen on load

INTERACTIVITY within each screen:
  • Buttons, form fields, toggles, checkboxes should respond to clicks even if just visually (hover states, active states)
  • At least one navigation action per screen must work (takes user to another screen)
  • Use data-go="screen-id" on any clickable element that should navigate

VISUAL STYLE:
  • Mobile-app or web-app feel: clean white/light background, rounded corners, drop shadows on cards
  • Consistent top navigation bar across all screens
  • Typography: Inter or Outfit 14–16px body, clear hierarchy
  • Single accent colour derived from transcript context

DO NOT generate a static dashboard with no navigation. DO NOT use dark HMI chrome. DO NOT generate pump hardware.`,

  generic: `GENERATE: STRUCTURED OVERVIEW — card-grid or section-header layout.
The user has explicitly requested no specific diagram type. Your output must still be a VISUAL STRUCTURE — never a plain notepad or bullet wall.

REQUIRED STRUCTURE:
  • 3–4 named sections with clear headings reflecting actual meeting topics
  • Each section: white card (#FFFFFF) on #F8FAFC background, 1px border (#E2E8F0), 12–16px border-radius
  • Within each card: short bullet points or a mini-table — never running prose
  • Use a single accent colour derived from the transcript context (default: #0077C8)
  • Typography: Outfit or Inter, body 14–15px, headings 18–20px bold
  • No fixed diagram shape (no swimlanes, no flowchart arrows, no SVG hardware)

ABSOLUTELY NOT ALLOWED:
  ✗ "Meeting notes" or "Observations" heading
  ✗ Bullet list of everything that was said, in order
  ✗ Plain <ul>/<li> without card structure
  ✗ Fake polish: dark gradient background with white prose text`,
};

function systemPromptForDomain(domain: WorkspaceDomain): string {
  return adaptSystemPromptForDomain(SYSTEM_PROMPT_GRUNDFOS, domain);
}

function familyInstructionForDomain(
  family: string,
  domain: WorkspaceDomain,
): string | undefined {
  const base = FAMILY_INSTRUCTIONS[family];
  if (!base) return undefined;
  if (domain === "grundfos") return base;

  const bn = brandNameForDomain(domain);
  const text = base.replace(/Grundfos/g, bn);

  if (family === "physical_product") {
    if (domain === "gabriel") {
      return `GENERATE: DATA-FIRST VISUAL BOARD — charts, KPI tiles, and legible tables. Use stated figures when the transcript supplies them; if the meeting is about **how** to visualise (layout, chart types, dashboard concepts) without concrete numbers, populate with **coherent example / placeholder values** and a small "Example data" cue. Optional modest illustration only if the talk is truly about a physical sample or asset. SoMe, links, or campaigns: clear strip (real URLs/handles only if stated). Do NOT use Grundfos pump hardware templates. Dark SCADA chrome only if the meeting explicitly discusses control-room monitoring.`;
    }
    if (domain === "generic") {
      return `GENERATE: PHYSICAL PRODUCT OR TANGIBLE ARTIFACT — infer the object from the transcript (equipment, spatial design, consumer product, etc.).
Centre a detailed illustration or exploded diagram with spec callouts. Avoid defaulting to industrial pumps unless the transcript discusses fluids/pumps.`;
    }
  }

  // ux_prototype: Gabriel gets Nordic-toned clickable prototype
  if (family === "ux_prototype") {
    if (domain === "gabriel") {
      return `GENERATE: CLICKABLE MULTI-SCREEN UX PROTOTYPE — navigable interactive mockup with Nordic-premium Gabriel aesthetic.

Build 2–4 distinct screens based on what the transcript describes. Show ONE screen at a time; JavaScript manages all navigation.

VISUAL IDENTITY — Gabriel-minded:
  • Calm Nordic tone: warm off-white (#FAFAF8) or soft grey (#F5F4F2) backgrounds, deep ink (#1A1A1A) or deep green (#1B4332) text
  • Accent: deep green (#2D6A4F) or forest (#166534) — not Grundfos blue or SCADA cyan
  • Typography: Inter or Outfit, generous line-height, restrained weight contrasts
  • Cards: white (#FFFFFF) with 1px #E5E0DB border, 12px border-radius, subtle shadow
  • Buttons: filled accent for primary, outlined for secondary — tactile feel

SCREEN STRUCTURE (mandatory):
  • Each screen: full-viewport, display:none by default (only first visible)
  • Persistent top navigation bar across all screens: logo/app name left, current screen label center (e.g. "2 / 3 — Produktdetalje"), optional icon right
  • Every screen except the first: visible "← Tilbage" / "← Back" button in header or top-left
  • CSS fade transition on screen change: opacity 0→1 over 200ms

SCREENS based on transcript:
  • Derive from what was discussed — if the meeting describes an app, portal, or tool, generate those exact flows
  • If conceptual, use plausible screens for the product type (e.g. overview → detail → form → confirmation)
  • Label each screen in Danish or English matching the transcript

JAVASCRIPT — one trailing inline IIFE:
  const screens = document.querySelectorAll('[data-screen]');
  function showScreen(id) {
    screens.forEach(s => { s.style.opacity='0'; setTimeout(()=>{ s.style.display='none'; }, 200); });
    const t = document.querySelector('[data-screen="'+id+'"]');
    if (!t) return;
    t.style.display='flex'; t.style.flexDirection='column';
    setTimeout(()=>{ t.style.opacity='1'; }, 20);
  }
  document.querySelectorAll('[data-go]').forEach(el =>
    el.addEventListener('click', () => showScreen(el.dataset.go))
  );
  showScreen('screen-1');

INTERACTIVITY within screens:
  • data-go="screen-id" on buttons/cards/links that should navigate
  • Hover states on interactive elements (CSS :hover)
  • Form fields, toggles, and checkboxes should respond visually to interaction

DO NOT use dark HMI/SCADA style. DO NOT use Grundfos navy/cyan. DO NOT generate static content with no navigation.`;
    }
    // grundfos / generic: use base instruction
  }

  // Generic family: domæne-specifik tone, fælles struktur (card-grid, ingen notater)
  if (family === "generic") {
    if (domain === "gabriel") {
      return `GENERATE: STRUCTURED DATA OVERVIEW — card-grid layout with analytics tone.
3–4 sections reflecting the meeting topics. Each card: white background, subtle border, bullet points or mini-table.
Accent: #3B82F6 or derive from context. Typography: Inter/Outfit. No charts unless transcript has numbers.
ABSOLUTELY NOT: meeting notes prose, bullet wall, dark gradient background.`;
    }
    if (domain === "generic") {
      return `GENERATE: STRUCTURED OVERVIEW — neutral card-grid layout.
3–4 named sections (white cards, #F8FAFC background, single accent colour from context).
Bullet points or mini-tables inside cards — never running prose or meeting notes aesthetic.`;
    }
    // grundfos: brug base-instructionen (Grundfos-farver allerede inkluderet)
    return base;
  }

  return text;
}

export async function* streamVisualization(
  params: VisualizerParams,
  onChunk: (chunk: string) => void,
  onPromptReady?: (info: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    maxTokens: number;
  }) => void,
): AsyncGenerator<string> {
  const {
    transcript,
    vizType,
    vizModel,
    title,
    context,
    previousHtml,
    freshStart,
    resolvedFamily,
    refinementDirective,
    workspaceDomain,
    focusSegment,
    meetingEssence,
    sketchPngBase64,
    isAnnotation,
  } = params;

  const domain = normalizeWorkspaceDomain(workspaceDomain);
  const systemPrompt = systemPromptForDomain(domain);

  const model = MODEL_IDS[vizModel ?? "haiku"];
  const isPump = domain === "grundfos" && resolvedFamily === "physical_product";
  const maxTokens = isPump
    ? MAX_TOKENS_PUMP[vizModel ?? "haiku"]
    : MAX_TOKENS[vizModel ?? "haiku"];

  const transcriptForModel = truncateTranscript(transcript);

  const isIncremental =
    !freshStart && !!previousHtml && previousHtml.trim().length > 80;

  let userMessage = "";
  if (title) userMessage += `Meeting title: ${title}\n\n`;
  if (context)
    userMessage += `ADDITIONAL MEETING CONTEXT (from facilitator — structured notes/files):\n${context}\n\n`;

  const essence = meetingEssence;
  if (
    essence &&
    (essence.bullets.length > 0 ||
      essence.lastVizTitle ||
      essence.lastFamilyLabel)
  ) {
    userMessage += `KORT MØDEHUKOMMELSE (fra før denne figur — baggrund, ikke hovedkilde; prioriter FOKUS-sektionen under):\n`;
    if (essence.lastVizTitle) {
      userMessage += `• Sidste visualisering (titel): ${essence.lastVizTitle}\n`;
    }
    if (essence.lastFamilyLabel) {
      userMessage += `• Sidste hovedtype: ${essence.lastFamilyLabel}\n`;
    }
    for (const b of essence.bullets) {
      userMessage += `• ${b}\n`;
    }
    userMessage += `\n`;
  }

  const familyDirective = resolvedFamily
    ? familyInstructionForDomain(resolvedFamily, domain)
    : undefined;
  if (resolvedFamily && familyDirective) {
    const source =
      vizType && vizType !== "auto"
        ? "USER-SELECTED TYPE"
        : "SERVER CLASSIFICATION (high confidence)";
    userMessage += `⚡ ${source} — follow these instructions exactly:\n${familyDirective}\n\n`;
  } else if (vizType && vizType !== "auto") {
    userMessage += `⚡ USER-SELECTED TYPE: Generate SPECIFICALLY this visualization type — nothing else: ${vizType}\n\n`;
  }

  if (isPump) {
    userMessage += `${PUMP_TEMPLATE_INSTRUCTIONS}\n\n`;
    userMessage += `=== CU CONTROLLER TEMPLATE ===\n${CU_CONTROLLER_TEMPLATE}\n\n`;
    userMessage += `=== ALPHA GO CIRCULATOR TEMPLATE ===\n${ALPHA_GO_TEMPLATE}\n\n`;
    userMessage += `=== CR/CRE MULTISTAGE PUMP TEMPLATE ===\n${CR_PUMP_TEMPLATE}\n\n`;
  }

  const primaryFocus = focusSegment
    ? focusSegment.trim()
    : sliceTailWords(transcript, PRIMARY_FOCUS_WORDS);

  userMessage += `FOKUS — seneste indhold (ca. sidste ${PRIMARY_FOCUS_WORDS} ord af transskriptet, medmindre et fokus-segment er angivet). Prioritér dette når du vælger hvad figuren primært handler om nu:\n\n${primaryFocus}\n\n`;

  userMessage += `HELE TRANSSKRIPTET (sekundær reference — brug til detaljer, navne og tal; lad FOKUS styre emne og type; undgå at lade gamle afsnit dominere over nye):\n\n${transcriptForModel}\n\n`;

  if (isIncremental && previousHtml) {
    const { snippet, truncated } = truncatePreviousViz(previousHtml);
    const tail = truncated
      ? "\n\n[Prior HTML was compressed — preserve and extend the structure you already established.]\n\n"
      : "\n\n";

    if (refinementDirective) {
      userMessage += `🎯 REFINEMENT MODE — THE USER SPOKE A SPECIFIC MODIFICATION REQUEST:
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
7. ⛔ NEVER add a "Notes", "Observations", "Takeaways", or any plain-text section BELOW the visualization — spoken change requests must produce ACTUAL visual changes (revised buttons, new panels, updated layouts), not text descriptions of the changes

CURRENT VISUALIZATION (modify this — do not discard):
${snippet}${tail}`;
    } else {
      userMessage += `INCREMENTAL UPDATE — CRITICAL RULES:
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
  ✗ Append a "Notes", "Observations", "Meeting notes", or any plain prose section BELOW the visualization — this is forbidden. New information must go INSIDE the visualization structure (new card, updated value, new row, expanded panel), not after it.

CURRENT VISUALIZATION (reference — keep and improve when topic is the same):
${snippet}${tail}`;
    }
  }

  if (focusSegment) {
    userMessage +=
      `\n\n⚡ USER FOCUS TRIGGER — MANUAL SEGMENT SELECTION:\n` +
      `The user clicked a specific transcript segment to trigger this generation.\n` +
      `This is the statement they selected as the primary signal:\n\n` +
      `  "${focusSegment}"\n\n` +
      (isIncremental
        ? `INCREMENTAL MODE: Incorporate this statement as the key new information to add or emphasize in the existing visualization. Prioritize surfacing ideas, data, or themes from this statement.\n`
        : `FRESH MODE: This statement is your primary anchor. Build the visualization around the ideas, data, or themes expressed in it, using the full transcript as supporting context.\n`);
  }

  if (sketchPngBase64) {
    if (isAnnotation) {
      userMessage +=
        `\n\n✏️ ANNOTATION-TILSTAND — EKSISTERENDE VIZ MED HÅNDINSTRUKTIONER (vedhæftet som billede):\n` +
        `Billedet viser den EKSISTERENDE visualisering med brugertegnede annotationer oven på.\n` +
        `FORTOLK annotationerne som direkte redigeringsinstruktioner:\n` +
        `  • Håndskrevet tekst = eksplicit instruktion (fx "lav til visuals", "tilføj kasse her", "fjern tekst", "gør dette til diagram")\n` +
        `  • Tegnede bokse/rektangler = nye elementer ønsket på det angivne sted\n` +
        `  • Pile og streger = ønskede forbindelser, flows eller retning\n` +
        `  • Cirkler/markeringer = "fokus på dette / fremhæv dette element"\n` +
        `  • Krydser (X) over noget = "fjern dette element"\n\n` +
        `REGLER:\n` +
        `  1. Annotationerne har højeste prioritet — de er brugerens eksplicitte ønsker til ændringer\n` +
        `  2. Bevar ALT der IKKE er annoteret uændret (layout, farver, data, struktur)\n` +
        `  3. Transskriptionen er kontekst — annotationerne er instrukser\n` +
        `  4. Hvis annotationerne er uklare, fortolk dem gunstigt i retning af den mest naturlige ændring\n`;
    } else {
      userMessage +=
        `\n\n📐 BRUGER-SKITSE (vedhæftet som billede):\n` +
        `Deltagerne har skitseret vedhæftede billede som deres initielle forståelse af hvad visualiseringen skal vise. ` +
        `Brug skitsen som den primære retningsangivelse for layout, struktur og hierarki. ` +
        `Transskriptionen leverer indholdet — skitsen leverer formen og retningen.\n\n` +
        `Hvis transskription og skitse tydeligt modsiger hinanden, prioritér den nyeste eksplicitte tale om emnet — ` +
        `men bevar skitsens layout hvor det er muligt. Afvig kun fra skitsen hvis den er tom eller ufortolkelig.\n`;
    }
  }

  userMessage += "Generate the HTML visualization now.";

  if (onPromptReady) {
    onPromptReady({ systemPrompt, userMessage, model, maxTokens });
  }

  // ── Gemini direct path ──────────────────────────────────────────────────
  if (GEMINI_MODELS.has(vizModel as VizModel)) {
    const gemini = getGeminiClient();
    if (!gemini) throw new Error("GEMINI_API_KEY is not configured");
    const geminiModelId = model;
    console.log(`[gemini] Using model ${geminiModelId}`);
    try {
      const stream = await gemini.models.generateContentStream({
        model: geminiModelId,
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userMessage}` }],
          },
        ],
        config: { maxOutputTokens: maxTokens },
      });
      let fullText = "";
      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          onChunk(text);
          yield text;
        }
      }
      return fullText;
    } catch (geminiErr: any) {
      console.error(`[gemini] Error:`, geminiErr?.message ?? geminiErr);
      throw geminiErr;
    }
  }

  const ANTHROPIC_CHAIN: string[] = [];
  ANTHROPIC_CHAIN.push(model);
  if (model === MODEL_IDS.opus && !ANTHROPIC_CHAIN.includes(MODEL_IDS.sonnet))
    ANTHROPIC_CHAIN.push(MODEL_IDS.sonnet);
  if (!ANTHROPIC_CHAIN.includes(MODEL_IDS.haiku))
    ANTHROPIC_CHAIN.push(MODEL_IDS.haiku);

  let lastError: unknown = null;
  let anthropicExhausted = false;

  for (const tryModel of ANTHROPIC_CHAIN) {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0 || tryModel !== model) {
          const wait = Math.min(1000 * Math.pow(2, attempt), 4000);
          await new Promise((r) => setTimeout(r, wait));
          console.log(
            `[retry] Attempt ${attempt + 1} with model ${tryModel} (original: ${model})`,
          );
        }

        const userContent: Anthropic.Messages.MessageParam["content"] =
          sketchPngBase64
            ? [
                {
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: sketchPngBase64,
                  },
                },
                { type: "text" as const, text: userMessage },
              ]
            : userMessage;

        const stream = client.messages.stream({
          model: tryModel,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
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
      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? err?.statusCode;
        if (
          status === 529 ||
          status === 503 ||
          status === 500 ||
          status === 502
        ) {
          console.warn(
            `[retry] Anthropic ${tryModel} returned ${status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
          );
          continue;
        }
        console.warn(
          `[retry] Anthropic ${tryModel} returned non-retryable status ${status} — skipping to next fallback`,
        );
        break;
      }
    }
    console.warn(
      `[retry] All attempts exhausted for Anthropic model ${tryModel}, trying next fallback...`,
    );
  }

  anthropicExhausted = true;

  const openaiClient = getOpenAIClient();
  if (anthropicExhausted && openaiClient) {
    console.log(
      `[fallback] All Anthropic models exhausted — falling back to OpenAI ${OPENAI_FALLBACK_MODEL}`,
    );
    try {
      const openaiStream = await openaiClient.chat.completions.create({
        model: OPENAI_FALLBACK_MODEL,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
      });

      let fullText = "";

      for await (const chunk of openaiStream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullText += content;
          onChunk(content);
          yield content;
        }
      }

      return fullText;
    } catch (openaiErr: any) {
      console.error(
        `[fallback] OpenAI fallback also failed:`,
        openaiErr?.message ?? openaiErr,
      );
      lastError = openaiErr;
    }
  }

  throw (
    lastError ?? new Error("All model attempts failed (Anthropic + OpenAI)")
  );
}

export async function fillTabPanels(
  transcript: string,
  tabs: Array<{ id: string; label: string }>,
  title?: string | null,
  context?: string | null,
  workspaceDomain?: string | null,
): Promise<Record<string, string>> {
  const domain = normalizeWorkspaceDomain(workspaceDomain);
  const fillSystem = adaptAuxiliarySystemPrompt(
    FILL_TAB_PANELS_SYSTEM_BASE,
    domain,
  );
  const transcriptForModel = truncateTranscript(transcript);
  const tabLines = tabs
    .map((t) => `- id "${t.id}" — label: ${t.label || "section"}`)
    .join("\n");

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
    system: fillSystem,
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

/** Strip HTML tags and decode basic HTML entities from a text chunk. */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function* streamReasoningNarrative(
  transcript: string,
  title?: string | null,
  context?: string | null,
  onChunk?: (chunk: string) => void,
  workspaceDomain?: string | null,
  vizTrace?: Record<string, unknown> | null,
): AsyncGenerator<string> {
  const domain = normalizeWorkspaceDomain(workspaceDomain);
  const system = adaptAuxiliarySystemPrompt(
    REASONING_NARRATIVE_SYSTEM_BASE,
    domain,
  );

  let userMsg = "";
  if (title) userMsg += `Meeting title: ${title}\n\n`;
  if (context) userMsg += `MEETING CONTEXT:\n${context}\n\n`;
  userMsg += `TRANSCRIPT:\n${truncateTranscript(transcript)}\n\n`;
  const trace =
    vizTrace && Object.keys(vizTrace).length > 0
      ? JSON.stringify(vizTrace, null, 2)
      : "null";
  userMsg += `visualization_trace (JSON fra server — kan være null):\n${trace}`;

  const stream = client.messages.stream({
    model: MODEL_IDS.haiku,
    max_tokens: 2500,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const raw = event.delta.text;
      const chunk = stripHtml(raw);
      if (chunk) {
        onChunk?.(chunk);
        yield chunk;
      }
    }
  }
}

export function isHtmlQualityOk(html: string): boolean {
  if (!html || html.length < 200) return false;
  if (!html.includes("<") || !html.includes(">")) return false;
  return true;
}
