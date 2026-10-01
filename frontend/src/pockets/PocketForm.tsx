import { useEffect, useState } from "react";
import { request } from "../api";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { Hint } from "../guided/Hint";
import type { MoleculeRef } from "../research/types";
import type { Job, Language } from "../types";
export function PocketForm({
  language,
  onCreated,
  onPredict,
  initialProtein = null,
}: {
  language: Language;
  onCreated(job: Job): void;
  onPredict(): void;
  initialProtein?: MoleculeRef | null;
}) {
  const zh = language === "zh",
    [protein, setProtein] = useState<MoleculeRef | null>(initialProtein),
    [profile, setProfile] = useState<"experimental" | "predicted" | "">("");
  const [expert, setExpert] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [threads, setThreads] = useState(4),
    [memory, setMemory] = useState(2048),
    [threshold, setThreshold] = useState(0.4),
    [minimum, setMinimum] = useState(3),
    [limit, setLimit] = useState(20);
  const run = useTaskSubmit(onCreated);
  useEffect(() => {
    const c = new AbortController();
    void request<{ availability: { configuration_present: boolean } }>(
      "/capabilities/p2rank.detect",
      { signal: c.signal },
    )
      .then((data) => {
        if (!c.signal.aborted)
          setReady(data.availability.configuration_present);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, []);
  return (
    <form
      className="tool-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (protein && profile)
          void run.submit({
            operation: "pocket_search",
            name: zh ? "蛋白位点候选" : "Protein-site hypotheses",
            protein,
            profile,
            threads,
            memory_mib: memory,
            point_threshold: threshold,
            minimum_cluster: minimum,
            review_limit: limit,
          });
      }}
    >
      <fieldset disabled={run.busy}>
        {!ready && (
          <p className="notice">
            {zh
              ? "请在安装与组件页面安装 P2Rank 和 CPU Java 环境，随后重启工作台。可以先准备输入。"
              : "Install P2Rank and its CPU Java environment in Installation & components, then restart the workbench. Prepare inputs now."}
          </p>
        )}
        <ReferencePicker
          kind="structure"
          allowedSuffixes={[".pdb", ".cif"]}
          value={protein}
          onChange={setProtein}
          language={language}
          label={zh ? "选择蛋白结构" : "Choose protein structure"}
        />
        <button type="button" onClick={onPredict}>
          {zh ? "还没有结构？先预测结构" : "No structure yet? Predict it first"}
        </button>
        <label className="field">
          {zh ? "这份结构来自哪里？" : "Where did this structure come from?"}
          <select
            required
            value={profile}
            onChange={(e) => setProfile(e.target.value as typeof profile)}
          >
            <option value="">{zh ? "请选择来源" : "Choose source"}</option>
            <option value="experimental">
              {zh
                ? "X 射线晶体结构（使用 B 因子特征）"
                : "X-ray crystal structure (uses B-factor features)"}
            </option>
            <option value="predicted">
              {zh
                ? "预测结构、NMR 或冷冻电镜（不使用 B 因子特征）"
                : "Predicted, NMR or cryo-EM structure (excludes B-factor features)"}
            </option>
          </select>
        </label>
        <Hint label={zh ? "结构来源说明" : "Structure source help"}>
          {zh
            ? "预测结构中的 B 因子列可能保存置信度，不能当作晶体实验 B 因子。对应选择原生 alphafold 模型配置。"
            : "B-factor columns in predicted structures may encode confidence rather than experimental B-factors. This choice uses the native alphafold configuration."}
        </Hint>
        <Hint label={zh ? "口袋检测说明" : "Pocket detection help"}>
          {zh
            ? "P2Rank 预测蛋白表面的候选位点。可以保留多个口袋继续比较；位点分数与模型概率不是配体亲和力，也不是实验活性。"
            : "P2Rank predicts candidate sites on protein surfaces. Retain multiple pockets for comparison; site scores and model probabilities are not ligand affinity or experimental activity."}
        </Hint>
        <button
          type="button"
          aria-pressed={expert}
          onClick={() => setExpert(!expert)}
        >
          {zh ? "专家微调" : "Expert tuning"}
        </button>
        {expert && (
          <div className="operation-grid">
            {[
              [zh ? "CPU 线程" : "CPU threads", threads, setThreads, 1, 32],
              [
                zh ? "内存上限（MiB）" : "Memory limit (MiB)",
                memory,
                setMemory,
                512,
                8192,
              ],
              [
                zh ? "表面点门槛" : "Surface-point threshold",
                threshold,
                setThreshold,
                0,
                1,
              ],
              [
                zh ? "最小点簇" : "Minimum cluster size",
                minimum,
                setMinimum,
                1,
                100,
              ],
              [
                zh ? "先展示几个口袋" : "Pocket review limit",
                limit,
                setLimit,
                1,
                100,
              ],
            ].map(([label, value, set, min, max], i) => (
              <label className="field" key={i}>
                {String(label)}
                <input
                  type="number"
                  value={Number(value)}
                  min={Number(min)}
                  max={Number(max)}
                  step={i === 2 ? 0.01 : 1}
                  onChange={(e) =>
                    (set as (n: number) => void)(Number(e.target.value))
                  }
                />
              </label>
            ))}
          </div>
        )}
        {(error || run.error) && (
          <p role="alert" className="error-box">
            {error || run.error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={run.busy || !ready || !protein || !profile}
        >
          {zh ? "发现候选口袋" : "Discover candidate pockets"}
        </button>
      </fieldset>
    </form>
  );
}
