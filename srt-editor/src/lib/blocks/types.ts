export interface SubtitleBlock {
  id: string;
  /** start time in seconds */
  start: number;
  /** end time in seconds */
  end: number;
  text: string;
}

let counter = 0;
export function newBlockId(): string {
  counter += 1;
  return `b${Date.now().toString(36)}-${counter}`;
}
