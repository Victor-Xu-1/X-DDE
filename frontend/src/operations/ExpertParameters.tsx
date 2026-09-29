import type { Language, Parameters } from "../types";
import { Hint } from "../guided/Hint";
import { useEffect, useId, useState } from "react";
import { request } from "../api";
import { IntegerListField } from "./IntegerListField";

export function ExpertParameters({
  value,
  onChange,
  language,
  expert,
}: {
  value: Parameters;
  onChange(p: Parameters): void;
  language: Language;
  expert: boolean;
}) {
  const featureId = useId();
  const zh = language === "zh";
  const [checkpoints, setCheckpoints] = useState<
      { id: string; present: boolean }[]
    >([]),
    [registryError, setRegistryError] = useState("");
  useEffect(() => {
    if (!expert) return;
    const c = new AbortController();
    void request<{ id: string; present: boolean }[]>("/checkpoints", {
      signal: c.signal,
    })
      .then(setCheckpoints)
      .catch((e) => {
        if (!c.signal.aborted) setRegistryError(String(e));
      });
    return () => c.abort();
  }, [expert]);
  const update = (patch: Partial<Parameters>) =>
    onChange({ ...value, ...patch });
  const flags = [
    [
      "tfg",
      "配体几何引导（TFG）",
      "Ligand geometry guidance (TFG)",
      "在蛋白–配体预测中加入几何势引导；不是新分子生成。",
      "Geometry potentials during protein–ligand prediction; does not generate new molecules.",
      false,
    ],
    [
      "atom_confidence",
      "输出逐原子置信度",
      "Atom-level confidence",
      "用于查看 PAE、PDE 和原子置信度，建议保留。",
      "Exports native confidence arrays for inspection.",
      true,
    ],
    [
      "deterministic",
      "确定性计算",
      "Deterministic execution",
      "尽量减少重复运行的数值差异，可能影响速度。",
      "Reduces numerical variation, potentially at a speed cost.",
      false,
    ],
    [
      "enable_cache",
      "缓存中间计算",
      "Cache computations",
      "重复使用中间计算，通常保留开启。",
      "Reuse intermediate computation; normally enabled.",
      true,
    ],
    [
      "enable_fusion",
      "融合计算",
      "Kernel fusion",
      "减少计算开销；遇到内核兼容问题时可关闭。",
      "Reduces overhead; disable to investigate kernel compatibility.",
      true,
    ],
    [
      "enable_tf32",
      "启用 TF32",
      "Enable TF32",
      "CUDA 上的速度与精度折中。",
      "CUDA speed/precision tradeoff.",
      true,
    ],
  ] as const;
  return (
    <section className="extended-parameters">
      <div className="field">
        <span>
          <label htmlFor={featureId}>
            {zh ? "是否加入进化信息？" : "Include evolutionary information?"}
          </label>{" "}
          <Hint label={zh ? "进化信息说明" : "Evolutionary features help"}>
            {zh
              ? "MSA 是同源序列比对。模板提供已有结构信息；搜索需要配置数据库或服务。"
              : "MSA aligns homologous sequences. Templates supply existing structure information; searches require configured databases or services."}
          </Hint>
        </span>
        <select
          id={featureId}
          value={value.feature_mode ?? "none"}
          onChange={(e) =>
            update({
              feature_mode: e.target.value as Parameters["feature_mode"],
              use_template: false,
              use_rna_msa: false,
              allow_network: false,
            })
          }
        >
          <option value="none">
            {zh ? "直接预测 · 不搜索" : "Direct prediction · no search"}
          </option>
          <option value="search">
            {zh
              ? "搜索 MSA · 向配置的服务发送序列"
              : "Search MSA · send sequences to the configured service"}
          </option>
          <option value="uploaded">
            {zh ? "使用已上传的比对文件" : "Use uploaded alignments"}
          </option>
        </select>
      </div>
      {(value.feature_mode ?? "none") !== "none" && (
        <div className="check-choices">
          <label>
            <input
              type="checkbox"
              checked={value.use_template ?? false}
              onChange={(e) => update({ use_template: e.target.checked })}
            />
            {zh ? "加入蛋白模板" : "Include protein templates"}
          </label>
          <label>
            <input
              type="checkbox"
              checked={value.use_rna_msa ?? false}
              onChange={(e) => update({ use_rna_msa: e.target.checked })}
            />
            {zh ? "加入 RNA MSA" : "Include RNA MSA"}
          </label>
        </div>
      )}
      {(value.feature_mode ?? "none") !== "none" && (
        <label className="network-choice">
          <input
            type="checkbox"
            checked={value.allow_network ?? false}
            onChange={(e) => update({ allow_network: e.target.checked })}
          />
          {zh
            ? "允许此次任务联网：搜索会发送序列，模板可能下载结构。"
            : "Allow network for this task: searches transmit sequences; templates may download structures."}
        </label>
      )}
      {expert && (
        <>
          {(checkpoints.length > 0 || value.checkpoint_id) && (
            <label className="field">
              {zh
                ? "服务器注册的自定义权重"
                : "Server-registered custom checkpoint"}
              <select
                value={value.checkpoint_id ?? ""}
                onChange={(e) =>
                  update({ checkpoint_id: e.target.value || null })
                }
              >
                <option value="">
                  {zh
                    ? "使用上方选择的标准 / ABAG 模型"
                    : "Use the selected standard / ABAG checkpoint"}
                </option>
                {checkpoints.map((c) => (
                  <option key={c.id} value={c.id} disabled={!c.present}>
                    {c.id}
                    {!c.present ? (zh ? "（文件缺失）" : " (missing)") : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {registryError && (
            <p role="status" className="notice">
              {registryError}
            </p>
          )}
          <div className="parameter-grid">
            <label className="field">
              {zh ? "计算设备" : "Compute device"}
              <select
                value={value.device ?? "cuda"}
                onChange={(e) =>
                  update({
                    device: e.target.value as Parameters["device"],
                    gpu_ids: [],
                    distributed: false,
                    triatt_kernel: "auto",
                    trimul_kernel: "auto",
                    dtype: e.target.value === "cpu" ? "fp32" : value.dtype,
                  })
                }
              >
                <option value="cuda">NVIDIA GPU (CUDA)</option>
                <option value="cpu">CPU</option>
              </select>
            </label>
            <IntegerListField
              value={value.additional_seeds ?? []}
              onChange={(additional_seeds) => update({ additional_seeds })}
              max={4294967295}
              count={7}
              label={
                zh
                  ? "额外随机种子（逗号分隔）"
                  : "Additional seeds (comma separated)"
              }
            />
            {value.device !== "cpu" && (
              <IntegerListField
                value={value.gpu_ids ?? []}
                onChange={(gpu_ids) => update({ gpu_ids })}
                max={63}
                count={8}
                label={
                  zh
                    ? "GPU 编号（留空自动）"
                    : "GPU indices (blank = automatic)"
                }
              />
            )}
            {(["trimul_kernel", "triatt_kernel"] as const).map((key) => (
              <label className="field" key={key}>
                {key === "trimul_kernel"
                  ? zh
                    ? "三角乘法内核"
                    : "Triangle multiplication kernel"
                  : zh
                    ? "三角注意力内核"
                    : "Triangle attention kernel"}
                <select
                  value={value[key] ?? "auto"}
                  onChange={(e) => update({ [key]: e.target.value })}
                >
                  {[
                    "auto",
                    "torch",
                    ...(value.device !== "cpu" ? ["cuequivariance"] : []),
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            ))}
            <label className="field">
              {zh ? "RNA 搜索 CPU 数" : "RNA search CPUs"}
              <input
                type="number"
                min={1}
                max={32}
                value={value.search_cpus ?? 4}
                onChange={(e) =>
                  update({ search_cpus: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="check-choices">
            {flags.map(([key, cn, en, hcn, hen, def]) => (
              <span className="choice-with-help" key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={value[key] ?? def}
                    onChange={(e) => update({ [key]: e.target.checked })}
                  />
                  {zh ? cn : en}
                </label>
                <Hint label={zh ? cn + "说明" : en + " help"}>
                  {zh ? hcn : hen}
                </Hint>
              </span>
            ))}
          </div>
          {value.device !== "cpu" && (
            <label>
              <input
                type="checkbox"
                checked={value.distributed ?? false}
                onChange={(e) => update({ distributed: e.target.checked })}
              />
              {zh
                ? "多 GPU FoldCP（至少选择两张 GPU）"
                : "Multi-GPU FoldCP (select at least two GPUs)"}
            </label>
          )}
        </>
      )}
    </section>
  );
}
