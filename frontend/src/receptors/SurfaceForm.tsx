import { useState } from "react";
import { useExampleReference, useExampleTask } from "../examples/context";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { Questionnaire } from "../guided/Questionnaire";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { SurfaceRegionPicker } from "./SurfaceRegionPicker";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import {
  surfaceDefaults,
  surfaceLabel,
  type SurfaceRegion,
  type SurfaceOptions,
} from "./surface-types";
import "./surface.css";
export function SurfaceForm({
  language,
  onCreated,
  initialStructure,
}: {
  language: Language;
  onCreated(job: Job): void;
  initialStructure?: MoleculeRef;
}) {
  const example = useExampleTask("surface_exposure");
  const templateStructure = useExampleReference("receptor", "brd4_alt_a");
  initialStructure ??= example?.structure ?? templateStructure ?? undefined;
  const zh = language === "zh",
    run = useTaskSubmit(onCreated),
    availability = useTaskReadiness("biopython.exposure");
  const [structure, setStructure] = useState<MoleculeRef | null>(
      initialStructure ?? null,
    ),
    [regions, setRegions] = useState<SurfaceRegion[]>(example?.regions ?? []),
    [options, setOptions] = useState(example?.options ?? surfaceDefaults),
    [chains, setChains] = useState<string[]>([]);
  const valid =
    Boolean(structure) &&
    regions.length > 0 &&
    regions.length <= 128 &&
    (!options.context_chains.length ||
      regions.every((r) => options.context_chains.includes(r.chain))) &&
    Number.isFinite(options.probe_radius_angstrom) &&
    options.probe_radius_angstrom >= 0.5 &&
    options.probe_radius_angstrom <= 3;
  function toggleChain(chain: string) {
    setOptions((v) => ({
      ...v,
      context_chains: v.context_chains.includes(chain)
        ? v.context_chains.filter((c) => c !== chain)
        : [...v.context_chains, chain],
    }));
  }
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      ready={availability.ready}
      error={run.error || availability.error}
      unavailable={
        zh
          ? "请在安装与组件中配置结构处理环境。"
          : "Configure the structural environment in Installation & components."
      }
      submitLabel={zh ? "计算暴露与埋藏" : "Calculate exposure and burial"}
      onSubmit={() =>
        run.submit({
          operation: "surface_exposure",
          name: zh ? "区域暴露与埋藏" : "Region exposure and burial",
          structure: structure!,
          regions,
          options,
          scientific_inputs: [structure!],
        })
      }
      steps={[
        {
          title: zh ? "选择结构" : "Choose structure",
          valid: Boolean(structure),
          content: (
            <ReferencePicker
              language={language}
              kind="structure"
              label={
                zh ? "包含研究区域的结构" : "Structure containing the region"
              }
              allowedSuffixes={[".pdb", ".cif"]}
              value={structure}
              onChange={(v) => {
                setStructure(v);
                setRegions([]);
                setChains([]);
                setOptions(surfaceDefaults);
              }}
            />
          ),
        },
        {
          title: zh ? "点选研究区域" : "Select region",
          valid: regions.length > 0,
          content: structure ? (
            <SurfaceRegionPicker
              key={structure.asset_id}
              source={structure}
              language={language}
              value={regions}
              onChange={setRegions}
              onChains={setChains}
            />
          ) : null,
        },
        {
          title: zh ? "选择测量方案" : "Choose measurement",
          valid,
          content: (
            <>
              <ChoiceCards<"standard" | "fine">
                label={zh ? "采样精度" : "Sampling resolution"}
                value={options.sphere_points === 1920 ? "fine" : "standard"}
                onChange={(v) =>
                  setOptions((o) => ({
                    ...o,
                    sphere_points: v === "fine" ? 1920 : 960,
                  }))
                }
                options={[
                  {
                    value: "standard",
                    title: zh ? "标准（推荐）" : "Standard (recommended)",
                    note: zh
                      ? "水分子探针，适合先查看区域暴露。"
                      : "Water-sized probe for an initial exposure measurement.",
                  },
                  {
                    value: "fine",
                    title: zh ? "精细采样" : "Fine sampling",
                    note: zh
                      ? "增加采样点，计算较慢；大结构可能需要缩小计算范围。"
                      : "More sample points; slower, and large structures may require a smaller context.",
                  },
                ]}
              />
              <details>
                <summary>{zh ? "专家微调" : "Expert settings"}</summary>
                <label className="field">
                  {zh ? "探针半径（Å）" : "Probe radius (Å)"}
                  <input
                    type="number"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={options.probe_radius_angstrom}
                    onChange={(e) =>
                      setOptions((v) => ({
                        ...v,
                        probe_radius_angstrom: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  {zh ? "球面采样点数" : "Sphere points"}
                  <select
                    value={options.sphere_points}
                    onChange={(e) =>
                      setOptions((v) => ({
                        ...v,
                        sphere_points: Number(
                          e.target.value,
                        ) as SurfaceOptions["sphere_points"],
                      }))
                    }
                  >
                    {[480, 960, 1920].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {zh
                    ? "参与遮挡的链：未勾选时使用文件中的全部链。"
                    : "Occluding chains: all provided chains when none are checked."}
                </p>
                <div className="surface-context-chains">
                  {chains.map((chain) => (
                    <label className="checkbox-line" key={chain}>
                      <input
                        type="checkbox"
                        checked={options.context_chains.includes(chain)}
                        onChange={() => toggleChain(chain)}
                      />
                      {zh ? "链 " : "Chain "}
                      {chain}
                    </label>
                  ))}
                </div>
              </details>
              <Hint label={zh ? "面积表示什么？" : "What does this area mean?"}>
                {zh
                  ? "以已有重原子坐标和元素范德华半径，计算探针可接触面积；移除水和氢。比较的是同一区域单独存在与处于所选结构中时的面积。不会生成生物学装配、补原子或估计结合能；其他模型请先通过结构准备选取。"
                  : "Observed heavy atoms and elemental van der Waals radii define the probe-accessible area; water and hydrogens are excluded. The same region is compared in isolation and in the selected context. Assemblies, missing atoms and binding energies are not inferred; prepare other structural models first."}
              </Hint>
            </>
          ),
        },
        {
          title: zh ? "确认计算" : "Review calculation",
          valid,
          content: (
            <dl className="questionnaire-review">
              <dt>{zh ? "研究区域" : "Region"}</dt>
              <dd>{regions.map(surfaceLabel).join(" · ")}</dd>
              <dt>{zh ? "周围结构" : "Context"}</dt>
              <dd>
                {options.context_chains.length
                  ? options.context_chains.join(", ")
                  : zh
                    ? "文件中的全部链"
                    : "All provided chains"}
              </dd>
              <dt>{zh ? "探针 / 采样" : "Probe / sampling"}</dt>
              <dd>
                {options.probe_radius_angstrom} Å · {options.sphere_points}
              </dd>
              <dt>{zh ? "结果" : "Results"}</dt>
              <dd>
                {zh
                  ? "三维定位 · 区域与原子面积 · CSV 下载"
                  : "3D location · region and atom areas · CSV download"}
              </dd>
            </dl>
          ),
        },
      ]}
    />
  );
}
