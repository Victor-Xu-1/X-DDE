import { useEffect, useState } from "react";
import { artifactUrl } from "../api";
import { InteractivePlot } from "../presentation/plots/InteractivePlot";
import type { ChartTrace } from "../presentation/plots/types";
import type { Language } from "../types";
import type { NativeResult } from "./types";

interface ConfidencePreview {
  status: "available" | "download_only";
  source_sha256: string;
  token_count: number;
  token_stride: number;
  token_indices: number[];
  matrices: Record<string, number[][]>;
  atom_count: number;
  atom_stride: number;
  atom_indices: number[];
  atom_plddt: number[];
}
async function verifiedJson(url: string, sha: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > 8 * 1024 ** 2
  )
    throw new Error("Confidence preview is unavailable");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 8 * 1024 ** 2) {
      await reader.cancel();
      throw new Error("Confidence preview exceeds its byte limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const actual = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== sha) throw new Error("Confidence artifact identity changed");
  return JSON.parse(new TextDecoder().decode(bytes)) as ConfidencePreview;
}

export function Mol1Confidence({
  job,
  result,
  candidate,
  language,
}: {
  job: string;
  result: NativeResult;
  candidate: string;
  language: Language;
}) {
  const zh = language === "zh";
  const sample = result.mol1?.samples.find(
    (row) => row.candidate_id === candidate,
  );
  const file = sample?.preview_artifact;
  const key =
    job +
    ":" +
    candidate +
    ":" +
    file +
    ":" +
    (file ? result.artifact_sha256[file] : "") +
    ":" +
    (sample?.full_data_artifact
      ? result.artifact_sha256[sample.full_data_artifact]
      : "");
  const [state, setState] = useState<{
    key: string;
    value?: ConfidencePreview;
    error?: boolean;
  }>({ key: "" });
  const [mode, setMode] = useState("token_pair_pae");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!file || !sample?.full_data_artifact) return;
    const controller = new AbortController();
    setState({ key: "" });
    void verifiedJson(
      artifactUrl(job, file),
      result.artifact_sha256[file],
      AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    )
      .then((value) => {
        if (
          value.source_sha256 !==
          result.artifact_sha256[sample.full_data_artifact!]
        )
          throw new Error("Native confidence source differs");
        if (value.status === "available") {
          if (
            value.atom_indices?.length !== value.atom_plddt?.length ||
            value.atom_plddt.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
          )
            throw new Error("Invalid atom confidence");
          for (const id of [
            "token_pair_pae",
            "token_pair_pde",
            "contact_probs",
          ]) {
            const matrix = value.matrices?.[id];
            if (
              !matrix ||
              matrix.length !== value.token_indices?.length ||
              matrix.some(
                (row) =>
                  row.length !== value.token_indices.length ||
                  row.some(
                    (v) =>
                      !Number.isFinite(v) ||
                      v < 0 ||
                      (id === "contact_probs" && v > 1),
                  ),
              )
            )
              throw new Error("Invalid token confidence");
          }
        } else if (value.status !== "download_only")
          throw new Error("Unknown confidence state");
        if (!controller.signal.aborted) setState({ key, value });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, error: true });
      });
    return () => controller.abort();
  }, [key, attempt]);
  if (!sample) return null;
  if (!file)
    return (
      <p className="field-help">
        {zh
          ? "本次未请求逐原子与逐 token 的置信度。"
          : "Atom/token confidence was not requested for this run."}
      </p>
    );
  if (state.key !== key)
    return (
      <p role="status">
        {zh
          ? "正在读取当前构象的置信度…"
          : "Loading confidence for the selected structure…"}
      </p>
    );
  if (state.error)
    return (
      <div role="alert">
        <p>
          {zh
            ? "当前置信度文件无法核验。"
            : "The selected confidence file could not be verified."}
        </p>
        <button type="button" onClick={() => setAttempt((v) => v + 1)}>
          {zh ? "重新读取" : "Retry"}
        </button>
      </div>
    );
  const value = state.value!;
  if (value.status === "download_only")
    return (
      <p>
        {zh
          ? "完整置信度文件较大，请下载查看。"
          : "Download the full confidence file; it exceeds the interactive preview budget."}
        <a href={artifactUrl(job, sample.full_data_artifact!)} download>
          {zh ? "下载原始数据" : "Download original data"}
        </a>
      </p>
    );
  const atom = mode === "atom_plddt";
  const labels: Record<string, string> = {
    atom_plddt: zh ? "逐原子 pLDDT" : "Atom pLDDT",
    token_pair_pae: zh ? "预测对齐误差 PAE" : "Predicted aligned error (PAE)",
    token_pair_pde: zh ? "预测距离误差 PDE" : "Predicted distance error (PDE)",
    contact_probs: zh ? "预测接触概率" : "Predicted contact probability",
  };
  const trace: ChartTrace = atom
    ? {
        type: "scatter",
        mode: "lines",
        x: value.atom_indices,
        y: value.atom_plddt.map((v) => 100 * v),
        name: "pLDDT",
      }
    : {
        type: "heatmap",
        x: value.token_indices,
        y: value.token_indices,
        z: value.matrices[mode],
        colorscale: "Viridis",
        zmin: 0,
        zmax: mode === "contact_probs" ? 1 : 30,
        colorbar: {
          title: {
            text:
              mode === "contact_probs" ? (zh ? "概率" : "Probability") : "Å",
          },
        },
      };
  return (
    <section className="mol1-confidence">
      <label className="field">
        {zh ? "置信度视图" : "Confidence view"}
        <select value={mode} onChange={(event) => setMode(event.target.value)}>
          {Object.entries(labels).map(([id, label]) => (
            <option value={id} key={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <InteractivePlot
        title={labels[mode]}
        data={[trace]}
        language={language}
        layout={{
          xaxis: {
            title: {
              text: atom
                ? zh
                  ? "原始原子索引"
                  : "Native atom index"
                : zh
                  ? "原始 token 索引"
                  : "Native token index",
            },
          },
          yaxis: atom
            ? { title: { text: "pLDDT (0–100)" }, range: [0, 100] }
            : {
                title: { text: zh ? "原始 token 索引" : "Native token index" },
              },
        }}
      />
      <p className="field-help">
        {zh
          ? "索引从 0 开始，token 不等于残基编号。"
          : "Indices start at 0; token indices are not residue numbers."}{" "}
        {atom
          ? `${value.atom_count} ${zh ? "个原子，显示步长" : "atoms; display stride"} ${value.atom_stride}`
          : `${value.token_count} tokens; ${zh ? "显示步长" : "display stride"} ${value.token_stride}`}
      </p>
      <a href={artifactUrl(job, sample.full_data_artifact!)} download>
        {zh ? "下载完整原始置信度" : "Download full native confidence"}
      </a>
    </section>
  );
}
