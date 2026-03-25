import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type VizModel = "haiku" | "sonnet" | "opus";

const MODEL_IDS: Record<VizModel, string> = {
  haiku:  "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-5",
  opus:   "claude-opus-4-5",
};

const MAX_TOKENS: Record<VizModel, number> = {
  haiku:  3500,
  sonnet: 4500,
  opus:   8000,
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

const SYSTEM_PROMPT = `You are an expert at analysing Grundfos meeting transcripts and generating ONE professional HTML visualisation.

Return ONLY valid HTML — no markdown, no explanations, no code fences.

━━━ PICK ONE VISUAL TYPE (commit fully to its language) ━━━
Do NOT default to dark HMI unless the meeting is explicitly about SCADA/HMI/control UI/iSolutions.

- user journey / brugerrejse / steps / flow / onboarding → USER JOURNEY MAP (light bg, swim lanes, emotion dots — no dark HMI)
- physical pump / hardware / Alpha / CR / Magna → PUMP ILLUSTRATION (light bg, SVG product, Grundfos red #BE1E2D)
- workflow / process / flowchart / decision → WORKFLOW (light, SVG flowchart, swim lanes OK)
- compare / vs / pros cons → COMPARISON CARDS (side-by-side, navy #002A5C accents)
- stakeholders / roles / org → STAKEHOLDER MAP (SVG concentric or structured cards)
- timeline / phases / roadmap → TIMELINE (horizontal SVG phases)
- tasks / kanban / backlog → KANBAN columns
- decisions / we decided → DECISION LOG (editorial cards)
- HMI / SCADA / control panel / betjeningspanel / iSolutions screen → HMI DASHBOARD ONLY then:
  Dark iSolutions: bg #0d1421, panels #111827 / #141e2e, accent #00c8ff, text #fff / #a8b8cc, status #00d084 / #ffb800 / #ff4757.
  Layout: left sidebar (~56px) + top bar + tab row + panel grid with metrics, charts (SVG), tiles. Monospace for numbers.
- else → COMBINED OVERVIEW or best match above

━━━ MULTI-SPEAKER ━━━
If lines look like [Name]: text — show speaker on quotes/cards; assign owners on actions/decisions.

━━━ GRUNDFOS BRAND ━━━
Navy #002A5C, blue #0077C8, light #E8F4FD, text #333 on light / #fff on dark. Professional engineering aesthetic.

━━━ PUMP / TECH TERMS ━━━
When relevant use: flow (m³/h), pressure/bar, NPSH, IE class, BMS, centrifugal pump — reflect in labels/metrics.

━━━ NAVIGATION CATEGORIES — CONTENT MAP ━━━
When you generate tabs/sections with these labels (DA or EN), fill the FIRST panel fully and mark the rest for lazy fill. Each category has a canonical set of content:

Safety / Sikkerhed:
  Alarm limit table (parameter | low limit | high limit | unit), emergency stop status (LED + label), pressure relief valve state, last 5 alarms (timestamp | event | ACK), SIL/ATEX level if mentioned.

Operation / Drift:
  Live metrics grid: flow (m³/h), pressure (bar), speed (RPM), power (kW), efficiency (%). START/STOP button (stateful). Run-hours, current mode chip (Auto/Manual/Service). Mini sparkline SVG (6 bars, last trend).

Settings / Indstilling:
  Setpoint inputs (flow + pressure targets, type=number). PID fields (Kp, Ki, Kd). Operating schedule table (day | start | stop | setpoint). Save button → shows "Saved ✓" confirmation on click.

Maintenance / Vedligehold:
  Next service countdown (days). Last service log. Component wear bars: bearing/seal/impeller (0–100%). Open work orders list.

Energy / Energi:
  kWh today/week/month. IE class badge. CO₂ savings. Efficiency curve (SVG path). Tariff period chips.

History / Historik / Log:
  Scrollable event table: timestamp | severity | event | value | operator. Severity chips (INFO/WARN/ALARM) that filter the table on click.

Communications / Kommunikation:
  Protocol status chips (BACnet/Modbus/PROFINET). IP/node address. Last heartbeat. Connected controller list.

Overview / Oversigt (default first tab):
  3–4 KPI tiles (most important numbers), pump status map if multiple pumps, key decisions/actions from transcript.

For any category not listed: extract the most relevant metrics, decisions, and actions from the transcript that belong to that label.

━━━ TRANSCRIPT QUALITY ━━━
Ignore filler (uh, um, like, you know, øh, altså), noise, obvious ASR garbage. Mixed EN/DA OK.
If <8 meaningful words, return a minimal "Awaiting input…" panel.

━━━ REGULATORY (CER / NIS2 / IEC 62443 / ATEX) ━━━
Treat as compliance LAYER: table Requirement | Status | Owner — not physical hardware. CER≈physical resilience, NIS2≈cyber.

━━━ NON-HMI DESIGN (when not HMI) ━━━
@import Google Fonts: Playfair Display, Outfit, Space Mono (same URL pattern as before).
No plain white-only pages — use structured bg (#F0F4F8 stripes or navy hero strip), cards with shadow and #0077C8 left bar or accent.
Staggered fadeUp on main blocks. Strong type hierarchy (hero 3rem+, section 1.4rem+).

━━━ INTERACTIVITY (embed in the HTML; no external libraries) ━━━
The visualization must feel genuinely usable. MANDATORY: Every non-trivial output MUST include real controls.

A) LOGIN FLOW — when transcript mentions a login screen/onboarding: generate real login screen + dashboard behind it.
B) STATEFUL CONTROLS — pump panels, HMI controls: START/STOP buttons toggle running class, MODE selector switches three visual states, ALARM ACK clears ledAlarm.
C) HOST TABS (HMI / top nav — required when showing horizontal section tab bar):
<div data-viz-host-tabs="1" data-viz-lazy-tabs="1" class="(your root class)">
  <div role="tablist" class="(tab strip class)">
    <button type="button" role="tab" data-viz-tab="0" aria-selected="true" class="viz-tab-active (your tab class)">OVERVIEW</button>
    <button type="button" role="tab" data-viz-tab="1" aria-selected="false" class="(your tab class)">SAFETY</button>
  </div>
  <div class="(panels wrapper)">
    <section data-viz-tab-panel="0" style="display:block">…FULL content for tab 0 only…</section>
    <section data-viz-tab-panel="1" style="display:none" hidden data-viz-pending="1" data-viz-tab-label="Safety"><p style="color:#a8b8cc;padding:1rem">Loading…</p></section>
  </div>
</div>
Rules: data-viz-tab value MUST match data-viz-tab-panel value. First panel: style="display:block" — NO hidden. Non-first: style="display:none" AND hidden AND data-viz-pending="1".
D) TABS (CSS-only): Hidden radio + labels for simple layouts.
E) TOGGLES: data-viz-toggle="selector" — host toggles class viz-open.
F) COLLAPSIBLE: <details><summary> for drill-down metrics.
G) HOVER: All cards/buttons use cursor:pointer and :hover state.
H) IN-PAGE NAV: id= on major sections + <a href="#id"> in mini nav or chips.

SCRIPT RULES: No external scripts. No fetch/XHR. No alert()/confirm(). No eval(). Inline <script> allowed for stateful interactions (A and B above).

━━━ OUTPUT ━━━
Format: <style>/* all CSS */</style><div>/* content */</div>
Single <style> block. 16:9-friendly, min-width ~800px.
Include keyframes: ledAlarm, fadeIn, fadeUp, spin.
Footer: small muted "Generated by Meeting AI Visualizer · Grundfos".

TOKEN BUDGET — target ≤4000 tokens total:
- CSS: max ~800 tokens. Reuse classes.
- First panel content: ~1800 tokens. Prefer working controls over decorative tiles.
- Lazy panels (1+): placeholder only — ONE short <p> each.
- Fill every field with realistic placeholder data (no empty strings, no "N/A").`;

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
}

export async function* streamVisualization(
  params: VisualizerParams,
  onChunk: (chunk: string) => void
): AsyncGenerator<string> {
  const { transcript, vizType, vizModel, title, context, previousHtml, freshStart } = params;

  const model = MODEL_IDS[vizModel ?? "haiku"];
  const maxTokens = MAX_TOKENS[vizModel ?? "haiku"];

  const transcriptForModel = truncateTranscript(transcript);

  const isIncremental = !freshStart && !!previousHtml && previousHtml.trim().length > 80;

  let userMessage = "";
  if (title) userMessage += `Meeting title: ${title}\n\n`;
  if (context) userMessage += `MEETING CONTEXT:\n${context}\n\n`;
  userMessage += `Here is the meeting transcript:\n\n${transcriptForModel}\n\n`;

  if (vizType && vizType !== "auto") {
    userMessage += `IMPORTANT: Generate SPECIFICALLY this visualization type — nothing else: ${vizType}\n\n`;
  }

  if (isIncremental && previousHtml) {
    const { snippet, truncated } = truncatePreviousViz(previousHtml);
    const tail = truncated
      ? "\n\n[Prior HTML was compressed — preserve and extend the structure you already established.]\n\n"
      : "\n\n";
    userMessage +=
      `INCREMENTAL UPDATE: You have already generated a visualization for this meeting (attached below). The meeting has continued — update and extend the visualization with the latest information from the transcript. Preserve the overall layout, components, and visual language; refine and add content rather than starting from a blank slate unless the transcript clearly demands a new structure.\n\nCURRENT VISUALIZATION (HTML):\n${snippet}${tail}`;
  }

  userMessage += "Generate an appropriate HTML visualization.";

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
    max_tokens: 3000,
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
