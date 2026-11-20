import { StructureWorkbench } from "../presentation/StructureWorkbench";
import { SpatialResultSummary } from "../presentation/SpatialResultSummary";
import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import { ChannelProfile } from "./ChannelProfile";
import type { Job, Language } from "../types";
import type { ChannelResult } from "./types";
import "../presentation/spatial-result-review.css";
import "./channels.css";
import { ResultRow } from "../presentation/ResultRow";
export function ChannelResults({
  job,
  result,
  language,
}: {
  job: Job;
  result: ChannelResult;
  language: Language;
}) {
  const zh = language === "zh",
    [selected, setSelected] = useState(0),
    [envelope, setEnvelope] = useState(true);
  const channel = result.channels[selected] ?? result.channels[0];
  return (
    <section
      className="spatial-results channel-results spatial-review"
      aria-label={zh ? "通道分析结果" : "Channel analysis results"}
    >
      <StructureWorkbench
        preview={
          <StructureViewer
            urls={[artifactUrl(job.id, result.preparation.artifact)]}
            language={language}
            channelGeometry={
              channel ? { points: channel.points, envelope } : undefined
            }
          />
        }
      >
        <SpatialResultSummary
          jobId={job.id}
          language={language}
          className="channel-summary"
          title={zh ? "口袋通道与瓶颈" : "Pocket channels and bottlenecks"}
          hint={
            <Hint label={zh ? "怎样理解通道？" : "How to interpret channels?"}>
              {zh
                ? "这是静态结构内的球形探针几何路径。瓶颈是原生报告的最小半径，橙色标记显示最窄的采样点，两者可因采样间隔略有差别。"
                : "These are geometric sphere-probe paths through the selected static structure. The bottleneck is the native minimum radius. The orange marker shows the narrowest sampled point, which can differ slightly due to sampling."}
            </Hint>
          }
          metrics={[
            {
              label: zh ? "找到路径" : "Paths found",
              value: result.channels.length,
            },
            {
              label: zh ? "所选路径瓶颈" : "Selected bottleneck",
              value: channel?.bottleneck_radius_angstrom.toFixed(2) ?? "—",
              unit: channel ? "Å" : undefined,
            },
            {
              label: zh ? "所选路径长度" : "Selected path length",
              value: channel?.length_angstrom.toFixed(1) ?? "—",
              unit: channel ? "Å" : undefined,
            },
          ]}
          files={[
            {
              artifact: "channels.csv",
              label: zh ? "路径指标" : "Path metrics",
              downloadLabel: zh ? "下载路径指标" : "Download channel metrics",
            },
            {
              artifact: "channel-points.csv",
              label: zh ? "坐标与半径" : "Coordinates",
              downloadLabel: zh
                ? "下载三维坐标与半径"
                : "Download coordinates and radii",
            },
            {
              artifact: result.preparation.artifact,
              label: zh ? "结构" : "Structure",
              downloadLabel: zh
                ? "下载准备结构"
                : "Download prepared structure",
            },
          ]}
        >
          {channel && (
            <div className="channel-legend">
              <span>
                <i className="channel-line" />{" "}
                {zh ? "采样路径" : "Sampled path"}
              </span>
              <span>
                <i className="channel-narrow" />{" "}
                {zh ? "最窄采样点" : "Narrowest sample"}{" "}
                {Math.min(
                  ...channel.points.map((p) => p.radius_angstrom),
                ).toFixed(2)}{" "}
                Å
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={envelope}
                  onChange={(e) => setEnvelope(e.target.checked)}
                />
                {zh ? "显示采样空间" : "Show sampled clearance"}
              </label>
            </div>
          )}
        </SpatialResultSummary>
        {result.context.quality.backbone_complete === false && (
          <p role="status" className="field-note">
            {zh
              ? "部分骨架原子缺失，可能影响通道结果。"
              : "Missing backbone atoms may affect the channel result."}
          </p>
        )}
        {!channel && (
          <p role="status">
            {zh
              ? "当前探针和搜索条件未找到路径。"
              : "The selected probe and search conditions found no paths."}
          </p>
        )}
        <div className="channel-analysis">
          {channel && (
            <div className="channel-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{zh ? "路径" : "Path"}</th>
                    <th>
                      {zh ? "瓶颈半径" : "Bottleneck"}
                      <small>Å</small>
                    </th>
                    <th>
                      {zh ? "长度" : "Length"}
                      <small>Å</small>
                    </th>
                    <th>
                      {zh ? "曲折度" : "Curvature"}{" "}
                      <Hint
                        label={zh ? "曲折度是什么？" : "What is curvature?"}
                      >
                        {zh
                          ? "路径长度与起终点直线距离的比值；接近 1 较直。不是能量。"
                          : "Path length divided by straight-line endpoint distance. Near 1 is straighter; this is not energy."}
                      </Hint>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.channels.map((row, i) => (
                    <ResultRow
                      key={`${row.cluster}:${row.tunnel}`}
                      selected={selected === i}
                      onSelect={() => setSelected(i)}
                    >
                      <td>
                        <button
                          type="button"
                          aria-pressed={selected === i}
                          onClick={() => setSelected(i)}
                        >
                          {zh ? "路径 " : "Path "}
                          {i + 1}
                        </button>
                      </td>
                      <td>{row.bottleneck_radius_angstrom.toFixed(2)}</td>
                      <td>{row.length_angstrom.toFixed(1)}</td>
                      <td>{row.curvature.toFixed(2)}</td>
                    </ResultRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {channel && <ChannelProfile channel={channel} language={language} />}
        </div>
        <details>
          <summary>{zh ? "分析条件" : "Analysis conditions"}</summary>
          <dl className="questionnaire-review">
            <dt>{zh ? "方法" : "Method"}</dt>
            <dd>CAVER {result.versions.caver}</dd>
            <dt>{zh ? "探针半径" : "Probe radius"}</dt>
            <dd>{result.options.probe_radius_angstrom} Å</dd>
            <dt>{zh ? "采样间隔" : "Profile step"}</dt>
            <dd>{result.options.profile_step_angstrom} Å</dd>
            <dt>{zh ? "起点调整距离" : "Native start displacement"}</dt>
            <dd>{result.native_start_displacement_angstrom.toFixed(3)} Å</dd>
            <dt>{zh ? "结构范围" : "Context"}</dt>
            <dd>
              {result.options.context_chains.join(", ") ||
                (zh ? "全部提供的链" : "All provided chains")}
            </dd>
            <dt>{zh ? "结构处理" : "Structure selection"}</dt>
            <dd>
              {zh
                ? "保留已有原子，去水；不生成缺失原子。"
                : "Observed atoms, water omitted; missing atoms not generated."}
            </dd>
            <dt>{zh ? "曲线距离" : "Profile distance"}</dt>
            <dd>
              {zh
                ? "横轴使用实际采样点的折线路程；与原生整条路径长度可能略有不同。"
                : "The plot uses sampled polyline distance, which can differ from the native full-path length."}
            </dd>
          </dl>
        </details>
      </StructureWorkbench>
    </section>
  );
}
