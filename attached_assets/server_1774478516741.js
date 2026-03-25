// Zero-dependency server — uses only Node.js built-ins + native fetch (Node 22)
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ─── Load .env manually ───────────────────────────────────────────────────────
function loadEnv(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (_) {}
}
loadEnv(path.join(__dirname, '.env'));

const PORT               = process.env.PORT || 3000;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const DEEPGRAM_API_KEY   = process.env.DEEPGRAM_API_KEY   || '';

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ─── Visualization quality rules ──────────────────────────────────────────────
// A real visualization must have enough HTML to be meaningful.
// Below this threshold it is considered a failed/incomplete generation.
const MIN_VIZ_CHARS = 1500;

/** Max JSON body size for /api/visualize (bytes, UTF-8). */
const MAX_VIZ_BODY_BYTES = Number(process.env.MAX_VIZ_BODY_BYTES) || 1_500_000;
/** Sliding-window cap: visualize requests per client IP per minute. */
const VIZ_RATE_LIMIT_PER_MIN = Number(process.env.VIZ_RATE_LIMIT_PER_MIN) || 28;
/** Model input caps — incremental runs use a short tail to cut tokens/latency. */
const MAX_TRANSCRIPT_FOR_MODEL_FULL = 120000;
const MAX_TRANSCRIPT_FOR_MODEL_INCREMENTAL = 14000;
const MAX_PREVIOUS_VIZ_CHARS_INCREMENTAL = 52000;
/** Set to "false" in production if Deepgram must not be exposed to browsers (use server-side proxy instead). */
const ALLOW_DEEPGRAM_KEY_TO_BROWSER = process.env.ALLOW_DEEPGRAM_KEY_TO_BROWSER !== 'false';

const vizRateByIp = new Map();

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function allowVizRate(ip) {
  const now = Date.now();
  const windowMs = 60000;
  let arr = vizRateByIp.get(ip) || [];
  arr = arr.filter(t => now - t < windowMs);
  if (arr.length >= VIZ_RATE_LIMIT_PER_MIN) return false;
  arr.push(now);
  vizRateByIp.set(ip, arr);
  return true;
}

/**
 * Room transcript can lag the client's local buffer (async postSegment).
 * Merge so the model sees both shared room lines and unsynced client text when they differ.
 */
function mergeRoomAndClientTranscript(roomJoined, rawClient) {
  const client = String(rawClient || '').trim();
  const room = String(roomJoined || '').trim();
  if (!room) return client;
  if (!client) return room;
  if (room.includes(client)) return room;
  const tail = client.slice(Math.max(0, client.length - 1200));
  if (tail.length > 40) {
    const probe = tail.slice(-Math.min(500, tail.length));
    if (probe.length > 20 && room.includes(probe)) return room;
  }
  return `${room}\n\n[This client — live buffer; may include lines not yet in shared room]\n${client}`;
}

function truncateTranscriptForVizModel(text, isIncremental) {
  const s = String(text);
  const max = isIncremental ? MAX_TRANSCRIPT_FOR_MODEL_INCREMENTAL : MAX_TRANSCRIPT_FOR_MODEL_FULL;
  if (s.length <= max) return s;
  const omitted = s.length - max;
  return `[${omitted} characters omitted from the start — prioritise the tail below]\n\n${s.slice(-max)}`;
}

/** Remove markdown code fences that Haiku sometimes adds despite instructions. */
function stripCodeFences(s) {
  const start = s.indexOf('<');
  let t = start !== -1 ? s.slice(start) : s;
  t = t.trimEnd();
  if (t.endsWith('```')) t = t.slice(0, -3).trimEnd();
  return t;
}

// ─── Visualization topic family (incremental gate) ───────────────────────────
/** Tail of transcript drives family — så et skift til HMI i slutningen vinder over tidlig user journey. */
const VIZ_CLASSIFY_TAIL_CHARS = 12000;

/** Vægtede signaler: længere/faglige fraser først i listen giver højere score; undgår tvivl via MIN_LEAD. */
const CLASSIFY_MIN_TOTAL = 8;
const CLASSIFY_MIN_LEAD = 4;

const FAMILY_PRIORITY_ORDER = [
  'hmi_interface',
  'user_journey',
  'workflow_process',
  'physical_product',
  'requirements_matrix',
  'management_summary',
  'generic',
];

/**
 * terms: [substring, weight] — substring matches i normaliseret tekst (case-fold).
 * Brug høje vægte (14–22) for entydige fraser; lavere (4–8) for støtteord.
 */
const VIZ_FAMILY_SIGNALS = [
  {
    id:    'hmi_interface',
    label: 'HMI / SCADA interface',
    terms: [
      ['human machine interface', 22],
      ['hmi interface', 22],
      ['menneske maskine', 14],
      ['navigationstab', 20],
      ['navigation tab', 20],
      ['navigation tabs', 20],
      ['navigationstabs', 18],
      ['grafisk brugergrænseflade', 16],
      ['brugergrænseflade', 10],
      ['procesbillede', 16],
      ['process image', 16],
      ['synoptisk billede', 14],
      ['synoptic', 12],
      ['alarmvisning', 14],
      ['alarm view', 14],
      ['alarm list', 12],
      ['hændelseslog', 12],
      ['event list', 12],
      ['live values', 12],
      ['live værdier', 12],
      ['setpoint', 10],
      ['setpunkt', 10],
      ['operator screen', 14],
      ['operator panel', 14],
      ['betjeningspanel', 14],
      ['kontrolpanel', 12],
      ['touch panel', 12],
      ['touch screen', 12],
      ['touchskærm', 12],
      ['isolutions', 18],
      ['i solutions', 14],
      ['plc', 8],
      ['scada', 16],
      ['supervisory', 10],
      ['hmi', 12],
      ['trending', 8],
      ['trendkurve', 8],
      ['mimic diagram', 12],
      ['control room', 10],
      ['driftsskærm', 12],
      ['overvågningssystem', 12],
    ],
  },
  {
    id:    'user_journey',
    label: 'User journey / service design',
    terms: [
      ['user journey map', 22],
      ['customer journey map', 22],
      ['user journey', 20],
      ['customer journey', 20],
      ['journey map', 20],
      ['journey mapping', 18],
      ['brugerrejse', 20],
      ['service blueprint', 18],
      ['empathy map', 18],
      ['touchpoint', 14],
      ['touchpoints', 14],
      ['touch points', 12],
      ['persona', 12],
      ['personas', 12],
      ['pain point', 14],
      ['painpoint', 12],
      ['moments of truth', 14],
      ['swimlane', 12],
      ['swim lane', 12],
      ['swimlanes', 12],
      ['onboarding flow', 14],
      ['onboarding', 10],
      ['brugerflow', 14],
      ['customer experience', 12],
      ['cx design', 10],
      ['user flow', 12],
      ['storyboard', 10],
    ],
  },
  {
    id:    'workflow_process',
    label: 'Process / workflow',
    terms: [
      ['value stream map', 20],
      ['value stream mapping', 20],
      ['value stream', 14],
      ['business process model', 16],
      ['forretningsproces', 16],
      ['forretningsprocess', 14],
      ['bpmn', 18],
      ['process mining', 14],
      ['approval workflow', 14],
      ['approval flow', 12],
      ['godkendelsesflow', 14],
      ['procesflow', 14],
      ['process flow', 14],
      ['workflow engine', 12],
      ['workflow', 10],
      ['sop ', 8],
      ['standard operating procedure', 14],
      ['raci', 12],
      ['handover', 10],
      ['overdragelse', 10],
      ['six sigma', 12],
      ['lean ', 8],
      ['bottleneck analysis', 12],
    ],
  },
  {
    id:    'physical_product',
    label: 'Physical product / pump hardware',
    terms: [
      ['cirkulationspumpe', 18],
      ['centrifugalpumpe', 18],
      ['centrifugal pump', 16],
      ['centrifugal', 12],
      ['npsh', 18],
      ['impeller', 16],
      ['impelleren', 14],
      ['wet end', 16],
      ['volute', 12],
      ['magna3', 14],
      ['magna 3', 14],
      ['alpha2', 14],
      ['alpha 2', 14],
      ['cr pump', 14],
      ['cr-n', 10],
      ['pump model', 12],
      ['pumpe model', 12],
      ['pumpe', 8],
      ['pump curve', 12],
      ['pump ', 6],
      ['motor size', 10],
      ['ie3', 8],
      ['ie4', 8],
      ['ie5', 8],
      ['m3/h', 10],
      ['kubikmeter i timen', 10],
      ['tryk bar', 10],
      ['pressure bar', 10],
      ['sku', 8],
      ['product cutaway', 12],
      ['hardware revision', 10],
    ],
  },
  {
    id:    'requirements_matrix',
    label: 'Requirements / traceability',
    terms: [
      ['traceability matrix', 18],
      ['requirements traceability', 18],
      ['kravspecifikation', 18],
      ['krav specifikation', 16],
      ['kravspec', 16],
      ['moscow', 14],
      ['acceptance criteria', 16],
      ['user story', 12],
      ['user stories', 12],
      ['functional requirement', 14],
      ['non-functional requirement', 14],
      ['verification and validation', 16],
      ['verification validation', 14],
      [' ieee ', 8],
      ['srs document', 12],
      ['requirement id', 12],
      ['requirements baseline', 14],
      ['krav matrix', 14],
    ],
  },
  {
    id:    'management_summary',
    label: 'Management / timeline',
    terms: [
      ['executive summary', 16],
      ['steering committee', 14],
      ['roadmap', 14],
      ['gantt', 16],
      ['milestone', 12],
      ['milepæl', 12],
      ['quarterly', 10],
      ['budget', 10],
      ['portfolio', 10],
      ['program office', 12],
      ['stakeholder', 10],
      ['risk register', 12],
      ['risikoregister', 12],
      ['go live date', 12],
      ['decision log', 12],
    ],
  },
];

const VIZ_FAMILY_IDS = new Set([...VIZ_FAMILY_SIGNALS.map(f => f.id), 'generic']);

function normalizeTranscriptForClassification(text) {
  let s = String(text || '').toLowerCase().replace(/\r\n/g, '\n');
  s = s.replace(/\s+/g, ' ');
  const reps = [
    ['grundfoss', 'grundfos'],
    ['i dagens face', 'interface'],
    ['dagens face', 'interface'],
    ['todays face', 'interface'],
    ['enter face', 'interface'],
    ['userinterface', 'user interface'],
  ];
  for (const [a, b] of reps) s = s.split(a).join(b);
  return s.trim();
}

function classifyVisualizationIntent(transcript) {
  const tail = String(transcript || '').slice(-VIZ_CLASSIFY_TAIL_CHARS);
  const norm = normalizeTranscriptForClassification(tail);
  const scored = VIZ_FAMILY_SIGNALS.map(fam => {
    let score = 0;
    for (const [t, w] of fam.terms) {
      if (t && norm.includes(t)) score += w;
    }
    return { id: fam.id, label: fam.label, score };
  });
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1] || { score: 0, id: null, label: '' };
  const lead = top.score - second.score;
  const ambiguous = top.score < CLASSIFY_MIN_TOTAL || lead < CLASSIFY_MIN_LEAD;
  if (ambiguous || top.score === 0) {
    return {
      family:    'generic',
      topic:     'General visualization',
      scores:    sorted,
      ambiguous: true,
      lead,
      runnerUp:  top.score > 0 ? top.id : second.id,
    };
  }
  const tied = sorted.filter(s => s.score === top.score);
  if (tied.length > 1) {
    tied.sort((a, b) => {
      const ia = FAMILY_PRIORITY_ORDER.indexOf(a.id);
      const ib = FAMILY_PRIORITY_ORDER.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    const win = tied[0];
    return {
      family:    win.id,
      topic:     win.label,
      scores:    sorted,
      ambiguous: false,
      lead,
      runnerUp: second.id,
    };
  }
  return {
    family:    top.id,
    topic:     top.label,
    scores:    sorted,
    ambiguous: false,
    lead,
    runnerUp: second.id,
  };
}

function sanitizeLastVizFamily(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id || !VIZ_FAMILY_IDS.has(id)) return null;
  return id;
}

// ─── Meeting persistence ──────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data', 'meetings');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function saveMeeting(id, title, transcript, html) {
  const record = {
    id,
    title:              title || 'Meeting ' + new Date().toLocaleDateString('en-US'),
    timestamp:          new Date().toISOString(),
    transcript_preview: transcript.slice(0, 160).trim(),
    transcript,
    html,
  };
  fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(record, null, 2));
  return record;
}

// ─── Room disk persistence ────────────────────────────────────────────────────
const ROOMS_DIR = path.join(__dirname, 'data', 'rooms');
if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true });

function persistRoom(roomId, room) {
  try {
    fs.writeFileSync(
      path.join(ROOMS_DIR, `${roomId}.json`),
      JSON.stringify({
        roomId,
        transcript:     room.transcript,
        lastVizFamily: room.lastVizFamily ?? null,
      }),
    );
  } catch (_) {}
}
function loadPersistedRoom(roomId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOMS_DIR, `${roomId}.json`), 'utf8'));
  } catch (_) { return null; }
}
function deletePersistedRoom(roomId) {
  try { fs.unlinkSync(path.join(ROOMS_DIR, `${roomId}.json`)); } catch (_) {}
}

function loadHistory() {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
          return { id: r.id, title: r.title, timestamp: r.timestamp, transcript_preview: r.transcript_preview };
        } catch (_) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (_) { return []; }
}

function loadMeeting(id) {
  // sanitize: only allow alphanumeric + hyphens
  if (!/^[a-f0-9\-]{36}$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${id}.json`), 'utf8'));
  } catch (_) { return null; }
}

function deleteMeeting(id) {
  if (!/^[a-f0-9\-]{36}$/.test(id)) return false;
  try {
    fs.unlinkSync(path.join(DATA_DIR, `${id}.json`));
    return true;
  } catch (_) { return false; }
}

// ─── Meeting rooms (in-memory, live sessions) ─────────────────────────────────
const rooms = new Map(); // roomId → { id, createdAt, clients: Map<name,res>, transcript: [{name,text,ts}] }

function createRoom() {
  const id = crypto.randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F2C8"
  rooms.set(id, { id, createdAt: Date.now(), clients: new Map(), transcript: [], lastVizFamily: null });
  return id;
}

function broadcastToRoom(roomId, event, data, exceptName) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [name, res] of room.clients) {
    if (name === exceptName) continue;
    try { res.write(msg); } catch (_) {}
  }
}

// Clean up empty rooms older than 4 hours
setInterval(() => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [id, room] of rooms) {
    if (room.createdAt < cutoff && room.clients.size === 0) rooms.delete(id);
  }
}, 30 * 60 * 1000);

// ─── Claude system prompt ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert at analysing meeting transcripts from Grundfos and generating the single most appropriate professional HTML visualisation for the participants.

Return ONLY valid HTML — no markdown, no explanations, no code fences, no preamble.
Your first character MUST be '<' and your last character MUST be '>'.

━━━ MOST IMPORTANT RULE: CHOOSE THE RIGHT VISUALISATION TYPE ━━━
You MUST select the visualisation type that best matches what is being discussed — and then commit 100% to that type's visual language. Do NOT default to the dark HMI dashboard unless the meeting is explicitly about a digital control panel or SCADA screen.

SELECTION LOGIC — read the transcript and pick ONE:
  "user journey / brugerrejse / steps / trin / what happens when / hvad sker der når / onboarding / flow of a user"
    → USER JOURNEY MAP  (light background, swim lanes, emotion indicators)

  "physical pump / pumpe hardware / product looks like / pump model / Alpha / CR / Magna / cirkulationspumpe / what does it look like"
    → PHYSICAL PUMP ILLUSTRATION  (realistic SVG product drawing, Grundfos red #BE1E2D)

  "workflow / process steps / flowchart / decision / if X then Y / approval / how does the process work / hvad er processen"
    → WORKFLOW DIAGRAM  (flowchart with decision diamonds, swim lanes, clean white/light background)

  "compare / option A vs B / two approaches / pros cons / PIN vs token / we can either"
    → SCENARIO COMPARISON  (side-by-side cards, Grundfos brand colours)

  "stakeholders / who is involved / roles / teams / organisation"
    → STAKEHOLDER MAP  (concentric circles SVG)

  "timeline / milestones / phases / when / deadline / roadmap"
    → TIMELINE  (horizontal SVG with phase segments)

  "tasks / action points / to-do / kanban / backlog"
    → KANBAN BOARD  (columns: Backlog · In Progress · Done)

  "decisions / conclusions / agreements / we decided"
    → DECISION LOG  (editorial card layout)

  "HMI / SCADA / control panel / digital interface / screen design / display / betjeningspanel / iSolutions / navigationspanel / vi laver et interface / tabs / app interface / we are building an interface / drift tab / settings tab / sikkerhedstab / user profile / pump profile"
    → HMI DASHBOARD  (dark Grundfos iSolutions style — ONLY for this context)

  anything else / general meeting content
    → COMBINED OVERVIEW or the most relevant type above

NEVER use the dark HMI style for user journeys, workflows, physical products, or general discussions.
Each type has its own complete visual language defined below — follow it exactly.

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
Kilden er Grundfos iSOLUTIONS Suite — iF Design Award 2025.

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

Header:
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">
    <span style="color:#5a6a7a;font-size:0.75rem">⊞</span>
    <span style="color:#a8b8cc;font-size:0.68rem;letter-spacing:0.1em">REAL TIME MONITORING</span>
    <div style="margin-left:auto;width:6px;height:6px;border-radius:50%;
                background:#00d084;box-shadow:0 0 6px #00d084"></div>
  </div>

Metrics-grid (4 kolonner):
  Total Energy | Efficiency | Ratio Grade | Transportation Efficiency
  Hvert kort: stort tal i Courier New + enhed + kategori-label

─── PANEL: TREND & PREDICTION CHART ─────────────────────
background:#111827; border:1px solid rgba(0,200,255,0.12); border-radius:8px; padding:14px;

Header med dropdown:
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
    <span style="color:#a8b8cc;font-size:0.68rem;letter-spacing:0.1em">TREND AND PREDICTION</span>
    <div style="border:1px solid rgba(0,200,255,0.3);border-radius:4px;padding:2px 8px;
                color:#a8b8cc;font-size:0.62rem">Load ▾</div>
    <div style="margin-left:auto;color:#5a6a7a;font-size:0.75rem">⚙</div>
  </div>

SVG TREND CHART med FAKTISKE + FORUDSAGTE linjer (400×140px):
  <svg viewBox="0 0 400 140" width="100%" style="overflow:visible">
    <!-- Vandret grid-linjer -->
    <line x1="0" y1="28" x2="400" y2="28" stroke="rgba(0,200,255,0.07)" stroke-width="1"/>
    <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(0,200,255,0.07)" stroke-width="1"/>
    <line x1="0" y1="112" x2="400" y2="112" stroke="rgba(0,200,255,0.07)" stroke-width="1"/>
    <!-- Legende øverst højre -->
    <circle cx="290" cy="12" r="3" fill="#00c8ff"/>
    <text x="297" y="16" fill="#a8b8cc" font-size="9">monitoring</text>
    <circle cx="340" cy="12" r="3" fill="#5a8a9a"/>
    <text x="347" y="16" fill="#a8b8cc" font-size="9">forecasting</text>
    <!-- FAKTISK linje (solid cyan) -->
    <polyline points="0,90 50,70 100,80 150,45 200,55 250,35 300,42"
              fill="none" stroke="#00c8ff" stroke-width="2"/>
    <!-- FORUDSET linje (stiplet, dæmpet) -->
    <polyline points="300,42 340,38 380,30 400,25"
              fill="none" stroke="#5a8a9a" stroke-width="1.5" stroke-dasharray="4,3"/>
    <!-- Area fill under faktisk linje -->
    <polyline points="0,90 50,70 100,80 150,45 200,55 250,35 300,42 300,140 0,140"
              fill="rgba(0,200,255,0.06)" stroke="none"/>
    <!-- X-akse labels -->
    <text x="0" y="135" fill="#5a6a7a" font-size="8">JAN</text>
    <text x="70" y="135" fill="#5a6a7a" font-size="8">FEB</text>
    <text x="140" y="135" fill="#5a6a7a" font-size="8">MAR</text>
    <text x="210" y="135" fill="#5a6a7a" font-size="8">APR</text>
    <text x="280" y="135" fill="#5a6a7a" font-size="8">MAY</text>
    <text x="350" y="135" fill="#5a6a7a" font-size="8">JUN</text>
    <!-- Actual/Predict labels -->
    <text x="0" y="128" fill="#5a6a7a" font-size="8">Actual ◆</text>
    <text x="60" y="128" fill="#5a6a7a" font-size="8">Predict ◇</text>
  </svg>

─── PANEL: SYSTEM DIAGRAM (FLOW/P&ID) ───────────────────
background:#111827; border:1px solid rgba(0,200,255,0.12); border-radius:8px; padding:14px;

Vis flowdiagram med komponenter forbundet med pile. Eksempel på struktur:
  [Tower] →→→ [Cooling Water] →→→ [Chiller] →→→ [Chilled Water]
           ↗                              ↗
  [Pump A]                       [Pump B/C]

SVG-byggeblokke:
  Komponent-boks: rect fill="#1e2d40" stroke="#00c8ff" stroke-opacity="0.4" rx="4"
  Flow-pil: stroke="#0077C8" stroke-width="2" marker-end="url(#arrow)"
  Status-LED: circle fill="#00d084" r="4" — grøn=drift, rød=alarm
  Komponent-label: text fill="#a8b8cc" font-size="9" text-anchor="middle"

SVG arrow marker (inkludér altid):
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#00c8ff" opacity="0.8"/>
    </marker>
  </defs>

─── PANEL: CONTROL SUGGESTIONS + OPTIMIZATION ───────────
background:#111827; border:1px solid rgba(0,200,255,0.12); border-radius:8px; padding:14px;

CONTROL SUGGESTION — cirkelformat med current→target:
  <div style="display:flex;align-items:center;gap:12px;padding:10px;
              background:#0d1421;border-radius:6px;margin-bottom:8px">
    <div>
      <div style="color:#a8b8cc;font-size:0.6rem;letter-spacing:0.1em">RETURN WATER TEMPERATURE (°C)</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(0,200,255,0.15);
                    border:2px solid #00c8ff;display:flex;align-items:center;justify-content:center;
                    color:#fff;font-size:0.85rem;font-weight:700">10</div>
        <div style="color:#00c8ff;font-size:1rem">→</div>
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(0,208,132,0.15);
                    border:2px solid #00d084;display:flex;align-items:center;justify-content:center;
                    color:#fff;font-size:0.85rem;font-weight:700">15</div>
      </div>
    </div>
  </div>

OPTIMIZATION OBJECTIVES — current kW → target kW:
  <div style="padding:10px;background:#0d1421;border-radius:6px">
    <div style="color:#a8b8cc;font-size:0.6rem;letter-spacing:0.1em;margin-bottom:8px">
      INSTANTANEOUS POWER
    </div>
    <div style="display:flex;align-items:flex-end;gap:20px">
      <div>
        <div style="color:#5a6a7a;font-size:0.6rem">Current</div>
        <div style="color:#fff;font-size:1.6rem;font-family:'Courier New';font-weight:700">220</div>
        <div style="color:#00c8ff;font-size:0.65rem">kW</div>
      </div>
      <div style="color:#00c8ff;font-size:1.2rem;margin-bottom:8px">→→</div>
      <div>
        <div style="color:#5a6a7a;font-size:0.6rem">Target</div>
        <div style="color:#00d084;font-size:1.6rem;font-family:'Courier New';font-weight:700">200</div>
        <div style="color:#00d084;font-size:0.65rem">kW</div>
      </div>
    </div>
    <!-- Mini sparkline under -->
  </div>

─── PANEL HEADER STANDARD ───────────────────────────────
Alle panels bruger samme header-mønster:
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="color:#5a6a7a;font-size:0.75rem">◈</span>
      <span style="color:#a8b8cc;font-size:0.65rem;letter-spacing:0.1em;font-weight:600">
        PANEL TITEL HER
      </span>
    </div>
    <div style="color:#5a6a7a;font-size:0.75rem;cursor:pointer">⚙</div>
  </div>

━━━ STORE STATUS-TILES (primær visning ved overview-screens) ━━━
Bruges til at vise anlægsenheder (pumper, stationer, komponenter) som store klikbare tiles.

AKTIV/TILGÆNGELIG tile:
  <div style="width:200px;height:200px;border-radius:14px;cursor:pointer;
              background:linear-gradient(135deg,#0096b8 0%,#00c8ff 60%,#00e5ff 100%);
              box-shadow:0 0 30px rgba(0,200,255,0.35),0 8px 24px rgba(0,0,0,0.4);
              display:flex;align-items:center;justify-content:center">
    <!-- Stort SVG-ikon, hvid, 80×80px -->
  </div>
  <div style="color:#fff;font-size:0.92rem;font-weight:700;letter-spacing:0.08em;margin-top:14px">ENHEDSNAVN</div>
  <div style="color:#00c8ff;font-size:0.72rem;letter-spacing:0.1em;margin-top:4px">TILGÆNGELIG</div>

INAKTIV/OPTAGET tile:
  Samme størrelse, men: background: linear-gradient(135deg,#1e2d40 0%,#2a3d55 100%)
  Ingen box-shadow. Tekst og ikon: color:#5a6a7a

━━━ DATA-PANELS OG METRIK-KORT (Grundfos iSolutions stil) ━━━

Hvert metrik-kort:
  background:#111827; border:1px solid rgba(0,200,255,0.15); border-radius:8px; padding:14px 16px;
  Øverst: label i ALL CAPS, color:#a8b8cc, font-size:0.62rem, letter-spacing:0.1em
  Midt: stor talværdi, font-family:'Courier New', color:#fff, font-size:2rem, font-weight:700
  Enhed: color:#00c8ff, font-size:0.78rem, margin-left:5px
  Bund: SVG mini-sparkline (60×16px) MED cyan polyline, ELLER trend-pil

SVG SPARKLINE PATTERN (inkludér i hvert vigtige metrik-kort):
  <svg width="60" height="16" viewBox="0 0 60 16">
    <polyline points="0,14 10,10 20,12 30,6 40,8 50,4 60,6"
              fill="none" stroke="#00c8ff" stroke-width="1.5" opacity="0.7"/>
    <polyline points="0,14 10,10 20,12 30,6 40,8 50,4 60,6 60,16 0,16"
              fill="rgba(0,200,255,0.08)" stroke="none"/>
  </svg>

SVG ARC-GAUGE (til vigtige målinger — brug ved pumper og procesmålinger):
  <svg viewBox="0 0 120 120" width="100" height="100">
    <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(0,200,255,0.12)" stroke-width="9"
            stroke-dasharray="240 360" stroke-dashoffset="-60" stroke-linecap="round"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="#00c8ff" stroke-width="9"
            stroke-dasharray="[procent * 2.4] 360" stroke-dashoffset="-60" stroke-linecap="round"
            style="filter:drop-shadow(0 0 4px rgba(0,200,255,0.6))"/>
    <text x="60" y="55" text-anchor="middle" fill="#fff" font-family="Courier New"
          font-size="22" font-weight="700">[VAL]</text>
    <text x="60" y="68" text-anchor="middle" fill="#00c8ff" font-size="10">[UNIT]</text>
    <text x="60" y="82" text-anchor="middle" fill="#5a6a7a" font-size="9">[LABEL]</text>
  </svg>

━━━ SYSTEM-DIAGRAM / P&ID (iSolutions Suite stil) ━━━
Tegn et SVG-procesdiagram når anlægget beskrives. Stil:
- Baggrund: #0d1421 med svag grid (stroke:#1a2535, opacity:0.4)
- Rørlinjer: stroke:#0077C8, stroke-width:2 for aktiv flow; stroke:#2a3d55 for inaktiv
- Flow-pilehoveder: fill:#00c8ff
- Komponenter (pumper, ventiler, tanke) i #1e2d40 border og #00c8ff outline
- Status-LED på hver komponent: grøn glow for drift, rød for alarm
- Labels i ALL CAPS, color:#a8b8cc, font-size:9px

━━━ STATUS-LED CSS ━━━
  DRIFT:    background:#00d084; box-shadow:0 0 6px #00d084, 0 0 14px rgba(0,208,132,0.5);
  ADVARSEL: background:#ffb800; box-shadow:0 0 6px #ffb800, 0 0 14px rgba(255,184,0,0.5);
  ALARM:    background:#ff4757; box-shadow:0 0 6px #ff4757, 0 0 14px rgba(255,71,87,0.5);
            animation:ledAlarm 1.2s ease-in-out infinite;
  OFFLINE:  background:#3a4a5a; box-shadow:none;
  @keyframes ledAlarm { 0%,100%{opacity:1} 50%{opacity:.25} }

━━━ KNAPPER (Grundfos HMI-stil) ━━━
  PRIMÆR (f.eks. FORTSÆT / START):
    background:#00c8ff; color:#0d1421; font-weight:700; letter-spacing:0.1em;
    border:none; border-radius:4px; padding:12px 28px; font-size:0.8rem;
    box-shadow:0 0 16px rgba(0,200,255,0.4);

  SEKUNDÆR (f.eks. TILBAGE / ANNULLER):
    background:transparent; color:#fff; border:1px solid rgba(255,255,255,0.4);
    border-radius:4px; padding:12px 28px; font-size:0.8rem; letter-spacing:0.1em;

━━━ TRIN-INDIKATOR (ved startup/protokol-sekvenser) ━━━
  Vandret progress-bar med 4-5 trin:
  FÆRDIG:    ⊙-cirkel i #00d084 + fed tekst "Completed"
  AKTIV:     ⊙-cirkel i #00c8ff + animation puls + tekst "Activating..."
  VENTER:    Tom cirkel i #2a3d55 + grå tekst "Step X"
  Forbindende linje: 2px, #2a3d55 for venter, #00c8ff for passerede trin

━━━ DOMÆNE-PARAMETRE (brug nævnte værdier, ellers disse) ━━━

PUMPE (Grundfos):
  Flow: 18.5 m³/h | Tryk: 4.2 bar | RPM: 2850 | Temp: 65°C | Virkningsgrad: 78% | Effekt: 3.2 kW

SHORE POWER / LANDSTRØMSANLÆG:
  Spænding: 6.6 kV | Strøm: 420 A | Effekt: 4.8 MW | Frekvens: 50 Hz
  Stationer: Power Station 1 (North) AVAILABLE | Power Station 2 (South) OCCUPIED
  Faser: Cooling ✓ | Main Entry Breaker ✓ | Active Frontend ⟳ | Grid Converter ○ | Pre-connect ○

FREKVENSOMFORMER:
  Frekvens: 48.5 Hz | Udgangsstrøm: 7.2 A | DC-link: 540 V | Effektivitet: 96%

━━━ ANTI-PATTERNS — MÅ ALDRIG BRUGES ━━━
  ✗ Lys/hvid baggrund
  ✗ Bootstraps standard-blå (#007bff) eller grøn (#28a745)
  ✗ Runde hjørner > 14px
  ✗ Emoji — brug altid Unicode-symboler (▲ ▼ ◉ ⚠ ∿ ⊙ ⟳ ≋ →)
  ✗ Gradient-baggrunde på selve appen (kun på tiles og knapper)
  ✗ Tomme gauges — altid realistiske tal
  ✗ Font-size < 9px (læsbarhed på touchskærme)

━━━ ØVRIGE VISUALISERINGSTYPER (høj fidelity kræves for ALLE) ━━━
Bruges primært når ingen HMI/SCADA-kontekst er til stede. Alle typer skal have:
- Minimum 60 linjer CSS
- Præcis typografisk hierarki (3 størrelsesniveauer)
- Farvekodning med forklaring/legende
- Realistisk indhold fra transskriptionen (ikke placeholder)

1. KRAVSPECIFIKATIONSTABEL → krav, parametre, grænseværdier, specifikationer
   Format: Tabel med farvet header (#002A5C), alternerende rækker, kolonnerne: Parameter | Krav/Værdi | Enhed | Prioritet | Ansvarlig | Status

2. KANBAN-BOARD → opgaver, handlingspunkter, to-do
   Kolonner: Backlog | I Gang | Afventer | Færdig — med opgavekort der har prioritets-chip, ansvarlig-avatar og deadline

3. BESLUTNINGSLOG → beslutninger, aftaler, konklusion
   Format: Kortbaseret layout, hvert kort med beslutnings-id, ikoner, ansvarlig, status-chip og rationale

4. TIDSLINJE → datoer, faser, milepæle, leverancer
   Format: Horisontal SVG-tidslinje med milepæls-prikker, farvekodede faser og tooltip-labels

5. MINDMAP → brainstorm, idégenerering, åbne diskussioner
   Format: SVG centralt emne med SVG-linjer ud til noder og under-noder, farvekodede grene

6. KOMBINERET OVERBLIK → møder der dækker mange emner
   Format: Sektionsopdelt dashboard med 2-3 mini-visualiseringer af ovenstående typer

━━━ NOISE ROBUSTNESS AND ENGLISH MEETING SPEECH ━━━
Transcriptions from real meetings are NEVER perfect. You MUST handle these conditions:

ENGLISH SPEECH PATTERNS — ignore when visualising:
  - Hesitation sounds: "uh", "um", "er", "ah", "hmm"
  - Filler words: "like", "you know", "I mean", "sort of", "kind of", "basically"
  - Repetitions from hesitation: "so so the", "we we need to", "yeah yeah"
  - Interrupted sentences and restarts: "we should — I mean we need to consider..."
  - Trailing sentence endings: words at the end of sentences may be missing or misheard

NOISE AND AUDIO ISSUES — ignore these:
  - Background noise (ventilation, office ambience) can produce meaningless single words
  - Keyboard, chair, and cough sounds may appear as random words
  - Overlapping speech can produce garbled or incoherent text
  - Mic distance causes unclear speech → words may be mis-transcribed

HANDLING RULES:
  1. Focus on the CLEAR, MEANINGFUL parts — ignore obvious noise and fragments
  2. Technical terms may be phonetically spelled: "set point" = "setpoint", "P L C" = "PLC"
  3. Mixed English/Danish sentences may occur — Grundfos operates internationally
  4. If the transcription is fewer than 8 meaningful words or dominated by noise, return a simple waiting-state panel:
     "<div style='background:#1a1a2a;border-radius:12px;padding:40px;text-align:center;color:#7aabde;font-family:sans-serif'><div style='font-size:2.5rem;margin-bottom:16px'>🎙️</div><h2 style='color:#fff;margin-bottom:8px'>Awaiting input...</h2><p>Keep speaking — Claude will visualise automatically when there is enough content.</p></div>"

━━━ REGULATORISKE RAMMER — KRITISK INFRASTRUKTUR ━━━
Grundfos leverer pumpeløsninger til kritisk infrastruktur (vand, energi, bygninger). Disse regulatoriske begreber er IKKE fysiske komponenter — de er EU-lovkrav og sikkerhedsstandarder der skal overholdes som et LAG OVENPÅ tekniske løsninger.

Når disse nævnes i et møde, skal du visualisere dem som compliance-/sikkerhedsoverview — ALDRIG som hardware.

CER — Critical Entities Resilience (EU-direktiv 2022/2557):
  - HVAD: EU-direktiv om fysisk modstandsdygtighed for kritiske enheder i 11 sektorer
  - SEKTORER: energi, transport, vand/spildevand, sundhed, digital infrastruktur, fødevarer m.fl.
  - Grundfos er leverandør til ALLE disse sektorer og er dermed direkte berørt
  - KRAV til operatører: risikovurdering, fysiske sikringsforanstaltninger, beredskabsplaner,
    baggrundstjek af nøglepersonale, hændelsesrapportering til myndigheder
  - FORMÅL: beskytte mod trusler som naturkatastrofer, cyberangreb, tekniske sammenbrud, terror
  - CER = FYSISK resiliens (modsat NIS2 der handler om cyber)
  - Deadline: national implementering medio 2024/2025

NIS2 — Network and Information Security Directive 2 (EU-direktiv 2022/2555):
  - HVAD: EU-direktiv om cybersikkerhed for væsentlige og vigtige enheder
  - To kategorier: "Væsentlige enheder" (kritisk infrastruktur) og "Vigtige enheder"
  - KRAV: risikostyring, adgangskontrol, kryptering, supply chain-sikkerhed,
    hændelsesrapportering inden 24 timer (initial), 72 timer (detaljeret)
  - NIS2 = CYBER resiliens (modsat CER der handler om fysisk sikring)
  - Grundfos-produkter (pumper, HMI, SCADA-integration) er en del af kunders NIS2-scope

FORHOLDET CER ↔ NIS2:
  - CER og NIS2 er KOMPLEMENTÆRE — begge kræves samtidigt
  - CER: "Er anlægget fysisk sikkert mod angreb og nedbrud?"
  - NIS2: "Er styringssystemerne og dataen cybersikre?"
  - Grundfos-pumper med digitale interfaces (CIM-modul, BMS-integration) berøres af begge

ANDRE RELEVANTE STANDARDER der kan nævnes:
  - IEC 62443: cybersikkerhedsstandard specifikt for industrielle styresystemer (OT/ICS)
  - GDPR: databeskyttelse (relevant for brugerdata i cloud-tilsluttede pumpeløsninger)
  - ISO 27001: informationssikkerhedsstyring
  - ATEX/Ex-direktiver: eksplosionsbeskyttelse (fysisk sikkerhed, pumper i farlige miljøer)
  - EN ISO 9906: hydraulisk ydeevnetest for pumper

ASR MISRECOGNITIONS FOR REGULATORY ACRONYMS — always interpret as follows:
  - "c.e.r", "C E R", "cear"   →  CER (Critical Entities Resilience)
  - "NIS 2", "niis2", "N.I.S.2"  →  NIS2
  - If "CER" appears in a sentence about EU, directives, security, critical infrastructure,
    compliance, or resilience → always interpret as CER (not any other word)

VISUALISATION RULES for regulatory topics:
  1. Generate a COMPLIANCE DASHBOARD when CER, NIS2 or similar is mentioned
  2. Show it as an OVERLAY LAYER on top of the technical solution — not a replacement for it
  3. Use a table or status grid with: Requirement | Status (✓/⚠/✗) | Owner | Deadline | Comment
  4. Colour code: green = fulfilled, yellow = partial/in progress, red = missing/critical
  5. ALWAYS include a note: "Regulatory requirement — applies as a layer over the technical solution"
  6. Optionally combine with the technical visualisation in a split dashboard:
     - Left/top: technical control panel (pump/system)
     - Right/bottom: compliance status for the mentioned requirements

━━━ FYSISK GRUNDFOS PUMPE VISUALISERING — FULL VISUAL SPEC ━━━
USE WHEN: transcript mentions physical pump appearance, hardware, product model, what it looks like, installation, pump housing, motor.

Visual language: Product illustration / technical drawing style. White/light background. Engineering precision.

BACKGROUND: white #FFFFFF or very light #F8FAFC
LAYOUT: Central large SVG pump illustration + surrounding technical spec cards

GRUNDFOS HARDWARE COLOURS:
  Signature Red (pump body):  #BE1E2D  — primary housing colour, iconic Grundfos red
  Dark grey (base/fittings):  #2D2D2D
  Mid grey (coupling/shaft):  #6B7280
  Stainless (ports/flanges):  #B0B8C1
  Brand blue (logo/label):    #0077C8
  Cable yellow:               #F59E0B

SVG PUMP ILLUSTRATION — draw realistically as seen from the side:

  For ALPHA2 / circulator pump (compact, horizontal motor):
    Body: wide flat oval/rect shape, fill:#BE1E2D, rx:12
    Motor end cap (right): semicircle, fill:#BE1E2D
    Pipe connections: two stubs top/bottom or left/right, fill:#B0B8C1
    Control panel face: small rectangle on body, fill:#1A1A1A with small display rect in #0077C8
    Brand label: "GRUNDFOS" text in white on red body, "alpha2" in smaller text below
    Mounting screws: small circles fill:#6B7280

  For CR / multistage vertical pump:
    Motor (top): tall cylinder, fill:#BE1E2D, with horizontal cooling ribs (lines stroke:#9B1520)
    Coupling cover (middle): short cylinder, fill:#6B7280
    Pump stages (bottom): taller rect with horizontal stage lines, fill:#BE1E2D
    Inlet flange (left side at bottom): horizontal stub, fill:#B0B8C1
    Outlet flange (right side at bottom): horizontal stub, fill:#B0B8C1 (in-line = same level)
    Base plate: flat rect, fill:#2D2D2D
    "GRUNDFOS CR" label on motor body

SURROUNDING LAYOUT:
  Left of pump: specification table (Parameter | Value | Unit) with navy header
  Right of pump: 3-4 feature highlight cards (rounded, white, blue left border)
  Below pump: installation diagram showing pipe connections
  Top: product name as hero title (Outfit 2.5rem, #002A5C)

All technical labels use leader lines (thin stroke:#94A3B8, dashed) pointing to pump parts.

━━━ USER JOURNEY MAP — FULL VISUAL SPEC ━━━
Visual language: Miro/Figma UX style. Light background. Professional UX deliverable.

BACKGROUND: #F7F8FA with subtle grid texture
FONT: Import Outfit + Space Mono from Google Fonts

STRUCTURE (full width, horizontal):
1. HEADER ROW — persona strip across the top:
   Left: large persona avatar (circle, initials, role title, Grundfos blue #0077C8 fill)
   Centre: journey title in 1.8rem Outfit bold
   Right: metadata (scenario name, date, version chip)

2. PHASE COLUMNS — 4–6 phases side by side:
   Each column header: rounded pill shape, alternating colours from:
     #002A5C · #0077C8 · #1A6B3C · #7B3FA0 · #C05B00
   Column width: equal flex. Min 160px each.

3. SWIM LANES — 4 horizontal rows inside the columns:
   Row A — TOUCHPOINT (icon + channel label: App · Web · Physical · Phone)
     Icons drawn as simple SVG shapes (circle, rect, etc.), no emoji
   Row B — USER ACTION (white card, bold 0.9rem text, left-blue-border 4px #0077C8)
   Row C — SYSTEM / BACKSTAGE (light grey card #EEF1F5, 0.82rem italic text)
   Row D — EMOTION (coloured dot + label):
     Happy: ● #22C55E   Neutral: ● #F59E0B   Frustrated: ● #EF4444
     Show as a small filled circle + one-word emotion label below

4. PAIN POINT FLAGS — red triangular flag SVG (▲ red #EF4444) in the cell where pain occurs
   Below flag: short pain point description in 0.75rem red text

5. OPPORTUNITY BUBBLES — at bottom of critical columns:
   Rounded rect, dashed border #0077C8, light blue fill #EFF6FF
   Text: "Opportunity: ..." in 0.78rem

6. CONNECTING ARROWS between phase columns:
   SVG horizontal arrow, stroke #CBD5E1, stroke-width 2, dashed

CARD STYLING:
  border-radius: 8px; padding: 10px 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  Each card animates in with fadeUp (stagger 0.08s × column index)

━━━ SCENARIO / CONCEPT COMPARISON ━━━
Aktiveres når transskriptionen sammenligner 2-3 alternativer, tilgange, løsninger, koncepter — f.eks. "den ene måde er..., den anden måde er..." eller "vi kan enten... eller...".

Layout: Side-by-side kort (2-3 kolonner) med:
  - Koncept-navn i stort (Playfair Display, 1.8rem)
  - Illustration/ikon der repræsenterer konceptet (SVG)
  - 3-4 bullet fordele (grøn check ✓)
  - 2-3 bullet ulemper (amber ◆ eller rød ✗)
  - Kompleksitets-bar (lav/medium/høj)
  - Anbefalet-badge hvis ét koncept foretrækkes

Brug Grundfos navy (#002A5C) for det anbefalede/valgte koncept, lys blå (#E8F4FD) for alternativerne.

━━━ WORKFLOW / PROCESS DIAGRAM — FULL VISUAL SPEC ━━━
Visual language: LucidChart / Miro flowchart style. Clean, structured, professional.

BACKGROUND: white #FFFFFF with very light grey grid (#F3F4F6 dots, 20px spacing via CSS background-image)
FONT: Import Outfit + Space Mono

FLOWCHART ELEMENTS (draw as SVG):
  START/END — rounded rectangle (rx:24): fill:#002A5C, text:#FFF, font-weight:700
  PROCESS STEP — rectangle (rx:8): fill:#FFFFFF, stroke:#CBD5E1 2px, text:#1E293B 0.85rem
    Active/current step: stroke:#0077C8 2px, fill:#EFF6FF, left accent bar 4px #0077C8
  DECISION — diamond shape (SVG polygon): fill:#FEF3C7, stroke:#F59E0B 2px, text:#92400E 0.8rem
  SUBPROCESS — rectangle with double border lines on sides: fill:#F8FAFC, stroke:#94A3B8
  DOCUMENT/OUTPUT — rectangle with wavy bottom (SVG path): fill:#F0FDF4, stroke:#22C55E

CONNECTORS:
  Arrow lines: stroke:#94A3B8, stroke-width:2, marker-end arrow fill:#94A3B8
  Decision YES branch: stroke:#22C55E, label "Yes" in green
  Decision NO branch: stroke:#EF4444, label "No" in red
  Lines should be orthogonal (horizontal + vertical segments, not diagonal)

SWIM LANES (if multiple roles/systems involved):
  Vertical lanes separated by dashed line (#E2E8F0)
  Lane header: left sidebar label, fill:#F1F5F9, text rotated 90deg, 0.75rem CAPS

ANNOTATIONS:
  Small sticky-note style comments: fill:#FFFBEB, stroke:#FCD34D, font-size:0.72rem italic
  Connected to relevant step with dashed line

LAYOUT RULES:
  Top-to-bottom flow (portrait) or left-to-right (landscape) — choose based on number of steps
  5+ steps: left-to-right landscape
  Decision branches flow downward
  Reconverge with merge arrow symbol

━━━ ØVRIGE VISUALISERINGSTYPER (ikke-HMI) ━━━
Bruges når ingen specifik industriel komponent er nævnt.
ALLE typer skal have fuld visuel identitet — se DESIGN-REGLER FOR IKKE-HMI nedenfor.

1. KRAVSPECIFIKATIONSTABEL → krav, parametre, grænseværdier, specifikationer
   Layout: Navy (#002A5C) header-søjle i venstre kant som vertikal accent. Tabelrækker med
   alternerende #F8FAFB / hvid. Kolonnerne: Parameter | Krav/Værdi | Enhed | Prioritet | Ansvarlig | Status.
   Prioritet-chips: farvet badge (kritisk=rød, høj=#0077C8, medium=amber, lav=grå).
   Statuskolonne: ◉ grøn=opfyldt / ◎ amber=under arbejde / ○ grå=ikke startet.

2. KANBAN-BOARD → opgaver, handlingspunkter, to-do
   Layout: 4 kolonner (Backlog · In Progress · Waiting · Done) med DRAMATISK bredde-forskel —
   Backlog smallere, In Progress bredest. Kolonne-header med stor nummer-badge + kolonne-navn i
   Playfair Display. Hvert kort: venstre farve-bar (priority), title, person-initial-avatar (cirkel),
   deadline-chip. Kortene har staggered animation-delay (0.1s × kortets index).
   Baggrund: #F2F4F7 med subtil diagonalstripe-texture (via CSS background-image).

3. BESLUTNINGSLOG → beslutninger, aftaler, konklusion
   Layout: EDITORIAL — stor venstre kolonne (beslutnings-id + dato vertikalt roteret 90°) +
   bred indholdskolonne. Hvert beslutningspunkt: stor nummereret header (4rem, navy, Playfair Display),
   beslutnings-statement i 1.1rem brødtekst, rationale i 0.85rem muted, ansvarlig-pill + status-badge.
   Subtil top-border accent i #0077C8 på hvert punkt (4px).

4. TIDSLINJE → datoer, faser, milepæle, leverancer
   Layout: SVG horisontal tidslinje med TYKKE farvede faser-segmenter (10px høj bar).
   Under baren: lodrette streger ned til milestone-labels. Over: fase-navne med gradient-baggrunde.
   Hver fase har en distinkt farve fra Grundfos-paletten. Nuværende tidspunkt markeret med
   lodret cyan stiplede linje + "TODAY" label. Milepæls-diamanter (◆) ved nøgledatoer.

5. MINDMAP → brainstorm, idégenerering, åbne diskussioner
   Layout: SVG centralt emne (stor cirkel, navy gradient) med radierende grene til emner (mellemstore
   cirkler, blå), og under-noder (ellipser). Grenlinjerne bruger cubic bezier kurver, ikke rette linjer.
   Farv grene i 4-5 distinkte Grundfos-toner. Label-tekst i Outfit font. Animation: grene tegnes ind
   med CSS stroke-dashoffset animation.

6. KOMBINERET OVERBLIK → møder der dækker mange emner
   Layout: ASYMMETRISK GRID — ét stort hero-panel (2/3 bredde) med det vigtigste indsigt,
   og en højre kolonne med 2-3 komprimerede mini-panels. Ingen ensformige kort-grids.

7. STAKEHOLDER MAP → interessenter, roller, ansvar, organisationsstruktur
   Layout: Koncentriske cirkler (SVG) — centrum: projektet/produktet, indre ring: primære stakeholders,
   ydre ring: sekundære. Farv efter division/team. Labels med rolle + navn.

8. FEATURE CARD / PRODUCT BRIEF → produktbeskrivelse, feature-spec, value proposition
   Layout: Hero-sektion med produktnavn (stor, Playfair), tagline, og 3 kolonner:
   What it does | Who it's for | Why it matters. Grundfos visual identity.

━━━ DESIGN-REGLER FOR IKKE-HMI VISUALISERINGER (KRITISK) ━━━
Disse regler gælder for alle ikke-HMI typer. De er ikke valgfri.

TYPOGRAFI:
  Inkludér ALTID dette i <style>:
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Outfit:wght@300;400;600;700&family=Space+Mono:wght@400;700&display=swap');
  Display/overskrift: 'Playfair Display', serif — bruges til store tal, section-headers, hero-titles
  UI/body: 'Outfit', sans-serif — bruges til al brødtekst, labels, beskrivelser
  Data/kode: 'Space Mono', monospace — bruges til tal, datoer, id'er, statuskoder

STØRRELSESSKALA — DRAMATISK HIERARKI:
  Hero-tal/overskrift: 3.5rem–5rem, font-weight:900, color:#002A5C
  Section-header:      1.4rem–2rem, font-weight:700
  Kort-title:          1rem–1.1rem, font-weight:600
  Brødtekst:           0.88rem, font-weight:400
  Label/meta:          0.68rem, letter-spacing:0.1em, text-transform:uppercase

BAGGRUND OG DYBDE:
  Brug ALDRIG plain hvid (#FFF) eller plain grå som eneste baggrund.
  Muligheder (vælg én og hold dig til den):
  a) Lys struktureret: #F0F4F8 med subtle diagonal-stripe texture via:
     background-image: repeating-linear-gradient(45deg, rgba(0,42,92,0.025) 0px, rgba(0,42,92,0.025) 1px, transparent 1px, transparent 16px);
  b) Navy accent-kolonne: venstre 280px er #002A5C (hvid tekst), resten er #FFFFFF
  c) Split-tone: top 35% er #002A5C, resten er #F8FAFB — hero-overskrift på mørk baggrund
  d) Papir-tekstur: #FAFAF8 med box-shadow: inset 0 0 120px rgba(0,42,92,0.04)

KORT-DESIGN (aldrig plain hvide firkanter):
  Brug enten:
  - Venstre farve-bar (4px) i #0077C8 + hvid baggrund + blød skygge
  - Top farve-gradient-bar (6px) som border-top
  - Hel card-baggrund i meget lys blå (#EFF6FF) med #0077C8 border-left
  Skygge: box-shadow: 0 2px 8px rgba(0,42,92,0.08), 0 0 0 1px rgba(0,42,92,0.06)
  Border-radius: 8px–12px (aldrig 0, aldrig >16px)

ANIMATIONER:
  Alle hovedelementer animeres ind ved load med staggeret delay:
  .card:nth-child(1) { animation: fadeUp 0.4s ease both; animation-delay: 0s; }
  .card:nth-child(2) { animation: fadeUp 0.4s ease both; animation-delay: 0.07s; }
  .card:nth-child(3) { animation: fadeUp 0.4s ease both; animation-delay: 0.14s; }
  (Fortsæt mønstret op til 8 elementer)
  @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }

ACCENT-DETALJER:
  Brug mindst 2 af disse per visualisering:
  - Nummererede sections med stor muted baggrundscifre (10rem, opacity:0.04, position:absolute)
  - Tynde horisontale linjer (1px #0077C8, opacity:0.2) som section-dividers
  - Progress-bars i #0077C8 for procent-værdier (height:4px, border-radius:2px)
  - Person-initial-avatarer (32px cirkel, navy baggrund, hvid initial)
  - Status-chips: farvet baggrund + border-radius:999px + 0.65rem font

FORBUDT I IKKE-HMI VISUALISERINGER:
  ✗ Plain hvide kort uden skygge eller farve-accent
  ✗ Generisk tabel uden typografisk hierarki
  ✗ Alle elementer samme størrelse (ingen visuel vægt)
  ✗ Manglende font-import (system-ui er FORBUDT for ikke-HMI)
  ✗ Ensformigt kortgrid (3 × N ens kort = FORBUDT)
  ✗ Navy+blå+hvid fladt udført — brug dem dramatisk, ikke uniformt

━━━ OUTPUT-KRAV ━━━
- Returnér KUN HTML startende med <style> og sluttende med </div>
  Format: <style>/* al CSS samlet øverst */</style><div>/* HTML herunder */</div>
- Brug en <style>-blok øverst til al CSS (ikke inline på hvert element) — det giver renere, rigere output
- Responsive, men designet primært til 16:9 widescreen (min-width: 800px)
- HMI-interfaces: altid dark-on-dark Grundfos iSolutions-paletten (cyan #00c8ff på navy #0d1421)
- Ikke-HMI typer: følg DESIGN-REGLER FOR IKKE-HMI ovenfor — Playfair + Outfit + dramatisk hierarki
- Brug KUN Unicode-symboler — aldrig emoji i teknisk kontekst
- Texts in English (technical terms preserved: flow, pressure, HMI, SCADA, etc.)
- Minimumskrav til indhold: mindst 100 linjer CSS, detaljerede værdier fra konteksten
- Inkludér altid disse CSS-keyframes i <style>:
    @keyframes ledAlarm { 0%,100%{opacity:1} 50%{opacity:.25} }
    @keyframes fadeIn   { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
    @keyframes fadeUp   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
    @keyframes spin     { to{transform:rotate(360deg)} }
- Footer: diskret linje med "Genereret af Meeting AI Visualizer · Grundfos" i muted farve, font-size:0.62rem

━━━ TOKEN BUDGET — HOLD OUTPUT COMPACT ━━━
Target: ≤4500 tokens total. Hard cap: 5500 tokens.
- CSS: max ~900 tokens. Reuse classes, no per-element overrides.
- HTML content: max ~3600 tokens. Fill sections with real data from the transcript.
- No comments in the generated HTML or CSS.
- If you would exceed the budget: simplify the layout, reduce the number of cards/panels, and prioritise data richness over visual breadth.
`;

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;

  // POST /api/visualize
  if (req.method === 'POST' && req.url === '/api/visualize') {
    let body = '';
    let bodyTooLarge = false;
    req.on('data', chunk => {
      if (bodyTooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_VIZ_BODY_BYTES) bodyTooLarge = true;
    });
    req.on('end', async () => {
      if (bodyTooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Anmodning for stor.' }));
      }
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Ugyldig JSON.' }));
      }
      const ip = getClientIp(req);
      if (!allowVizRate(ip)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'For mange visualiseringer. Prøv igen om lidt.' }));
      }
      try {
        const {
          transcript: rawTranscript,
          roomId,
          title,
          vizType,
          isIncremental,
          previousViz,
          context,
          isAuto,
          isDesignPrompt,
          lastVizFamily: lastVizFamilyRaw,
        } = parsed;
        let transcript = rawTranscript;
        const roomForViz = roomId && rooms.has(roomId) ? rooms.get(roomId) : null;
        if (roomForViz && roomForViz.transcript.length > 0) {
          const roomJoined = roomForViz.transcript.map(s => `[${s.name}]: ${s.text}`).join('\n');
          transcript = mergeRoomAndClientTranscript(roomJoined, rawTranscript);
        }
        if (!transcript || !transcript.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Ingen transskription modtaget.' }));
        }

        const classification = classifyVisualizationIntent(transcript);
        const clientLastFamily = sanitizeLastVizFamily(lastVizFamilyRaw);
        const resolvedLastFamily = roomForViz?.lastVizFamily ?? clientLastFamily;
        const prevSanitized = String(previousViz || '').trim();
        const hasSubstantialPrev = prevSanitized.length >= 80;
        const clientWantsIncremental = Boolean(isIncremental && hasSubstantialPrev);
        const sameVizFamily = resolvedLastFamily && resolvedLastFamily === classification.family;
        const attachPreviousViz = clientWantsIncremental && sameVizFamily;
        const MAX_PREVIOUS_VIZ_CHARS = attachPreviousViz ? MAX_PREVIOUS_VIZ_CHARS_INCREMENTAL : 80000;

        const transcriptForModel = truncateTranscriptForVizModel(transcript, attachPreviousViz);

        // Stream response via SSE so the client sees output immediately
        res.writeHead(200, {
          'Content-Type':      'text/event-stream',
          'Cache-Control':     'no-cache',
          'Connection':        'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();

        try {
          res.write(`data: ${JSON.stringify({
            meta: {
              family: classification.family,
              topic: classification.topic,
              effectiveIncremental: attachPreviousViz,
              clientRequestedIncremental: clientWantsIncremental,
              resolvedLastFamily,
              scores: classification.scores,
              ambiguous: classification.ambiguous,
              lead: classification.lead,
              runnerUp: classification.runnerUp,
            },
          })}\n\n`);
        } catch (_) {}

        const incrementalBlock = attachPreviousViz ? (() => {
          const prev = prevSanitized;
          const truncated = prev.length > MAX_PREVIOUS_VIZ_CHARS;
          const snippet = truncated ? prev.slice(0, MAX_PREVIOUS_VIZ_CHARS) : prev;
          const tail = truncated ? '\n\n[HTML truncated — preserve and extend the structure you already established.]\n\n' : '\n\n';
          return `INCREMENTAL UPDATE: The meeting has continued. Use the transcript tail (newest content) as the PRIMARY signal — extend and refine the visualization when the topic is the same; change layout/type only if the conversation clearly shifted.\n\nCURRENT VISUALIZATION (reference — keep when still appropriate):\n${snippet}${tail}`;
        })() : '';

        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':      'application/json',
            'x-api-key':         ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 5500,
            stream:     true,
            system:     SYSTEM_PROMPT,
            messages: [{
              role:    'user',
              content: `${title ? `Meeting title: ${title}\n\n` : ''}${context ? `MEETING CONTEXT:\n${context}\n\n` : ''}${isDesignPrompt ? 'Design instructions for visualization:' : 'Here is the meeting transcript:'}\n\n${transcriptForModel}\n\n${vizType && vizType !== 'auto' ? `IMPORTANT: Generate SPECIFICALLY this visualization type — nothing else: ${vizType}\n\n` : ''}${incrementalBlock}Generate an appropriate HTML visualization.`,
            }],
          }),
        });

        if (!apiRes.ok) {
          const errText = await apiRes.text();
          console.error('Anthropic API fejl:', errText);
          let errMsg = `API ${apiRes.status}`;
          try { const j = JSON.parse(errText); errMsg = j.error?.message || j.error?.type || errMsg; } catch (_) {}
          try { res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`); } catch (_) {}
          return res.end();
        }

        // Pipe Anthropic SSE → client SSE, accumulate full HTML
        let fullHtml = '';
        const reader  = apiRes.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop(); // keep incomplete last line
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const evt = JSON.parse(raw);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                const chunk = evt.delta.text;
                fullHtml += chunk;
                res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
              }
            } catch (_) {}
          }
        }

        // Save and signal completion (strip any code fences the model added)
        const cleanHtml = stripCodeFences(fullHtml.trim());

        // Quality gate: if output is too short it is an incomplete/failed generation.
        // Never send a broken visualization — tell the client to keep the previous one.
        if (cleanHtml.length < MIN_VIZ_CHARS) {
          console.warn(`[viz] quality gate: output too short (${cleanHtml.length} chars < ${MIN_VIZ_CHARS}) — discarding`);
          res.write(`data: ${JSON.stringify({ tooShort: true })}\n\n`);
          return res.end();
        }

        const id = crypto.randomUUID();
        const record = saveMeeting(id, title, transcript, cleanHtml);
        if (roomForViz) {
          roomForViz.lastVizFamily = classification.family;
          try { persistRoom(roomId, roomForViz); } catch (_) {}
        }
        const vizMetaFull = {
          family: classification.family,
          topic: classification.topic,
          effectiveIncremental: attachPreviousViz,
          scores: classification.scores,
          ambiguous: classification.ambiguous,
          lead: classification.lead,
          runnerUp: classification.runnerUp,
        };
        res.write(`data: ${JSON.stringify({
          done: true,
          id,
          title: record.title,
          vizMeta: vizMetaFull,
        })}\n\n`);
        res.end();

        // Broadcast completed visualization to ALL other room members (real-time sharing)
        if (roomId && rooms.has(roomId)) {
          broadcastToRoom(roomId, 'visualization', {
            id,
            title: record.title,
            html: cleanHtml,
            vizMeta: vizMetaFull,
          });
        }
      } catch (err) {
        console.error('Serverfejl:', err.message);
        try { res.write(`data: ${JSON.stringify({ error: 'Intern serverfejl' })}\n\n`); } catch (_) {}
        res.end();
      }
    });
    return;
  }

  // POST /api/room/create
  if (req.method === 'POST' && req.url === '/api/room/create') {
    const id = createRoom();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id }));
  }

  // GET /api/room/:id/events?name=...  (SSE — long-lived connection)
  const roomEventsMatch = req.url.match(/^\/api\/room\/([A-Z0-9]{6})\/events(\?.*)?$/);
  if (req.method === 'GET' && roomEventsMatch) {
    const roomId = roomEventsMatch[1];
    const qs    = new URLSearchParams(roomEventsMatch[2] ? roomEventsMatch[2].slice(1) : '');
    const name  = qs.get('name') || 'Anonym';
    if (!rooms.has(roomId)) {
      // Try to restore from disk (server may have restarted mid-meeting)
      const saved = loadPersistedRoom(roomId);
      if (saved) {
        rooms.set(roomId, {
          id: roomId,
          createdAt: Date.now(),
          clients: new Map(),
          transcript: saved.transcript,
          lastVizFamily: saved.lastVizFamily ?? null,
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Møderum ikke fundet.' }));
      }
    }
    res.writeHead(200, {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const room = rooms.get(roomId);
    // Send current state to this new joiner
    res.write(`event: init\ndata: ${JSON.stringify({ transcript: room.transcript, participants: [...room.clients.keys()] })}\n\n`);
    // Register client
    room.clients.set(name, res);
    broadcastToRoom(roomId, 'join', { name, participants: [...room.clients.keys()] }, name);
    // Heartbeat every 20s to keep connection alive through proxies
    const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      room.clients.delete(name);
      broadcastToRoom(roomId, 'leave', { name, participants: [...room.clients.keys()] });
    });
    return;
  }

  // POST /api/room/:id/segment
  const roomSegMatch = req.url.match(/^\/api\/room\/([A-Z0-9]{6})\/segment$/);
  if (req.method === 'POST' && roomSegMatch) {
    const roomId = roomSegMatch[1];
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { name, text } = JSON.parse(body);
        const room = rooms.get(roomId);
        if (!room) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Møderum ikke fundet.' }));
        }
        const segment = { name: name || 'Anonym', text, timestamp: new Date().toISOString() };
        room.transcript.push(segment);
        persistRoom(roomId, room); // survive server restarts
        broadcastToRoom(roomId, 'segment', segment, name); // don't echo back to sender
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /api/room/:id/state
  const roomStateMatch = req.url.match(/^\/api\/room\/([A-Z0-9]{6})\/state$/);
  if (req.method === 'GET' && roomStateMatch) {
    const room = rooms.get(roomStateMatch[1]);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Møderum ikke fundet.' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id: room.id, transcript: room.transcript, participants: [...room.clients.keys()] }));
  }

  // GET /api/deepgram-token — returns API key to browser (prototype only). Set ALLOW_DEEPGRAM_KEY_TO_BROWSER=false to disable.
  if (req.method === 'GET' && req.url === '/api/deepgram-token') {
    if (!ALLOW_DEEPGRAM_KEY_TO_BROWSER) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Deepgram browser token er deaktiveret på serveren.' }));
    }
    if (!DEEPGRAM_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured on server.' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ key: DEEPGRAM_API_KEY }));
  }

  // POST /api/actions — Ekstraher beslutninger og handlingspunkter
  if (req.method === 'POST' && req.url === '/api/actions') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { transcript: rawTranscript, roomId, title, context } = JSON.parse(body);
        let transcript = rawTranscript;
        if (roomId && rooms.has(roomId)) {
          const room = rooms.get(roomId);
          if (room.transcript.length > 0) {
            transcript = room.transcript.map(s => `[${s.name}]: ${s.text}`).join('\n');
          }
        }
        if (!transcript || !transcript.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Ingen transskription.' }));
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders();
        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            stream: true,
            system: `Du er en mødeassistent for Grundfos. Analyser mødetransskriptionen og returner KUN valid HTML med inline CSS — ingen markdown, ingen forklaringer.

Generer et struktureret HTML-kort med:
1. BESLUTNINGER — konkrete beslutninger truffet i mødet (med bullet-punkter)
2. HANDLINGSPUNKTER — næste skridt med ansvarlig person og deadline hvis nævnt
3. ÅBNE SPØRGSMÅL — uafklarede punkter der kræver opfølgning

HTML-styling skal matche Grundfos brand:
- Primær farve: #002A5C (navy)
- Accent: #0077C8 (blå)
- Baggrund: hvid, kort med border-radius: 12px, box-shadow
- Font: system-ui, sans-serif
- Brug grønne check-ikoner (✓) for beslutninger, pile (→) for handlinger, spørgsmålstegn (?) for åbne punkter
- Kompakt, professionelt layout — maks 600px bredde, centreret
- Ingen <html>/<body>/<head> tags — kun en <div> container`,
            messages: [{
              role: 'user',
              content: `${title ? `Mødetitel: ${title}\n\n` : ''}${context ? `Kontekst: ${context}\n\n` : ''}Transskription:\n\n${transcript}\n\nGenerer beslutninger og handlingspunkter som HTML.`,
            }],
          }),
        });
        if (!apiRes.ok) { res.write(`data: ${JSON.stringify({ error: 'Claude API fejl' })}\n\n`); return res.end(); }
        let fullHtml = '';
        for await (const chunk of apiRes.body) {
          const lines = Buffer.from(chunk).toString('utf8').split('\n');
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (raw === '[DONE]') continue;
            let ev; try { ev = JSON.parse(raw); } catch { continue; }
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              const t = ev.delta.text;
              fullHtml += t;
              try { res.write(`data: ${JSON.stringify({ chunk: t })}\n\n`); } catch (_) {}
            }
            if (ev.type === 'message_stop') {
              try { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); } catch (_) {}
              res.end(); return;
            }
          }
        }
        res.end();
      } catch (err) {
        console.error('Actions fejl:', err);
        try { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); } catch (_) {}
        res.end();
      }
    });
    return;
  }

  // POST /api/design-prompt — kondensér transskription til designprompt via Haiku
  if (req.method === 'POST' && req.url === '/api/design-prompt') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { transcript } = JSON.parse(body);
        if (!transcript || transcript.trim().length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Ingen transskription.' }));
        }
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system: `You condense meeting transcriptions into a short, precise design prompt for an HTML visualisation.
Return ONLY the prompt itself — no explanation, no markdown, no colon introduction.
Max 5 sentences. Write in English.
The prompt must state: what to visualise, which type (kanban/dashboard/timeline/mindmap/requirements/decision-log), the most important concrete points from the meeting, and any key names, values, or decisions.`,
            messages: [{ role: 'user', content: `Transcript:\n${transcript.slice(0, 3000)}` }],
          }),
        });
        const d = await r.json();
        const prompt = d.content?.[0]?.text?.trim() || '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // GET /api/history
  if (req.method === 'GET' && req.url === '/api/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(loadHistory()));
  }

  // GET /api/meeting/:id
  const meetingMatch = req.url.match(/^\/api\/meeting\/([^/?]+)$/);
  if (req.method === 'GET' && meetingMatch) {
    const meeting = loadMeeting(meetingMatch[1]);
    if (!meeting) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Møde ikke fundet.' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(meeting));
  }

  // DELETE /api/meeting/:id
  const deleteMeetingMatch = req.url.match(/^\/api\/meeting\/([^/?]+)$/);
  if (req.method === 'DELETE' && deleteMeetingMatch) {
    const ok = deleteMeeting(deleteMeetingMatch[1]);
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok }));
  }

  // Serve static files from /public
  const filePath = path.join(__dirname, 'public', url);
  const ext      = path.extname(filePath);
  const mime     = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🎙️  Meeting AI Visualizer kører på http://localhost:${PORT}`);
  console.log(`   Åbn Chrome og gå til adressen ovenfor.\n`);
});
