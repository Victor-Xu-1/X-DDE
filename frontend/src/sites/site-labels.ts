import type { Language } from "../types";
import type { SiteSet } from "./types";

export function siteChoices(value: SiteSet, language: Language) {
  const zh = language === "zh";
  if (value.schema_version === 2)
    return value.sites.map((site) => ({
      id: site.id,
      member_index: site.member_index,
      label: `${zh ? "受体" : "Receptor"} ${site.member_index + 1} · ${site.label}`,
      limited: false,
    }));
  return value.sites.map((site) => ({
    id: site.id,
    member_index: site.member_index,
    label: `${zh ? "受体" : "Receptor"} ${site.member_index + 1} · ${zh ? "口袋" : "Pocket"} ${site.native.rank}`,
    limited: site.mapping_status === "insufficient",
  }));
}
