import type { Language } from "../types";
import type { DockingMode } from "./types";
import { Hint } from "../guided/Hint";
export function DockingOptions({
  language,
  mode,
  value,
  onChange,
}: {
  language: Language;
  mode: DockingMode;
  value: Record<string, unknown>;
  onChange(v: Record<string, unknown>): void;
}) {
  const zh = language === "zh",
    change = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  const numbers = [
    ["cpu", "CPU 线程", "CPU threads", 1, 32],
    ["memory_mib", "内存上限 MiB", "Memory limit MiB", 2048, 65536],
    ["time_limit_seconds", "时间上限（秒）", "Time limit (seconds)", 30, 7200],
    ["seed", "随机种子", "Random seed", 0, 2147483647],
    ...(mode === "dock"
      ? [
          ["exhaustiveness", "搜索力度", "Search effort", 1, 128],
          ["num_modes", "最多姿势数", "Maximum poses", 1, 100],
          [
            "min_rmsd_filter",
            "原生去重距离 Å",
            "Native RMSD filter Å",
            0.1,
            10,
          ],
          ["autobox_add", "参考范围留白 Å", "Reference-box padding Å", 0, 30],
        ]
      : []),
    ...(mode === "minimize"
      ? [
          [
            "minimize_iters",
            "最小化迭代上限（0 为原生默认）",
            "Minimization iterations (0 = native default)",
            0,
            10000,
          ],
        ]
      : []),
  ];
  return (
    <section className="operation-grid">
      <label className="field">
        {zh ? "经验评分方法" : "Empirical scoring method"}
        <select
          value={String(value.scoring)}
          onChange={(event) => change("scoring", event.target.value)}
        >
          <option value="vina">Vina</option>
          <option value="vinardo">Vinardo</option>
        </select>
      </label>
      <label className="field">
        {zh ? "神经网络使用阶段" : "CNN scoring stage"}
        <select
          value={String(value.cnn_scoring)}
          onChange={(event) => change("cnn_scoring", event.target.value)}
        >
          {["none", "rescore", "refinement", "all"]
            .filter((v) => mode !== "score" || v === "none" || v === "rescore")
            .map((v, n) => (
              <option key={v} value={v}>
                {
                  (zh
                    ? [
                        "关闭（只算经验评分）",
                        "候选重新评分",
                        "局部精修（需 GPU）",
                        "全程参与（需 GPU）",
                      ]
                    : [
                        "Off (empirical only)",
                        "Rescore candidates",
                        "Refinement (GPU required)",
                        "Throughout search (GPU required)",
                      ])[n]
                }
              </option>
            ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(value.use_gpu)}
          onChange={(event) => change("use_gpu", event.target.checked)}
        />
        {zh ? "使用服务器 GPU" : "Use server GPU"}
      </label>
      {Boolean(value.use_gpu) && (
        <label className="field">
          {zh ? "GPU 编号" : "GPU device"}
          <input
            type="number"
            min={0}
            max={15}
            value={Number(value.gpu_device)}
            onChange={(event) =>
              change("gpu_device", Number(event.target.value))
            }
          />
        </label>
      )}
      {numbers.map(([key, cn, en, min, max]) => (
        <label className="field" key={String(key)}>
          {String(zh ? cn : en)}
          <input
            type="number"
            min={Number(min)}
            max={Number(max)}
            step={String(key) === "min_rmsd_filter" ? 0.1 : 1}
            value={Number(value[String(key)])}
            onChange={(event) =>
              change(String(key), Number(event.target.value))
            }
          />
        </label>
      ))}
      <Hint label={zh ? "评分与预算说明" : "Scoring and budget help"}>
        {zh
          ? "经验评分和 CNN 输出不是实测亲和力。更大的搜索力度和更多姿势会增加成本；高成本 CNN 搜索/精修需要显式启用 GPU。"
          : "Empirical and CNN scores are not measured affinity. Larger searches and more poses cost more; high-cost CNN search/refinement requires explicit GPU selection."}
      </Hint>
    </section>
  );
}
