import { useState } from "react";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { Hint } from "../guided/Hint";
import { Questionnaire } from "../guided/Questionnaire";
import { PocketOptions } from "./PocketOptions";
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
  const [expert, setExpert] = useState(false);
  const { ready, error } = useTaskReadiness("p2rank.detect");
  const [threads, setThreads] = useState(4),
    [memory, setMemory] = useState(2048),
    [threshold, setThreshold] = useState(0.4),
    [minimum, setMinimum] = useState(3),
    [limit, setLimit] = useState(20);
  const run = useTaskSubmit(onCreated);
  const ranges = [
    [threads, 1, 32],
    [memory, 512, 8192],
    [threshold, 0, 1],
    [minimum, 1, 100],
    [limit, 1, 100],
  ];
  const optionsValid = ranges.every(
    ([n, min, max], i) =>
      Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (i === 2 || Number.isInteger(n)),
  );
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      error={error || run.error}
      ready={ready}
      unavailable={
        zh
          ? "尚未部署口袋计算环境。请到“安装与组件”部署 P2Rank；已填信息可以保留。"
          : "Pocket runtime is not deployed. Install P2Rank in Installation & components; keep your prepared inputs."
      }
      submitLabel={zh ? "发现候选口袋" : "Discover candidate pockets"}
      onSubmit={() =>
        run.submit({
          operation: "pocket_search",
          name: zh ? "蛋白位点候选" : "Protein-site hypotheses",
          protein: protein!,
          profile: profile as "experimental" | "predicted",
          threads,
          memory_mib: memory,
          point_threshold: threshold,
          minimum_cluster: minimum,
          review_limit: limit,
        })
      }
      steps={[
        {
          title: zh ? "选择结构" : "Choose structure",
          valid: Boolean(protein),
          content: (
            <>
              <ReferencePicker
                kind="structure"
                allowedSuffixes={[".pdb", ".cif"]}
                value={protein}
                onChange={setProtein}
                language={language}
                label={zh ? "选择蛋白结构" : "Choose protein structure"}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={onPredict}
              >
                {zh
                  ? "还没有结构？先预测结构"
                  : "No structure yet? Predict it first"}
              </button>
            </>
          ),
        },
        {
          title: zh ? "说明来源" : "Specify source",
          valid: Boolean(profile),
          content: (
            <>
              <label className="field">
                {zh
                  ? "这份结构来自哪里？"
                  : "Where did this structure come from?"}
                <select
                  required
                  value={profile}
                  onChange={(e) => setProfile(e.target.value as typeof profile)}
                >
                  <option value="">
                    {zh ? "请选择来源" : "Choose source"}
                  </option>
                  <option value="experimental">
                    {zh ? "X射线晶体结构" : "X-ray crystal structure"}
                  </option>
                  <option value="predicted">
                    {zh
                      ? "预测结构、NMR或冷冻电镜"
                      : "Predicted, NMR or cryo-EM structure"}
                  </option>
                </select>
              </label>
              <Hint label={zh ? "结构来源说明" : "Structure source help"}>
                {zh
                  ? "晶体结构使用原生 B 因子特征；其他来源不使用，避免把预测置信度当作实验 B 因子。"
                  : "Crystal structures use native B-factor features; other sources do not, avoiding interpretation of predicted confidence as experimental B-factors."}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "选择方案" : "Choose settings",
          valid: optionsValid,
          content: (
            <PocketOptions
              language={language}
              expert={expert}
              onExpert={() => setExpert((v) => !v)}
              values={[threads, memory, threshold, minimum, limit]}
              setters={[
                setThreads,
                setMemory,
                setThreshold,
                setMinimum,
                setLimit,
              ]}
            />
          ),
        },
        {
          title: zh ? "确认启动" : "Review & start",
          valid: true,
          content: (
            <dl className="questionnaire-review">
              <dt>{zh ? "研究对象" : "Research object"}</dt>
              <dd>{zh ? "已选蛋白结构" : "Selected protein structure"}</dd>
              <dt>{zh ? "结构来源" : "Structure source"}</dt>
              <dd>
                {profile === "experimental"
                  ? zh
                    ? "X射线晶体结构"
                    : "X-ray crystal structure"
                  : zh
                    ? "预测结构、NMR或冷冻电镜"
                    : "Predicted, NMR or cryo-EM structure"}
              </dd>
              <dt>{zh ? "计算内容" : "Calculation"}</dt>
              <dd>
                {zh
                  ? `寻找候选口袋，先展示最多${limit}个`
                  : `Find candidate pockets; review up to ${limit}`}
              </dd>
              <dt>{zh ? "计算方案" : "Method"}</dt>
              <dd>
                P2Rank ·{" "}
                {expert
                  ? zh
                    ? "已微调参数"
                    : "Adjusted settings"
                  : zh
                    ? "推荐参数"
                    : "Recommended settings"}
              </dd>
            </dl>
          ),
        },
      ]}
    />
  );
}
