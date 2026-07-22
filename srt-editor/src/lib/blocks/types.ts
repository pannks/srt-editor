export interface SubtitleBlock {
  id: string;
  /** start time in seconds */
  start: number;
  /** end time in seconds */
  end: number;
  text: string;
  /**
   * Translations of `text`, keyed by ISO language code. Absent until the block
   * has been translated; a language is absent until that language has run.
   */
  translations?: Record<string, string>;
}

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}-${counter}`;
}
