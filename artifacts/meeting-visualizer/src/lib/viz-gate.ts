/** Synkroniseret tærskel med api-server transcript-quality (manuel/auto-viz gate). */
export const MIN_WORDS_FOR_VISUALIZATION = 5;

export function countTranscriptWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function passesVisualizationWordGate(transcript: string, userPickedType: boolean): boolean {
  if (userPickedType) return true;
  return countTranscriptWords(transcript) >= MIN_WORDS_FOR_VISUALIZATION;
}
