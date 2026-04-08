/** Server debug snapshot til DBG-panel og session-eval (ingen prompt i eksport). */
export interface VizDebugInfo {
  timestamp?: string;
  classification?: {
    inputMode: string;
    inputWords: number;
    totalWords: number;
    inputText: string;
    family: string;
    topic: string;
    lead: number;
    ambiguous: boolean;
    allScores: Array<{ family: string; score: number }>;
  } | null;
  userPickedType?: boolean;
  vizType?: string;
  resolvedFamily?: string | null;
  vizModel?: string;
  isIncremental?: boolean;
  isRefinement?: boolean;
  refinementDirective?: string | null;
  hasPreviousHtml?: boolean;
  focusSegment?: string | null;
  transcriptTotalWords?: number;
  roomId?: string | null;
  prompt?: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    maxTokens: number;
  } | null;
  performanceMs?: number | null;
}
