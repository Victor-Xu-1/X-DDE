import { useEffect, useRef, useState } from "react";
import { artifactUrl, request } from "../api";
import { PredictionConfidenceCard } from "../presentation/PredictionConfidenceCard";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { Language } from "../types";
import type {
  ConfidenceBinding,
  ConfidenceInspection,
} from "../viewer/confidence-types";
import { ConfidencePlddt } from "./ConfidencePlddt";
import { ConfidenceDownload } from "./ConfidenceDownload";
import type { Confidence } from "./confidence-data";
import { confidencePlotLayout } from "./confidence-plot";

type ConfidenceMetric = "pae" | "pde" | "contacts";

export function ConfidencePanel({
  jobId,
  candidate,
  language,
  onBinding,
  inspection,
  selectedResidues = [],
  selectedTokens = [],
  onTokens,
  metrics,
}: {
  jobId: string;
  candidate: string;
  language: Language;
  onBinding?(value: ConfidenceBinding | null): void;
  inspection?: ConfidenceInspection | null;
  selectedResidues?: string[];
  selectedTokens?: number[];
  onTokens?(tokens: number[]): void;
  metrics?: readonly [ConfidenceMetric, ...ConfidenceMetric[]];
}) {
  const zh = language === "zh";
  const [choice, setMetric] = useState<ConfidenceMetric>("pae");
  const metric = !metrics || metrics.includes(choice) ? choice : metrics[0];
  const [attempt, setAttempt] = useState(0);
  const [borders, setBorders] = useState(true);
  const bindingCallback = useRef(onBinding);
  bindingCallback.current = onBinding;
  useEffect(() => {
    bindingCallback.current?.(null);
  }, [jobId, candidate]);
  const key = jobId + ":" + candidate + ":" + metric + ":" + attempt;
  const [state, setState] = useState<{
    key: string;
    data?: Confidence;
    error?: number | "request";
  }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    void request<Confidence>(
      "/jobs/" +
        jobId +
        "/confidence?" +
        new URLSearchParams({ candidate, metric }),
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            error: typeof error?.status === "number" ? error.status : "request",
          });
      });
    return () => controller.abort();
  }, [jobId, candidate, metric, key]);
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  useEffect(() => {
    if (!data) {
      bindingCallback.current?.(null);
      return;
    }
    bindingCallback.current?.(
      data.binding && data.structure_artifact
        ? {
            ...data.binding,
            job: jobId,
            candidate,
            url: artifactUrl(jobId, data.structure_artifact),
          }
        : null,
    );
  }, [data, jobId, candidate]);
  const labels: Record<string, string> = {
    pae: zh ? "预测对齐误差 PAE" : "Predicted aligned error (PAE)",
    pde: zh ? "预测距离误差 PDE" : "Predicted distance error (PDE)",
    contacts: zh ? "预测接触概率" : "Predicted contact probability",
  };
  return (
    <PredictionConfidenceCard
      className="confidence-panel"
      title={labels[metric]}
      unit={metric === "contacts" ? "0–1" : "Å"}
      controls={
        <>
          <label className="field">
            {zh ? "置信度视图" : "Confidence view"}
            <select
              value={metric}
              onChange={(event) =>
                setMetric(event.target.value as ConfidenceMetric)
              }
            >
              {Object.entries(labels)
                .filter(
                  ([id]) =>
                    !metrics || metrics.includes(id as ConfidenceMetric),
                )
                .map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          {inspection && (
            <label className="confidence-chain-borders">
              <input
                type="checkbox"
                checked={borders}
                onChange={(e) => setBorders(e.target.checked)}
              />
              {zh ? "链边界" : "Chain borders"}
            </label>
          )}
        </>
      }
    >
      {error ? (
        <div role="status" className="notice">
          <p>
            {error === 404
              ? zh
                ? "此构象没有保留所选视图的原生置信度矩阵。"
                : "No native confidence matrix was retained for this view of the selected structure."
              : error === 422
                ? zh
                  ? "无法核验此构象的置信度数据。原始结构和文件保持不变。"
                  : "Confidence could not be verified for this structure. Its original files are preserved."
                : zh
                  ? "暂时无法读取置信度，请重试。"
                  : "Confidence could not be loaded. Please retry."}
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {zh ? "重新读取置信度" : "Reload confidence"}
          </button>
        </div>
      ) : !data ? (
        <p role="status">
          {zh
            ? "正在读取当前构象的置信度…"
            : "Loading confidence for the selected structure…"}
        </p>
      ) : (
        <>
          <InteractivePlot
            title={labels[metric]}
            language={language}
            height={420}
            selectable={Boolean(inspection && onTokens)}
            onPoint={(point) => {
              if (inspection && Number.isInteger(point.x))
                onTokens?.([Number(point.x)]);
            }}
            onRange={(range) => {
              if (!inspection) return;
              onTokens?.(
                inspection.tokens
                  .filter((token) =>
                    [range.x, range.y].some(
                      (axis) =>
                        token.index >= Math.min(...axis) &&
                        token.index <= Math.max(...axis),
                    ),
                  )
                  .map((token) => token.index),
              );
            }}
            data={[
              {
                type: "heatmap",
                x: data.indices,
                y: data.indices,
                z: data.matrix,
                colorscale: "Viridis",
                text: data.indices.map((y) =>
                  data.indices.map(
                    (x) =>
                      `${inspection?.tokens[x]?.label ?? x} · ${inspection?.tokens[y]?.label ?? y}`,
                  ),
                ),
                hovertemplate:
                  metric === "contacts"
                    ? "%{text}<br>%{z:.3f}<extra></extra>"
                    : "%{text}<br>%{z:.2f} Å<extra></extra>",
                zmin: 0,
                zmax:
                  metric === "contacts"
                    ? 1
                    : data.matrix.reduce(
                        (max, row) => row.reduce((m, v) => Math.max(m, v), max),
                        30,
                      ),
                colorbar: {
                  title: {
                    text:
                      metric === "contacts"
                        ? zh
                          ? "概率"
                          : "Probability"
                        : "Å",
                  },
                },
              },
            ]}
            layout={{
              ...confidencePlotLayout(
                inspection,
                selectedResidues,
                borders,
                selectedTokens,
              ),
              xaxis: {
                title: { text: zh ? "原始 token 索引" : "Native token index" },
              },
              yaxis: {
                title: { text: zh ? "原始 token 索引" : "Native token index" },
                scaleanchor: "x",
                scaleratio: 1,
                constrain: "domain",
              },
            }}
          />
          <p className="small">
            {data.token_count} tokens · {zh ? "显示步长" : "Display stride"}{" "}
            {data.stride}.
            {inspection
              ? zh
                ? " 点击选择横轴对应的残基；切换到选择并拖动可选取双轴范围。"
                : "Click to inspect the X-axis residue; choose Select and drag to select both axis ranges."
              : zh
                ? " 原始 token 索引不等同于残基编号。"
                : " Native token indices are not residue numbers."}
          </p>
          <ConfidencePlddt
            data={data}
            language={language}
            inspection={inspection}
            onTokens={onTokens}
          />
          <ConfidenceDownload
            job={jobId}
            candidate={candidate}
            data={data}
            language={language}
          />
          {data.source_integrity === "current_files" && (
            <p className="small">
              {zh
                ? "对应关系已按此任务保留的文件核对；原始置信度文件未记录完成时的校验信息。"
                : "Correspondence checked against retained task files; original confidence-file integrity was not recorded at completion."}
            </p>
          )}
          {data.mapping_status === "unsupported" && (
            <p role="status" className="small">
              {zh
                ? "此文件的结构对应关系暂不受支持；可查看矩阵和下载原生数据，三维联动未启用。"
                : "Structural correspondence is unsupported for this file. Matrix inspection and native downloads remain available; 3D linking is disabled."}
            </p>
          )}
        </>
      )}
    </PredictionConfidenceCard>
  );
}
