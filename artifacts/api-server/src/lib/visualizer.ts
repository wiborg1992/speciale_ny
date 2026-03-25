import Anthropic from "@anthropic-ai/sdk";
import type { VizFamily } from "./normalizer.js";

const client = new Anthropic();

const FAMILY_INSTRUCTIONS: Record<VizFamily, string> = {
  hmi: `Create an HMI/SCADA dashboard visualization. Use industrial color palette:
- Background: #1a1a2e or #0d1117 (dark)
- Active/OK: #00c851 (green)
- Warning: #ffbb33 (amber)  
- Alarm: #ff4444 (red)
- Data values: #00bcd4 (cyan)
- Grundfos brand blue: #003d73
Include: status indicators, gauges/meters as SVG, sensor values, flow diagrams with arrows, pump icons represented as circles with rotating arrows. Make it look like a real industrial control system.`,

  journey: `Create a User Journey Map visualization. Use warm, professional colors:
- Background: #ffffff or #f8f9fa
- Journey phases in horizontal bands
- Touchpoints as rounded cards
- Emotions line (high/low arc)
- Pain points in red/orange
- Opportunities in green
- Grundfos colors: #003d73 (dark blue), #0066cc (mid blue)
Show 4-6 phases, each with actions, touchpoints, emotions, and pain/gain points.`,

  workflow: `Create a Workflow/Process diagram visualization. Use clean business style:
- Background: #ffffff
- Process boxes: #e3f2fd (light blue) with #1565c0 borders
- Decision diamonds: #fff9c4 (yellow) with #f57f17 borders  
- Arrows in #455a64
- Start/End: #1b5e20 green ovals
- Grundfos brand: use #003d73 for header accents
Show swimlanes if multiple actors. Number each step. Include conditional paths where relevant.`,

  product: `Create a Product/Hardware visualization. Use technical drawing style:
- Background: #fafafa
- Component outlines: #37474f with subtle fills
- Labels with leader lines
- Specifications table
- Exploded or cross-section view style  
- Grundfos colors: #003d73 headers
Include: component names, key dimensions/specs mentioned, material callouts. Make it look like a technical product sheet.`,

  requirements: `Create a Requirements/Specification visualization. Use structured document style:
- Background: #ffffff
- Priority color coding: High=#c62828, Medium=#e65100, Low=#2e7d32
- Categories in cards with icons
- Must/Should/Could columns (MoSCoW)
- Grundfos brand header: #003d73
Include: requirement IDs, priority badges, compliance tags (ISO/IEC/ATEX if mentioned), category groupings.`,

  management: `Create a Management Overview / Strategic visualization. Use executive presentation style:
- Background: #ffffff or #f5f5f5
- KPIs in bold metric cards
- Timeline/roadmap as horizontal bars
- Risk matrix as colored grid
- Budget bars in blue gradient
- Grundfos colors: #003d73 primary
Include: summary metrics, status indicators (RAG), key milestones, named owners if mentioned.`,

  general: `Create a clear and informative visualization based on the content discussed. Use professional colors:
- Background: #ffffff
- Grundfos colors: #003d73 (dark blue), #0066cc (mid blue), #009fda (light blue)
- Good contrast, clean typography
- Organize information in logical visual groups (cards, tables, diagrams as appropriate)
- Add icons and visual hierarchy to make key points stand out`,
};

const SYSTEM_PROMPT = `You are a specialized visualization generator for industrial meetings, particularly for Grundfos (a world-leading pump manufacturer) and similar industrial/engineering contexts.

Your task: Convert meeting transcript content into a SINGLE self-contained HTML file with embedded CSS that visually represents what was discussed.

STRICT OUTPUT FORMAT:
- Output ONLY valid HTML starting with <!DOCTYPE html> or <html>
- All CSS must be embedded in <style> tags inside the HTML
- No JavaScript (static HTML+CSS only)
- No external dependencies or CDN links
- The HTML will be rendered in an iframe at roughly 800x600px
- Make it dense with information — fill the space
- Use SVG for diagrams, icons, and charts where appropriate

QUALITY REQUIREMENTS:
- Looks like a professional business tool, not a generic template
- Shows specific content from the transcript (names, numbers, terms mentioned)
- Visual hierarchy that guides the eye to the most important information
- Responsive to the iframe container (use flexbox/grid, avoid fixed pixel widths)`;

export async function* streamVisualization(
  transcript: string,
  family: VizFamily,
  previousHtml: string | null,
  onChunk: (chunk: string) => void
): AsyncGenerator<string> {
  const familyInstructions = FAMILY_INSTRUCTIONS[family];

  const userMessage = previousHtml
    ? `Here is the meeting transcript so far:

<transcript>
${transcript}
</transcript>

Here is the previous visualization to build upon (same family: ${family}):

<previous_html>
${previousHtml.substring(0, 8000)}
</previous_html>

Please update and enhance the visualization to incorporate new information from the transcript. Keep the same visual style and structure, but add/update content based on what's new. Output complete updated HTML.

VISUALIZATION TYPE INSTRUCTIONS:
${familyInstructions}`
    : `Here is the meeting transcript:

<transcript>
${transcript}
</transcript>

Create a ${family} type visualization based on this transcript.

VISUALIZATION TYPE INSTRUCTIONS:
${familyInstructions}`;

  const stream = client.messages.stream({
    model: "claude-opus-4-5",
    max_tokens: 4000,
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

export function isHtmlQualityOk(html: string): boolean {
  if (!html || html.length < 200) return false;
  if (!html.includes("<html") && !html.includes("<!DOCTYPE")) return false;
  if (!html.includes("<style") && !html.includes("style=")) return false;
  return true;
}
