import { useState } from "react";
import { artifactUrl } from "../api";
import { StructureViewer } from "../viewer/StructureViewer";
import { Hint } from "../guided/Hint";
import { ChannelProfile } from "./ChannelProfile";
import type { Job, Language } from "../types";
import type { ChannelResult } from "./types";
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
  const mean = channel
    ? Math.min(...channel.points.map((p) => p.radius_angstrom))
    : null;
  return (
    <section
      className="channel-results"
      aria-label={zh ? "通道分析结果" : "Channel analysis results"}
    >
      <div className="channel-result-heading">
        <h3>{zh ? "口袋通道与瓶颈" : "Pocket channels and bottlenecks"}</h3>
        <Hint label={zh ? "怎样理解通道？" : "How to interpret channels?"}>
          {zh
            ? "这是所选静态结构内的球形探针几何路径。瓶颈为原生报告中的最小半径；橙色标记是采样点中的最窄位置，可能因采样间隔略有差别。不是药物通过概率、能量或结合亲和力。"
            : "These are geometric sphere-probe paths through the selected static structure. The bottleneck is the native minimum radius; the orange marker is the narrowest sampled point and may differ slightly due to sampling. Neither is passage probability, energy or binding affinity."}
        </Hint>
      </div>
      <dl className="channel-summary">
        <div>
          <dt>{zh ? "本次找到路径" : "Paths found"}</dt>
          <dd>{result.channels.length}</dd>
        </div>
        <div>
          <dt>{zh ? "所选路径瓶颈半径" : "Selected bottleneck radius"}</dt>
          <dd>
            {channel ? channel.bottleneck_radius_angstrom.toFixed(2) : "—"}{" "}
            <small>Å</small>
          </dd>
        </div>
        <div>
          <dt>{zh ? "原生路径长度" : "Native path length"}</dt>
          <dd>
            {channel ? channel.length_angstrom.toFixed(1) : "—"}{" "}
            <small>Å</small>
          </dd>
        </div>
      </dl>
      {result.context.quality.backbone_complete === false && (
        <p role="status" className="field-note">
          {zh
            ? "所选结构的部分骨架原子缺失，可能影响通道。请检查准备结构，再决定是否用于后续研究。"
            : "Some observed backbone atoms are missing and can affect channels. Review the prepared structure before downstream use."}
        </p>
      )}
      {!channel && (
        <p role="status">
          {zh
            ? "在当前探针和搜索条件内未发现路径。可另建任务调整探针或结构范围；不表示此处一定没有通道。"
            : "No path was found within the declared probe and search conditions. Adjust the probe or context in a new task; this does not establish that no channel exists."}
        </p>
      )}
      <div className="channel-result-layout">
        <div className="channel-preview">
          <StructureViewer
            urls={[artifactUrl(job.id, result.preparation.artifact)]}
            language={language}
            channelGeometry={
              channel ? { points: channel.points, envelope } : undefined
            }
          />
          {channel && (
            <div className="channel-legend">
              <span>
                <i className="channel-line" />{" "}
                {zh ? "原生采样路径" : "Native sampled path"}
              </span>
              <span>
                <i className="channel-narrow" />{" "}
                {zh ? "采样最窄处" : "Narrowest sample"} · {mean!.toFixed(2)} Å
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
        </div>
        <div className="channel-analysis">
          {channel && (
            <div className="channel-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{zh ? "路径" : "Path"}</th>
                    <th>{zh ? "瓶颈半径" : "Bottleneck"} · Å</th>
                    <th>{zh ? "长度" : "Length"} · Å</th>
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
      </div>
      <div className="channel-downloads">
        <a href={artifactUrl(job.id, "channels.csv")} download>
          {zh ? "下载路径指标" : "Download channel metrics"}
        </a>
        <a href={artifactUrl(job.id, "channel-points.csv")} download>
          {zh ? "下载三维坐标与半径" : "Download coordinates and radii"}
        </a>
        <a href={artifactUrl(job.id, result.preparation.artifact)} download>
          {zh ? "下载准备结构" : "Download prepared structure"}
        </a>
      </div>
      <details className="channel-conditions">
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
              : "The plot uses the sampled polyline distance; it can differ from the native full-path length."}
          </dd>
        </dl>
      </details>
    </section>
  );
}
