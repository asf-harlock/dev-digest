import { VIEW_MODES, type ViewMode } from "./constants";

/** `?view=` → a mode; anything but `tabs` falls back to Columns (AC-18). */
export function parseView(raw: string | null | undefined): ViewMode {
  return (VIEW_MODES as readonly string[]).includes(raw ?? "") ? (raw as ViewMode) : "columns";
}
