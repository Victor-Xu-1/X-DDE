import { ChannelExpert } from "./ChannelExpert";
import { useState } from "react";
import { useExample, useExampleTask } from "../examples/context";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { Questionnaire } from "../guided/Questionnaire";
import { ChoiceCards } from "../guided/ChoiceCards";
import { Hint } from "../guided/Hint";
import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useTaskSubmit } from "../operations/useTaskSubmit";
import { SurfaceRegionPicker } from "../receptors/SurfaceRegionPicker";
import { surfaceLabel, type SurfaceRegion } from "../receptors/surface-types";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { channelDefaults } from "./generated";
import type { ChannelOptions } from "./types";
import "../receptors/surface.css";
import "./channels.css";
const defaults = (): ChannelOptions =>
  ({ ...channelDefaults, context_chains: [] }) as ChannelOptions;
export function ChannelForm({
  language,
  onCreated,
}: {
  language: Language;
  onCreated(job: Job): void;
}) {
  const zh = language === "zh",
    example = useExample(),
    task = useExampleTask("channel_analysis");
  const caseActive = example?.case.id === "ache-donepezil";
  const [structure, setStructure] = useState<MoleculeRef | null>(
    task?.structure ??
      example?.objects.receptor?.reference ??
      (caseActive ? example.objects.ache?.reference : null) ??
      null,
  );
  const [regions, setRegions] = useState<SurfaceRegion[]>(
    task?.starting_regions ??
      (caseActive
        ? [{ chain: "A", number: 604, insertion_code: "", resname: "E20" }]
        : []),
  );
  const [options, setOptions] = useState<ChannelOptions>(
    task?.options ?? { ...defaults(), context_chains: caseActive ? ["A"] : [] },
  );
  const [chains, setChains] = useState<string[]>([]),
    run = useTaskSubmit(onCreated);
  const availability = useTaskReadiness("caver.paths");
  const valid =
    Boolean(structure) &&
    regions.length > 0 &&
    regions.length <= 12 &&
    (!options.context_chains.length ||
      regions.every((r) => options.context_chains.includes(r.chain))) &&
    Number.isFinite(options.probe_radius_angstrom) &&
    options.probe_radius_angstrom >= 0.5 &&
    options.probe_radius_angstrom <= 3;
  return (
    <Questionnaire
      language={language}
      busy={run.busy}
      ready={availability.ready}
      error={run.error || availability.error}
      unavailable={
        zh
          ? "请先在安装与组件中安装通道分析环境。"
          : "Install the channel-analysis environment in Components first."
      }
      submitLabel={zh ? "分析通道与瓶颈" : "Analyze channels and bottlenecks"}
      onSubmit={() =>
        run.submit({
          operation: "channel_analysis",
          name: zh ? "口袋通道与瓶颈" : "Pocket channels and bottlenecks",
          structure: structure!,
          scientific_inputs: [structure!],
          starting_regions: regions,
          options,
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
                zh ? "蛋白与结合部位结构" : "Protein and binding-site structure"
              }
              allowedSuffixes={[".pdb", ".cif"]}
              value={structure}
              onChange={(v) => {
                setStructure(v);
                setRegions([]);
                setChains([]);
                setOptions(defaults());
              }}
            />
          ),
        },
        {
          title: zh ? "点选起始位置" : "Select starting site",
          valid: regions.length > 0 && regions.length <= 12,
          content: structure ? (
            <SurfaceRegionPicker
              key={structure.asset_id}
              source={structure}
              language={language}
              value={regions}
              onChange={setRegions}
              onChains={setChains}
              maximum={12}
              purpose="channel"
            />
          ) : null,
        },
        {
          title: zh ? "选择分析方案" : "Choose analysis",
          valid,
          content: (
            <>
              <ChoiceCards<string>
                label={zh ? "通道探针" : "Channel probe"}
                value={String(options.probe_radius_angstrom)}
                onChange={(v) =>
                  setOptions((o) => ({
                    ...o,
                    probe_radius_angstrom: Number(v),
                  }))
                }
                options={[
                  {
                    value: "0.9",
                    title: zh ? "标准 · 推荐" : "Standard · recommended",
                    note: zh
                      ? "0.9 Å，先探索口袋的几何出口。"
                      : "0.9 Å for an initial search for geometric exits.",
                  },
                  {
                    value: "0.7",
                    title: zh ? "更细的通道" : "Narrower channels",
                    note: zh
                      ? "0.7 Å，可探索更狭窄的几何路径。"
                      : "0.7 Å to explore narrower geometric paths.",
                  },
                  {
                    value: "1.4",
                    title: zh ? "较宽的通道" : "Wider channels",
                    note: zh
                      ? "1.4 Å，只寻找可容纳较大探针的路径。"
                      : "1.4 Å to search for paths accommodating a larger probe.",
                  },
                ]}
              />
              <Hint
                label={
                  zh ? "探针半径表示什么？" : "What does probe radius mean?"
                }
              >
                {zh
                  ? "探针是用于测量空间的球体，不代表整个药物。结果只反映当前静态结构；通道存在不等于药物能穿过或具有活性。"
                  : "The probe is a geometric sphere, not the whole drug. Results describe the supplied static structure; a path does not establish drug passage or activity."}
              </Hint>
              <ChannelExpert
                language={language}
                options={options}
                setOptions={setOptions}
                chains={chains}
              />
            </>
          ),
        },
        {
          title: zh ? "确认分析" : "Review analysis",
          valid,
          content: (
            <dl className="questionnaire-review">
              <dt>{zh ? "起始区域" : "Starting region"}</dt>
              <dd>{regions.map(surfaceLabel).join(" · ")}</dd>
              <dt>{zh ? "结构范围" : "Context"}</dt>
              <dd>
                {options.context_chains.join(", ") ||
                  (zh ? "文件中的全部链" : "All provided chains")}
              </dd>
              <dt>{zh ? "探针 / 采样间隔" : "Probe / profile step"}</dt>
              <dd>
                {options.probe_radius_angstrom} Å /{" "}
                {options.profile_step_angstrom} Å
              </dd>
              <dt>{zh ? "重复坐标" : "Alternate coordinates"}</dt>
              <dd>
                {options.alternate === "reject"
                  ? zh
                    ? "有歧义则停止"
                    : "Stop on ambiguity"
                  : options.alternate}
              </dd>
              <dt>{zh ? "结果" : "Results"}</dt>
              <dd>
                {zh
                  ? "三维路径 · 瓶颈 · 宽度曲线 · 可复用结构 · 下载"
                  : "3D paths · bottlenecks · radius profile · reusable structure · downloads"}
              </dd>
            </dl>
          ),
        },
      ]}
    />
  );
}
