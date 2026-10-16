import { definedRegionSteps } from "./defined-region-steps";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { GuidedSteps } from "../guided/Questionnaire";
import { StructureWorkbench } from "../presentation/StructureWorkbench";
import type { ReceptorSet } from "../receptors/types";
import type { Language } from "../types";
import { RegionPreview } from "./RegionPreview";
import {
  draftSearch,
  newRegion,
  regionInputsReady,
  regionValue,
  type RegionDraft,
} from "./region-draft";
import type { DefinedSiteInput, DefinedSiteSet } from "./types";
import "./sites.css";

export function DefinedRegionForm({
  ensemble,
  language,
  onSaved,
}: {
  ensemble: ReceptorSet;
  language: Language;
  onSaved(v: DefinedSiteSet): void;
}) {
  const zh = language === "zh";
  const members = ensemble.members.filter(
    (m) =>
      m.reference &&
      m.evidence.quality?.backbone_complete &&
      m.evidence.transformation,
  );
  const [drafts, setDrafts] = useState<RegionDraft[]>([]),
    [active, setActive] = useState(-1),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [sealed, setSealed] = useState(false),
    [error, setError] = useState("");
  const serial = useRef(0),
    pending = useRef({ body: "", key: crypto.randomUUID() }),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const selected = drafts.find((row) => row.key === active) ?? drafts[0];
  const frame = (row: RegionDraft) =>
    members.find((m) => m.evidence.index === row.member)?.reference ?? null;
  const values = drafts.map((row) => regionValue(row, frame(row), language));
  const regions = values.filter((v): v is NonNullable<typeof v> => v !== null);
  const distinct =
    new Set(
      regions.map((r) =>
        JSON.stringify({ member: r.member_index, search: r.search }),
      ),
    ).size === regions.length;
  const detailsValid =
    drafts.length > 0 &&
    drafts.every((row) => regionInputsReady(row, frame(row), language));
  const confirmed = drafts.length > 0 && values.every(Boolean);
  function change(delta: Partial<RegionDraft>) {
    if (!selected) return;
    setDrafts((rows) =>
      rows.map((row) =>
        row.key === selected.key ? { ...row, ...delta } : row,
      ),
    );
    setError("");
  }
  function append(member: number) {
    const row = newRegion(serial.current++, member);
    row.label = (zh ? "搜索区域 " : "Search region ") + (row.key + 1);
    setDrafts((rows) => (rows.length >= 12 ? rows : [...rows, row]));
    setActive(row.key);
  }
  async function submit() {
    if (!detailsValid || !confirmed || !distinct || busy) return;
    const body: DefinedSiteInput = {
      kind: "defined_regions",
      name: name.trim() || (zh ? "指定搜索区域" : "Defined search regions"),
      ensemble_id: ensemble.id,
      regions,
    };
    const encoded = JSON.stringify(body);
    if (pending.current.body !== encoded)
      pending.current = { body: encoded, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const saved = await api.post<DefinedSiteSet>(
        "/research/site-sets",
        body,
        pending.current.key,
      );
      if (mounted.current) setSealed(true);
      return saved;
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const search = selected
    ? draftSearch(selected, frame(selected), language)
    : null;
  return (
    <section
      className="site-workspace"
      aria-label={zh ? "指定搜索区域" : "Define search regions"}
    >
      <StructureWorkbench
        preview={
          <RegionPreview
            receptor={
              selected ? frame(selected) : (members[0]?.reference ?? null)
            }
            reference={
              selected?.kind === "reference" ? selected.reference : null
            }
            confirmed={Boolean(selected?.confirmed)}
            language={language}
            box={search?.kind === "box" ? search.box : undefined}
            onCenter={
              selected?.kind === "box" && !busy && !sealed
                ? (center) => change({ center })
                : undefined
            }
          />
        }
      >
        {drafts.length > 1 && (
          <label className="field">
            {zh ? "当前区域" : "Current region"}
            <select
              disabled={busy}
              value={selected?.key ?? -1}
              onChange={(e) => setActive(Number(e.target.value))}
            >
              {drafts.map((row) => (
                <option key={row.key} value={row.key}>
                  {zh ? "受体" : "Receptor"} {row.member + 1} · {row.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <GuidedSteps<DefinedSiteSet>
          language={language}
          busy={busy}
          error={error}
          ready={true}
          submitLabel={zh ? "保存搜索区域" : "Save search regions"}
          resultTitle={zh ? "继续研究" : "Continue research"}
          onSubmit={submit}
          renderResult={(saved) => (
            <>
              <p role="status">
                {zh
                  ? "搜索条件已保存，尚未启动计算。"
                  : "Search conditions saved; no computation has started."}
              </p>
              <button
                className="primary-button"
                type="button"
                onClick={() => onSaved(saved)}
              >
                {zh
                  ? "用这些区域探索结合姿势"
                  : "Explore poses in these regions"}
              </button>
            </>
          )}
          steps={definedRegionSteps({
            members,
            drafts,
            selected,
            regions,
            detailsValid,
            confirmed,
            distinct,
            name,
            language,
            append,
            change,
            setDrafts,
            setName,
          })}
        />
      </StructureWorkbench>
    </section>
  );
}
