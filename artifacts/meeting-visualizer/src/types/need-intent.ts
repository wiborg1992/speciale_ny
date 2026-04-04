/** Payload fra server SSE-event type: "need_intent" */
export interface NeedIntentPayload {
  disambiguationReason: "refinement_vs_topic_shift";
  defaultChoice: "fresh" | "refine";
  /** Dansk forklaringstekst til UI */
  explanation: string;
  detectedFamily: string | null;
  currentFamily: string | null;
  scores: Array<{ family: string; score: number }>;
}
