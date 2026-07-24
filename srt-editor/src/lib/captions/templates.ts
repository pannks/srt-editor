import type { CaptionLayer } from "./types";

/**
 * Ready-made caption looks. Each is a patch applied to the selected layer,
 * touching only style — never the layer's identity, language or position — so a
 * template can be dropped on any line without moving it. The studio renders each
 * as a live sample chip so the picker reads as a visual gallery.
 */
export interface CaptionTemplate {
  id: string;
  /** i18n key for the display name. */
  nameKey: string;
  /** Sample text shown in the chip; style, not words. */
  sample: string;
  /** Style fields to copy onto the layer. */
  patch: Partial<CaptionLayer>;
}

/**
 * Every chip shows the same phrase so the picker compares looks, not words.
 * One phrase per script: Latin templates read the Latin sample, Thai templates
 * the Thai one, so their fonts actually render their script.
 */
const SAMPLE = "The quick brown fox";
const SAMPLE_TH = "สุนัขจิ้งจอกสีน้ำตาล";

export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: "clean",
    nameKey: "captions.tpl.clean",
    sample: SAMPLE,
    patch: {
      fontFamily: "Arial",
      bold: true,
      color: "#ffffff",
      outlineColor: "#000000",
      outlineWidth: 2,
      shadow: 1,
      animation: "none",
      bgEnabled: false,
    },
  },
  {
    id: "karaoke",
    nameKey: "captions.tpl.karaoke",
    sample: SAMPLE,
    patch: {
      fontFamily: "Montserrat",
      bold: true,
      color: "#ffffff",
      highlightColor: "#ffd400",
      outlineColor: "#000000",
      outlineWidth: 2.5,
      shadow: 1,
      animation: "karaoke",
      bgEnabled: false,
    },
  },
  {
    id: "punch",
    nameKey: "captions.tpl.punch",
    sample: SAMPLE,
    patch: {
      fontFamily: "Anton",
      bold: true,
      color: "#ffffff",
      highlightColor: "#a855f7",
      outlineColor: "#000000",
      outlineWidth: 3,
      shadow: 2,
      fontSizePct: 8,
      animation: "word",
      bgEnabled: false,
    },
  },
  {
    id: "highlightBox",
    nameKey: "captions.tpl.highlightBox",
    sample: SAMPLE,
    patch: {
      fontFamily: "Poppins",
      bold: true,
      color: "#ffffff",
      highlightColor: "#22c55e",
      outlineColor: "#000000",
      outlineWidth: 0,
      shadow: 0,
      animation: "highlight",
      bgEnabled: true,
      bgColor: "#000000",
      bgOpacity: 0.55,
    },
  },
  {
    id: "neon",
    nameKey: "captions.tpl.neon",
    sample: SAMPLE,
    patch: {
      fontFamily: "Oswald",
      bold: true,
      color: "#eaffea",
      highlightColor: "#39ff14",
      outlineColor: "#003b00",
      outlineWidth: 2,
      shadow: 2,
      animation: "highlight",
      bgEnabled: false,
    },
  },
  {
    id: "tall",
    nameKey: "captions.tpl.tall",
    sample: SAMPLE,
    patch: {
      fontFamily: "Bebas Neue",
      bold: true,
      color: "#ffffff",
      highlightColor: "#ff2d55",
      outlineColor: "#000000",
      outlineWidth: 2,
      shadow: 1,
      fontSizePct: 8,
      animation: "pop",
      bgEnabled: false,
    },
  },
  {
    id: "thai",
    nameKey: "captions.tpl.thai",
    sample: SAMPLE_TH,
    patch: {
      fontFamily: "Kanit",
      bold: true,
      color: "#ffffff",
      highlightColor: "#ffd400",
      outlineColor: "#000000",
      outlineWidth: 2.5,
      shadow: 1,
      animation: "karaoke",
      bgEnabled: false,
    },
  },
  {
    id: "thaiHighlight",
    nameKey: "captions.tpl.thaiHighlight",
    sample: SAMPLE_TH,
    patch: {
      fontFamily: "Prompt",
      bold: true,
      color: "#ffffff",
      highlightColor: "#3b82f6",
      outlineColor: "#000000",
      outlineWidth: 0,
      shadow: 0,
      animation: "highlight",
      bgEnabled: true,
      bgColor: "#111827",
      bgOpacity: 0.6,
    },
  },
];
