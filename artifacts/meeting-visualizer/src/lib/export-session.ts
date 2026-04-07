import JSZip from "jszip";

const BASE = import.meta.env.BASE_URL;

interface Segment {
  segmentId?: string;
  speakerName: string;
  text: string;
  timestamp: string;
  isFinal?: boolean;
}

interface Visualization {
  html: string;
  family: string;
  version: number;
  wordCount?: number;
}

interface Sketch {
  sketchId: string;
  sceneJson: string;
  previewPngBase64: string;
  createdAt: string;
}

interface MeetingExportData {
  meeting: {
    roomId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    segmentCount: number;
    wordCount: number;
    speakerNames: string;
  };
  segments: Segment[];
  visualizations: Visualization[];
  sketches: Sketch[];
}

function formatTranscript(segments: Segment[]): string {
  const lines: string[] = [];
  let lastSpeaker = "";
  for (const seg of segments) {
    const ts = seg.timestamp ? new Date(seg.timestamp).toLocaleTimeString("en-GB") : "";
    if (seg.speakerName !== lastSpeaker) {
      if (lines.length > 0) lines.push("");
      lines.push(`[${seg.speakerName}]${ts ? "  " + ts : ""}`);
      lastSpeaker = seg.speakerName;
    }
    lines.push(seg.text.trim());
  }
  return lines.join("\n");
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();
}

export async function exportSession(roomId: string, title: string): Promise<void> {
  const res = await fetch(`${BASE}api/meetings/${encodeURIComponent(roomId)}`);
  if (!res.ok) throw new Error(`Could not fetch session data (${res.status})`);

  const data: MeetingExportData = await res.json();
  const { meeting, segments, visualizations, sketches } = data;

  const zip = new JSZip();
  const slug = sanitizeFilename(title || roomId);
  const root = zip.folder(slug)!;

  const speakers = (() => {
    try {
      const p = JSON.parse(meeting.speakerNames);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })();

  const meta = {
    roomId: meeting.roomId,
    title: meeting.title,
    exportedAt: new Date().toISOString(),
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    speakers,
    segmentCount: meeting.segmentCount,
    wordCount: meeting.wordCount,
    visualizationCount: visualizations.length,
    sketchCount: sketches.length,
  };

  root.file("session-info.json", JSON.stringify(meta, null, 2));

  if (segments.length > 0) {
    root.file("transcription.txt", formatTranscript(segments));
    root.file("transcription.json", JSON.stringify(segments, null, 2));
  }

  if (visualizations.length > 0) {
    const vizFolder = root.folder("visualizations")!;
    for (const viz of visualizations) {
      const num = String(viz.version).padStart(2, "0");
      const familySlug = sanitizeFilename(viz.family || "viz");
      const filename = `v${num}_${familySlug}.html`;
      const wrapper = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${meeting.title || roomId} — Visualization v${viz.version}</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;">
<!-- Session: ${meeting.roomId} | Family: ${viz.family} | Version: ${viz.version} | Words at generation: ${viz.wordCount ?? "?"} -->
${viz.html}
</body>
</html>`;
      vizFolder.file(filename, wrapper);
    }
  }

  if (sketches.length > 0) {
    const sketchFolder = root.folder("sketches")!;
    sketches.forEach((sketch, i) => {
      const num = String(i + 1).padStart(2, "0");
      sketchFolder.file(`sketch-${num}-scene.json`, sketch.sceneJson);
      const pngData = sketch.previewPngBase64.replace(/^data:image\/png;base64,/, "");
      sketchFolder.file(`sketch-${num}-preview.png`, pngData, { base64: true });
    });
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}_export.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
