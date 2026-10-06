import type { ToolId } from "../operations/catalog";
import type { Job, Language } from "../types";
import { ScreeningForm } from "./ScreeningForm";
import { LibraryForm } from "./LibraryForm";
import { DELForm } from "./DELForm";
import { BatchDockingForm } from "./BatchDockingForm";
import "./datasets.css";
export function DatasetForm({
  tool,
  language,
  onCreated,
}: {
  tool: ToolId;
  language: Language;
  onCreated(job: Job): void;
}) {
  const props = { language, onCreated };
  return tool === "drugclip.screen" ? (
    <ScreeningForm {...props} />
  ) : tool === "screening.dock" ? (
    <BatchDockingForm {...props} />
  ) : tool.startsWith("del.") ? (
    <DELForm key={tool} tool={tool} {...props} />
  ) : (
    <LibraryForm key={tool} tool={tool} {...props} />
  );
}
