import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Hint } from "../guided/Hint";
import { JsonEditor } from "../operations/ScientificInputs";
import type { StateSet } from "../chemistry/types";
import type { SiteSet } from "../sites/types";
import type { Language } from "../types";
import { defaults } from "./generated";
import { LigandChoice } from "./LigandChoice";
import type { Exploration, LigandSelection, Options } from "./types";
export function PoseForm({
  sites,
  states,
  language,
  onSaved,
}: {
  sites: SiteSet;
  states: StateSet[];
  language: Language;
  onSaved(v: Exploration): void;
}) {
  const zh = language === "zh";
  const [ids, setIds] = useState<string[]>([]),
    [ligands, setLigands] = useState<
      { key: number; value: LigandSelection | null }[]
    >([{ key: 0, value: null }]),
    [name, setName] = useState(""),
    [choice, setChoice] = useState("quick"),
    [expert, setExpert] = useState(false),
    [raw, setRaw] = useState<Record<string, unknown>>({ ...defaults }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const serial = useRef(1),
    intent = useRef({ body: "", key: crypto.randomUUID() });
  function options(kind = choice): Options {
    return {
      ...defaults,
      docking: {
        ...defaults.docking,
        exhaustiveness: kind === "quick" ? 4 : 8,
        num_modes: kind === "quick" ? 5 : 9,
      },
      seed_count: kind === "multi" ? 3 : 1,
      max_jobs: kind === "multi" ? 30 : 12,
      wall_seconds: kind === "multi" ? 28800 : 14400,
    };
  }
  const combinations =
    ids.length *
    ligands.length *
    (expert ? Number(raw.seed_count ?? 1) : options().seed_count);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (ligands.some((l) => !l.value)) {
      setError(
        zh
          ? "请选择并保存每个分子的具体版本。"
          : "Select a saved exact version for every ligand.",
      );
      return;
    }
    const body = {
      name:
        name.trim() ||
        (zh ? "多假设结合姿势探索" : "Multi-hypothesis pose exploration"),
      site_set_id: sites.id,
      site_ids: ids,
      ligands: ligands.map((l) => l.value),
      options: expert ? raw : options(),
    };
    const encoded = JSON.stringify(body);
    if (intent.current.body !== encoded)
      intent.current = { body: encoded, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const saved = await api.post<Exploration>(
        "/research/pose-explorations",
        body,
        intent.current.key,
      );
      if (mounted.current) onSaved(saved);
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <form className="pose-form" onSubmit={(e) => void submit(e)}>
      <fieldset disabled={busy}>
        <div
          className="pose-site-choices"
          role="group"
          aria-label={zh ? "探索哪些位点？" : "Which sites should be explored?"}
        >
          {sites.sites.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={ids.includes(s.id)}
                disabled={!ids.includes(s.id) && ids.length >= 12}
                onChange={(e) =>
                  setIds((v) =>
                    e.target.checked
                      ? [...v, s.id]
                      : v.filter((id) => id !== s.id),
                  )
                }
              />
              {zh ? "受体 " : "Receptor "}
              {s.member_index + 1} · {zh ? "口袋 " : "Pocket "}
              {s.native.rank}
              {s.mapping_status === "insufficient"
                ? " · " +
                  (zh ? "跨构象对应不足" : "Limited cross-conformation mapping")
                : ""}
            </label>
          ))}
        </div>
        {ligands.map((l, i) => (
          <div key={l.key}>
            <LigandChoice
              index={i}
              value={l.value}
              states={states}
              language={language}
              onChange={(v) =>
                setLigands((old) =>
                  old.map((row) =>
                    row.key === l.key ? { ...row, value: v } : row,
                  ),
                )
              }
            />
            <button
              className="secondary-button"
              type="button"
              disabled={ligands.length < 2}
              onClick={() =>
                setLigands((v) => v.filter((row) => row.key !== l.key))
              }
            >
              {zh ? "移除此探索分子" : "Remove this ligand"}
            </button>
          </div>
        ))}
        <button
          className="secondary-button"
          type="button"
          disabled={ligands.length >= 12}
          onClick={() =>
            setLigands((v) => [...v, { key: serial.current++, value: null }])
          }
        >
          {zh ? "增加分子或构象" : "Add ligand or conformer"}
        </button>
        <label className="field">
          {zh ? "探索深度" : "Exploration depth"}
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              setRaw(options(e.target.value));
            }}
          >
            <option value="quick">
              {zh ? "先做小规模探索" : "Small initial exploration"}
            </option>
            <option value="standard">
              {zh ? "常规多姿势探索" : "Standard multi-pose exploration"}
            </option>
            <option value="multi">
              {zh ? "三个随机初始化" : "Three random initializations"}
            </option>
          </select>
        </label>
        <p className="field-help">
          {zh ? "组合任务数" : "Combination tasks"}: {combinations}
          <Hint label={zh ? "任务预算说明" : "Task budget help"}>
            {zh
              ? "位点数 × 分子/构象数 × 初始化次数。每个组合保留多个姿势；20 Å 是可调搜索框，不是测得的口袋体积。"
              : "Sites × ligands/conformers × initializations. Each combination retains multiple poses; 20 Å is an editable search box, not measured pocket volume."}
          </Hint>
        </p>
        <button
          className="secondary-button"
          type="button"
          aria-pressed={expert}
          onClick={() => {
            if (!expert) setRaw(options());
            setExpert(!expert);
          }}
        >
          {expert
            ? zh
              ? "返回选择模式"
              : "Return to guided choices"
            : zh
              ? "专家完整参数"
              : "Expert parameters"}
        </button>
        {expert && (
          <JsonEditor
            value={raw}
            onChange={setRaw}
            label={
              zh
                ? "完整探索参数（服务端校验）"
                : "Complete exploration parameters (server validated)"
            }
          />
        )}
        <label className="field">
          {zh ? "探索名称（可选）" : "Exploration name (optional)"}
          <input
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={!ids.length || ligands.some((l) => !l.value) || busy}
        >
          {busy
            ? zh
              ? "保存计划中…"
              : "Saving plan…"
            : zh
              ? "保存并审阅探索计划"
              : "Save and review exploration plan"}
        </button>
      </fieldset>
      <p className="field-help">
        {zh
          ? "保存不会开始计算。姿势只是待验证的结合假设；二维输入或无构象输入的几何处理会由原生结果记录。"
          : "Saving does not start computation. Poses are hypotheses; native results record geometry handling of 2D or conformer-free inputs."}
      </p>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </form>
  );
}
