export interface PreviewUpdate {
  step: number;
  batch: number;
  preview: string;
}

export interface FinalResult {
  variants: string[];
  completed?: boolean[];
  failed?: boolean[];
}

export type AppView = "CAMERA" | "RESULT" | "SETTINGS";

export interface StreamConfig {
  codec: string;
  width: number;
  height: number;
}
