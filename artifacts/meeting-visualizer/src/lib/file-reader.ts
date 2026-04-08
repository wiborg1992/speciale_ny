import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pageTexts.push(pageText);
  }
  return pageTexts.join("\n\n");
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file, "utf-8");
  });
}

const TEXT_MIME_PREFIXES = ["text/", "application/json", "application/xml", "application/javascript", "application/typescript"];
const TEXT_EXTENSIONS = new Set([
  "txt","md","csv","json","yaml","yml","toml","ini","conf","log","ts","tsx","js","jsx","py","rb","go","rs","java","kt","swift","c","cpp","h","hpp","cs","sh","bash","zsh","fish","ps1","html","htm","css","scss","sass","less","svg","xml","graphql","gql","sql","env","dockerfile","gitignore","editorconfig",
]);

function isBinaryFile(file: File): boolean {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return false;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(ext)) return false;
  if (TEXT_MIME_PREFIXES.some((p) => file.type.startsWith(p))) return false;
  if (!file.type) return false; // unknown type → try as text
  return true;
}

export async function readFileContent(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(file);
  }
  if (isBinaryFile(file)) {
    return `[Binær fil — indhold ikke læsbart som tekst: ${file.name}]`;
  }
  return readAsText(file);
}
