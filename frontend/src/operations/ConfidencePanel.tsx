import { useEffect, useRef, useState } from "react";
import { artifactUrl, request } from "../api";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { Language } from "../types";
import type {
  ConfidenceBinding,
  NativeConfidence,
  ConfidenceInspection,
} from "../viewer/confidence-types";
import { confidencePlotLayout } from "./confidence-plot";

interface Confidence {
  metric: string;
  token_count: number;
  indices: number[];
  stride: number;
  matrix: number[][];
  atom_plddt: { index: number; value: number }[];
  atom_stride: number;
  atom_plddt_unit?: string;
  native_artifact: string;
  structure_artifact?: string;
  binding?: NativeConfidence | null;
}

export function ConfidencePanel({
  jobId,
  candidate,
  language,
  onBinding,
  inspection,
  selectedResidues = [],
  onTokens,
}: {
  jobId: string;
  candidate: string;
  language: Language;
  onBinding?(value: ConfidenceBinding | null): void;
  inspection?: ConfidenceInspection | null;
  selectedResidues?: string[];
  onTokens?(tokens: number[]): void;
}) {
  const zh = language === "zh";
  const [metric, setMetric] = useState("pae");
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
    error?: string;
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
        if (!controller.signal.aborted) setState({ key, error: String(error) });
      });
    return () => controller.abort();
  }, [jobId, candidate, metric, key]);
  const data = state.key === key ? state.data : undefined;
  const error = state.key === key ? state.error : undefined;
  useEffect(() => {
    if (!data) return;
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
  const atomScores =
    data?.atom_plddt_unit === "0-1" &&
    data.atom_plddt.every(
      (row) => Number.isFinite(row.value) && row.value >= 0 && row.value <= 1,
    )
      ? data.atom_plddt.map((row) => 100 * row.value)
      : null;
  const labels: Record<string, string> = {
    pae: zh ? "预测对齐误差 PAE" : "Predicted aligned error (PAE)",
    pde: zh ? "预测距离误差 PDE" : "Predicted distance error (PDE)",
    contacts: zh ? "预测接触概率" : "Predicted contact probability",
  };
  return (
    <section className="studio-panel confidence-panel">
      <label className="field">
        {zh ? "置信度视图" : "Confidence view"}
        <select
          value={metric}
          onChange={(event) => setMetric(event.target.value)}
        >
          {Object.entries(labels).map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <div role="status" className="notice">
          <p>{error}</p>
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
                hovertemplate: "%{text}<br>%{z}<extra></extra>",
                zmin: 0,
                zmax: metric === "contacts" ? 1 : 30,
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
              ...confidencePlotLayout(inspection, selectedResidues, borders),
              xaxis: {
                title: { text: zh ? "原始 token 索引" : "Native token index" },
              },
              yaxis: {
                title: { text: zh ? "原始 token 索引" : "Native token index" },
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
          {data.atom_plddt.length > 0 && atomScores !== null && (
            <details>
              <summary>{zh ? "逐原子置信度" : "Atom confidence"}</summary>
              <InteractivePlot
                title="Atom pLDDT"
                language={language}
                height={220}
                data={[
                  {
                    type: "scatter",
                    mode: "lines",
                    x: data.atom_plddt.map((row) => row.index),
                    y: atomScores,
                    name: "pLDDT",
                  },
                ]}
                layout={{
                  xaxis: {
                    title: { text: zh ? "原始原子索引" : "Native atom index" },
                  },
                  yaxis: { title: { text: "pLDDT (0–100)" }, range: [0, 100] },
                }}
              />
              <p className="small">
                {zh ? "显示步长" : "Display stride"} {data.atom_stride}
              </p>
            </details>
          )}
          {data.atom_plddt.length > 0 && atomScores === null && (
            <p role="status" className="small">
              {zh
                ? "逐原子置信度的数值范围尚无法核验，请下载原生数据查看。"
                : "The atom-confidence scale could not be verified. Download the native data to inspect it."}
            </p>
          )}
          <a href={artifactUrl(jobId, data.native_artifact)} download>
            {zh ? "下载完整原生置信度" : "Download full native confidence"}
          </a>
        </>
      )}
    </section>
  );
}
