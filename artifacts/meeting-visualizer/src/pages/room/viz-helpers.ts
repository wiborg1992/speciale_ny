import type { VizDebugInfo } from "@/types/viz-debug";

export function extractVizName(html: string): string | null {
  const div = document.createElement("div");
  div.innerHTML = html;
  const h1 = div.querySelector("h1");
  if (h1 && h1.textContent && h1.textContent.trim().length > 2)
    return h1.textContent.trim().slice(0, 42);
  const h2 = div.querySelector("h2");
  if (h2 && h2.textContent && h2.textContent.trim().length > 2)
    return h2.textContent.trim().slice(0, 42);
  return null;
}

export function cloneVizDebug(
  info: VizDebugInfo | null | undefined,
): VizDebugInfo | null {
  if (!info) return null;
  try {
    return structuredClone(info) as VizDebugInfo;
  } catch {
    try {
      return JSON.parse(JSON.stringify(info)) as VizDebugInfo;
    } catch {
      return { ...info };
    }
  }
}
