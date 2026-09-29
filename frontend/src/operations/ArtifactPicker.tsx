import { useEffect, useState } from "react";
import { api } from "../api";
import type { Artifact, Job, Language } from "../types";
import type { Asset, AssetKind } from "./types";

export function ArtifactPicker({
  kind,
  accept,
  language,
  onSelected,
}: {
  kind: AssetKind;
  accept: string;
  language: Language;
  onSelected(asset: Asset): void;
}) {
  const zh = language === "zh",
    [jobs, setJobs] = useState<Job[]>([]),
    [job, setJob] = useState(""),
    [files, setFiles] = useState<Artifact[]>([]),
    [file, setFile] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    void api
      .jobs(c.signal)
      .then((data) => setJobs(data.filter((j) => j.status === "succeeded")))
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setFiles([]);
    setFile("");
    if (job)
      void api
        .artifacts(job, c.signal)
        .then(setFiles)
        .catch((e) => {
          if (!c.signal.aborted) setError(String(e));
        });
    return () => c.abort();
  }, [job]);
  async function reuse() {
    setBusy(true);
    setError("");
    try {
      onSelected(
        await api.post<Asset>(
          `/jobs/${job}/assets?${new URLSearchParams({ kind, name: file })}`,
          {},
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="artifact-picker">
      <label className="field">
        {zh ? "来源任务" : "Source task"}
        <select value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">
            {zh ? "选择已完成任务" : "Choose a completed task"}
          </option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.request.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {zh ? "结果文件" : "Result file"}
        <select value={file} onChange={(e) => setFile(e.target.value)}>
          <option value="">{zh ? "选择结果" : "Choose a result"}</option>
          {files
            .filter((f) =>
              accept
                .split(",")
                .some((ext) => f.name.toLowerCase().endsWith(ext)),
            )
            .map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || !job || !file}
        onClick={() => void reuse()}
      >
        {zh ? "使用这个结果" : "Use this result"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
