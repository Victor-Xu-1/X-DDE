import { useEffect, useId, useRef, useState } from "react";
import { useExample } from "../examples/context";
import { api } from "../api";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import type { Job, Language } from "../types";
import type { EvidenceHit, EvidenceLookup } from "./types";

export function TargetResearchForm({
  language,
  onCreated,
  entity,
  initialSelection,
}: {
  language: Language;
  onCreated(job: Job): void;
  entity: "target" | "disease";
  initialSelection?: EvidenceHit;
}) {
  const example = useExample();
  initialSelection ??= example?.case.evidence_entities?.[entity]
    ? { ...example.case.evidence_entities[entity], entity }
    : undefined;
  const zh = language === "zh",
    id = useId();
  const [query, setQuery] = useState(
      initialSelection?.name ??
        (example ? (entity === "target" ? "BRD4" : "NUT carcinoma") : ""),
    ),
    [hits, setHits] = useState<EvidenceHit[]>(
      initialSelection ? [initialSelection] : [],
    ),
    [selection, setSelection] = useState(initialSelection?.id ?? ""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [lookupError, setLookupError] = useState(""),
    [searched, setSearched] = useState(Boolean(initialSelection)),
    [profile, setProfile] = useState<"essential" | "materials">("materials"),
    [limit, setLimit] = useState(20),
    [name, setName] = useState("");
  const epoch = useRef(0),
    mounted = useRef(true),
    run = useTaskSubmit(onCreated);
  const { ready, error } = useTaskReadiness("discovery." + entity);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, []);
  const selected = hits.find((h) => h.id === selection);
  async function search() {
    if (busy || !consent || query.trim().length < 2) return;
    const current = ++epoch.current;
    setBusy(true);
    setLookupError("");
    setSelection("");
    setHits([]);
    setSearched(false);
    try {
      const data = await api.post<EvidenceLookup>("/discovery/lookup", {
        entity,
        query: query.trim(),
        allow_external: true,
      });
      if (mounted.current && epoch.current === current) {
        setHits(data.hits);
        setSearched(true);
      }
    } catch (e) {
      if (mounted.current && epoch.current === current)
        setLookupError(String(e));
    } finally {
      if (mounted.current && epoch.current === current) setBusy(false);
    }
  }
  return (
    <Questionnaire
      language={language}
      busy={run.busy || busy}
      error={error || lookupError || run.error}
      ready={ready && consent}
      unavailable={
        zh
          ? "请确认允许查询公共数据库。查询失败时可保留输入并重试。"
          : "Confirm public database queries. Preserve your inputs and retry if a source is unavailable."
      }
      submitLabel={zh ? "获取研究证据" : "Retrieve evidence"}
      onSubmit={() =>
        run.submit({
          operation: "target_research",
          entity,
          identifier: selection,
          include_materials: entity === "target" && profile === "materials",
          limit,
          allow_external: true,
          name: name.trim() || selected?.name || "Research evidence",
        })
      }
      steps={[
        {
          title: zh ? "查找对象" : "Find an entity",
          valid: searched && hits.length > 0 && consent,
          content: (
            <>
              <label className="field" htmlFor={id}>
                {entity === "target"
                  ? zh
                    ? "靶点名称或基因符号"
                    : "Target name or gene symbol"
                  : zh
                    ? "疾病名称（支持数据库英文名称）"
                    : "Disease name"}
                <input
                  id={id}
                  value={query}
                  maxLength={120}
                  placeholder={
                    entity === "target"
                      ? "KRAS / EGFR"
                      : zh
                        ? "例如 lung cancer"
                        : "For example lung cancer"
                  }
                  onChange={(e) => {
                    epoch.current++;
                    setBusy(false);
                    setQuery(e.target.value);
                    setHits([]);
                    setSelection("");
                    setSearched(false);
                    setLookupError("");
                  }}
                />
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                {zh
                  ? "允许将名称或数据库编号发送到公共数据库查询"
                  : "Allow names or database identifiers to be sent to public databases"}
              </label>
              <Hint label={zh ? "查询范围" : "Query scope"}>
                {zh
                  ? "只发送你填写的名称或所选编号，不发送上传文件。当前 Open Targets 数据针对人类；近似名称需要你明确选择。"
                  : "Only entered names or selected identifiers are sent, not uploaded files. Open Targets covers human targets; choose among similar names explicitly."}
              </Hint>
              <button
                type="button"
                disabled={busy || !consent || query.trim().length < 2}
                onClick={() => void search()}
              >
                {busy
                  ? zh
                    ? "查找中…"
                    : "Searching…"
                  : zh
                    ? "查找"
                    : "Search"}
              </button>
              {searched && (
                <p role="status">
                  {hits.length
                    ? zh
                      ? `找到 ${hits.length} 个结果，下一步选择。`
                      : `Found ${hits.length} results; choose on the next step.`
                    : zh
                      ? "没有匹配结果，请更换关键词；未自动选择其他对象。"
                      : "No matches. Change the search term; no alternative was selected automatically."}
                </p>
              )}
            </>
          ),
        },
        {
          title: zh ? "选择对象" : "Select the entity",
          valid: Boolean(selected),
          content: (
            <ChoiceCards
              label={zh ? "选择本次研究对象" : "Choose the research entity"}
              value={selection}
              onChange={setSelection}
              options={hits.map((h) => ({
                value: h.id,
                title: h.name,
                note: (h.description ?? "") + " · " + h.id,
              }))}
            />
          ),
        },
        {
          title: zh ? "选择内容" : "Choose coverage",
          valid: true,
          content: (
            <>
              {entity === "target" && (
                <ChoiceCards<"essential" | "materials">
                  label={zh ? "需要哪些材料？" : "Which materials do you need?"}
                  value={profile}
                  onChange={setProfile}
                  options={[
                    {
                      value: "materials",
                      title: zh
                        ? "证据与研究材料（推荐）"
                        : "Evidence and materials (recommended)",
                      note: zh
                        ? "疾病关联、干预线索、序列、结构索引与已有活性。"
                        : "Disease associations, tractability, sequence, structure references and activities.",
                    },
                    {
                      value: "essential",
                      title: zh ? "只看靶点证据" : "Target evidence only",
                      note: zh
                        ? "先看疾病关联与不同药物形式的干预线索。"
                        : "Start with disease associations and modality-specific tractability.",
                    },
                  ]}
                />
              )}
              <label className="field">
                {zh ? "每类最多展示多少条？" : "Maximum rows per category"}
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Hint label={zh ? "数量和分数说明" : "Coverage and score help"}>
                {zh
                  ? "这是有上限的数据库检索，不是完整筛选。关联分数不是实验活性；不同实验端点与条件分别保留。"
                  : "This is bounded database retrieval, not exhaustive screening. Association scores are not measured potency; assay endpoints and conditions stay separate."}
              </Hint>
              <details>
                <summary>
                  {zh ? "专家与记录选项" : "Expert and record options"}
                </summary>
                <label className="field">
                  {zh ? "任务名称（可选）" : "Task name (optional)"}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                  />
                </label>
              </details>
            </>
          ),
        },
        {
          title: zh ? "确认查询" : "Review retrieval",
          valid: Boolean(selected) && consent,
          content: (
            <dl className="questionnaire-review">
              <dt>{zh ? "研究对象" : "Entity"}</dt>
              <dd>
                {selected?.name} · {selection}
              </dd>
              <dt>{zh ? "数据来源" : "Sources"}</dt>
              <dd>
                {entity === "target" && profile === "materials"
                  ? "Open Targets · UniProt · ChEMBL"
                  : "Open Targets"}
              </dd>
              <dt>{zh ? "展示范围" : "Coverage"}</dt>
              <dd>
                {limit}{" "}
                {zh
                  ? "条/类，保留总数与来源时间"
                  : "rows/category, with source totals and retrieval time"}
              </dd>
              <dt>{zh ? "研究边界" : "Scope"}</dt>
              <dd>
                {zh
                  ? "人类数据库证据；不替代靶点验证实验，不运行 GPU 模型。"
                  : "Human database evidence; no GPU model run or claim of experimental target validation."}
              </dd>
            </dl>
          ),
        },
      ]}
    />
  );
}
