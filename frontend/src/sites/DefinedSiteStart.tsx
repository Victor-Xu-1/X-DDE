import { useEffect, useState } from "react";
import { request } from "../api";
import { loadPages } from "../research/loadPages";
import type { ReceptorSet } from "../receptors/types";
import type { Language } from "../types";
import { DefinedRegionForm } from "./DefinedRegionForm";
import type { DefinedSiteSet } from "./types";

interface ReceptorChoice {
  id: string;
  name: string | null;
  source_status: string | null;
  usable_members: number;
  created_at: string;
}
export function DefinedSiteStart({
  language,
  onSaved,
}: {
  language: Language;
  onSaved(v: DefinedSiteSet): void;
}) {
  const zh = language === "zh";
  const [choices, setChoices] = useState<ReceptorChoice[]>([]),
    [selected, setSelected] = useState(""),
    [ensemble, setEnsemble] = useState<ReceptorSet | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setEnsemble(null);
    void (
      selected
        ? request<ReceptorSet>(
            `/research/receptor-ensembles/${encodeURIComponent(selected)}`,
            { signal: controller.signal },
          ).then((value) => {
            if (!controller.signal.aborted) setEnsemble(value);
          })
        : loadPages<ReceptorChoice>(
            "/research/receptor-choices",
            controller.signal,
          ).then((value) => {
            if (!controller.signal.aborted) setChoices(value);
          })
    )
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected, reload]);
  const available = choices.filter(
    (c) => c.source_status === "succeeded" && c.usable_members > 0,
  );
  return (
    <section
      aria-label={zh ? "新建搜索区域" : "New search regions"}
      aria-busy={loading}
    >
      <div className="pose-context-row">
        <label className="field">
          {zh ? "使用哪组对齐受体？" : "Which aligned receptors?"}
          <select
            value={selected}
            disabled={loading}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">
              {zh ? "选择已对齐的结构" : "Choose aligned structures"}
            </option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.usable_members}{" "}
                {zh ? "个可用受体" : "usable receptors"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={loading}
          onClick={() => setReload((v) => v + 1)}
        >
          {zh ? "刷新受体" : "Refresh receptors"}
        </button>
      </div>
      {loading && (
        <p role="status">
          {zh ? "正在读取对齐受体…" : "Loading aligned receptors…"}
        </p>
      )}
      {!loading && !error && !available.length && !selected && (
        <p role="status">
          {zh
            ? "先在结构预测模块对齐受体，再围绕参考配体或指定坐标范围探索姿势。"
            : "Align receptors in Structure prediction, then explore poses around a reference ligand or an explicit coordinate region."}
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {ensemble && !loading && !error && (
        <DefinedRegionForm
          key={ensemble.id + ":" + reload}
          ensemble={ensemble}
          language={language}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
