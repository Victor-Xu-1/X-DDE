import type { Language } from "../types";
import { DefinedSiteResults } from "./DefinedSiteResults";
import { PredictedSiteResults } from "./PredictedSiteResults";
import type { SiteSet } from "./types";

export function SiteResults({
  value,
  language,
}: {
  value: SiteSet;
  language: Language;
}) {
  return value.schema_version === 2 ? (
    <DefinedSiteResults value={value} language={language} />
  ) : (
    <PredictedSiteResults value={value} language={language} />
  );
}
