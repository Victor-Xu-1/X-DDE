import type { SearchBox } from "../docking/types";
import { ConstraintSupportSummary } from "./ConstraintSupportSummary";
import { OutputConditionControls } from "./OutputConditionControls";
import { outputBoundsDefaults } from "./generated";
import type { OutputSettings } from "./types";
import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { TaskRequest } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import { referenceKey } from "../diffsbdd/model";
import type { SavedRegion } from "../regions/model";
import type { ConstraintReference, SavedConstraints, Support } from "./types";
import { currentConditions, listConstraints } from "./model";

export function ConstraintPanel({
  subject,
  language,
  getTask,
  value,
  onChange,
  onApply,
  outputChoice,
  onOutputChoice,
  outputSettings = outputBoundsDefaults,
  onOutputSettings,
  expert = false,
  getOutputBox,
  boxFingerprint = "",
}: {
  subject: MoleculeRef;
  language: Language;
  getTask(): TaskRequest;
  value: ConstraintReference | null;
  onChange(v: ConstraintReference | null): void;
  onApply(document: SavedConstraints["body"], regions: SavedRegion[]): void;
  outputChoice?: "none" | "heavy_atom_centroid" | "all_heavy_atoms";
  outputSettings?: OutputSettings;
  onOutputSettings?(value: OutputSettings): void;
  expert?: boolean;
  getOutputBox?(): SearchBox;
  boxFingerprint?: string;
  onOutputChoice?(
    value: "none" | "heavy_atom_centroid" | "all_heavy_atoms",
  ): void;
}) {
  const zh = language === "zh";
  const [values, setValues] = useState<SavedConstraints[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [support, setSupport] = useState<Support | null>(null),
    [name, setName] = useState(""),
    [refresh, setRefresh] = useState(0);
  const mounted = useRef(true),
    ids = useRef(new Map<string, string>()),
    intent = useRef({ body: "", key: crypto.randomUUID() });
  const selected = values.find((v) => v.id === value?.id);
  let fingerprint: string;
  try {
    fingerprint = JSON.stringify([
      getTask(),
      boxFingerprint,
      outputChoice,
      outputSettings,
    ]);
  } catch {
    fingerprint = "incomplete_input";
  }
  const latestFingerprint = useRef(fingerprint);
  latestFingerprint.current = fingerprint;
  useEffect(() => setSupport(null), [fingerprint]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    void listConstraints(subject, c.signal)
      .then((v) => {
        if (!c.signal.aborted) setValues(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [referenceKey(subject), refresh]);
  async function action(kind: "save" | "check" | "apply") {
    if (busy) return;
    setBusy(true);
    setError("");
    setSupport(null);
    try {
      if (kind === "apply" && selected) {
        const regions = await Promise.all(
          selected.body.conditions
            .filter((c) => c.kind === "fixed_region")
            .map((c) =>
              request<SavedRegion>("/research/regions/" + c.region_id),
            ),
        );
        if (mounted.current) onApply(selected.body, regions);
      } else if (kind === "save") {
        const body = await currentConditions(
          getTask(),
          name.trim() || (zh ? "任务条件" : "Task conditions"),
          value?.id ?? null,
          (key) => {
            if (!ids.current.has(key))
              ids.current.set(key, crypto.randomUUID());
            return ids.current.get(key)!;
          },
          language,
        );
        if (outputChoice && outputChoice !== "none") {
          const search = body.conditions.find((c) => c.kind === "search_box");
          const bounds =
            search?.kind === "search_box" ? search.box : getOutputBox?.();
          if (!bounds)
            throw new Error(
              zh
                ? "请先指定结果检查范围"
                : "Define the output-check bounds first",
            );
          if (!ids.current.has("output_bounds"))
            ids.current.set("output_bounds", crypto.randomUUID());
          if (
            !Number.isFinite(outputSettings.tolerance_angstrom) ||
            outputSettings.tolerance_angstrom < 0 ||
            outputSettings.tolerance_angstrom > 0.1 ||
            !Number.isFinite(outputSettings.weight) ||
            outputSettings.weight <= 0 ||
            outputSettings.weight > 1000
          )
            throw new Error(
              zh
                ? "请使用 0–0.1 Å 容差和有效偏差权重。"
                : "Use tolerance 0–0.1 Å and a valid deviation weight.",
            );
          body.conditions.push({
            id: ids.current.get("output_bounds")!,
            label: zh ? "结果空间检查" : "Output spatial check",
            kind: "spatial_bounds",
            phase: "result",
            selection: outputChoice,
            box: bounds,
            validator: "rdkit_receptor_bounds_v1",
            source: "user_selection",
            scope: "target_a",
            strength: outputSettings.strength,
            weight:
              outputSettings.strength === "soft" ? outputSettings.weight : null,
            tolerance_angstrom: outputSettings.tolerance_angstrom,
          });
        }
        if (!body.conditions.length)
          throw new Error(
            zh ? "请选择需要保存的结果检查" : "Choose an output check to save",
          );
        const serialized = JSON.stringify(body);
        if (intent.current.body !== serialized)
          intent.current = { body: serialized, key: crypto.randomUUID() };
        const saved = await api.post<SavedConstraints>(
          "/research/constraints",
          body,
          intent.current.key,
        );
        if (mounted.current) {
          setValues((old) => [saved, ...old.filter((v) => v.id !== saved.id)]);
          onChange({ id: saved.id, sha256: saved.sha256 });
        }
      } else if (value) {
        const checkedFingerprint = fingerprint;
        const checked = await api.post<Support>(
          "/research/constraint-support",
          { reference: value, request: { ...getTask(), constraints: value } },
        );
        if (mounted.current && latestFingerprint.current === checkedFingerprint)
          setSupport(checked);
      }
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <details className="input-summary" aria-busy={busy || loading}>
      <summary>
        {zh
          ? "保存与复用任务条件（可选）"
          : "Save and reuse task conditions (optional)"}
      </summary>
      <label className="field">
        {zh ? "使用哪个条件版本？" : "Which condition revision?"}
        <select
          value={value?.id ?? ""}
          disabled={busy || loading}
          onChange={(e) => {
            const chosen = values.find((v) => v.id === e.target.value);
            onChange(chosen ? { id: chosen.id, sha256: chosen.sha256 } : null);
            setSupport(null);
            setName(chosen?.body.name ?? "");
          }}
        >
          <option value="">
            {zh ? "仅使用当前参数" : "Current parameters only"}
          </option>
          {values.map((v) => (
            <option value={v.id} key={v.id}>
              {v.body.name} · {v.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {loading && (
        <p role="status">
          {zh ? "正在读取条件版本…" : "Loading condition revisions…"}
        </p>
      )}
      {onOutputChoice && (
        <OutputConditionControls
          language={language}
          choice={outputChoice ?? "none"}
          onChoice={onOutputChoice}
          expert={expert}
          settings={outputSettings}
          onSettings={onOutputSettings}
          conditions={selected?.body.conditions}
        />
      )}
      <label className="field">
        {zh ? "条件名称（可选）" : "Condition name (optional)"}
        <input
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="task-actions">
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => void action("save")}
        >
          {zh
            ? value
              ? "保存当前条件的新版本"
              : "保存当前条件"
            : value
              ? "Save a new revision"
              : "Save current conditions"}
        </button>
        <button
          type="button"
          disabled={busy || !selected}
          onClick={() => void action("apply")}
        >
          {zh ? "应用所选条件" : "Apply selected conditions"}
        </button>
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => void action("check")}
        >
          {zh ? "检查引擎支持" : "Check engine support"}
        </button>
      </div>
      <p
        className="field-help"
        title={
          zh
            ? "固定核心在采样阶段使用；搜索范围在输入阶段使用。二者目前没有独立结果复核。修改会创建新版本，旧条件仍保留。"
            : "Fixed cores act during sampling; search bounds act at input. Neither currently has independent result verification. Revisions retain earlier conditions."
        }
      >
        {zh
          ? "保存固定核心、显式搜索范围和所选结果检查；提交前再次核对。"
          : "Save supported fixed cores, search bounds and selected output checks; submission checks them again."}
      </p>
      {support && (
        <ConstraintSupportSummary support={support} language={language} />
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            {zh ? "重新读取" : "Reload"}
          </button>
        </p>
      )}
    </details>
  );
}
