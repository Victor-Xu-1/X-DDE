import { lazy, Suspense, useState } from "react";
import type { Language } from "../../types";
import { artifactUrl } from "../../api";
import { useAlignment } from "./useAlignment";
import { AlignmentViewBoundary } from "./AlignmentViewBoundary";
import type { AlignmentFile } from "./alignment-data";
import "./alignment.css";
const Canvas = lazy(() => import("./AlignmentCanvas"));

function LoadedAlignment({
  jobId,
  file,
  query,
  language,
}: {
  jobId: string;
  file: AlignmentFile;
  query: string;
  language: Language;
}) {
  const [attempt, retry] = useState(0);
  const state = useAlignment(jobId, file, query, attempt);
  const zh = language === "zh";
  if (state.error)
    return (
      <div role="alert">
        <p>
          {zh
            ? "比对文件暂不可预览；原始文件仍可下载。"
            : "Alignment preview unavailable; the original file remains downloadable."}
        </p>
        <button type="button" onClick={() => retry(attempt + 1)}>
          {zh ? "重试预览" : "Retry preview"}
        </button>
      </div>
    );
  if (!state.data)
    return (
      <p role="status">
        {zh ? "正在加载完整比对…" : "Loading the complete alignment…"}
      </p>
    );
  return (
    <AlignmentViewBoundary language={language}>
      <Suspense
        fallback={
          <p role="status">
            {zh ? "正在打开比对视图…" : "Opening alignment viewer…"}
          </p>
        }
      >
        <Canvas data={state.data} language={language} />
      </Suspense>
    </AlignmentViewBoundary>
  );
}
export function AlignmentResults({
  jobId,
  files,
  query,
  language,
}: {
  jobId: string;
  files: AlignmentFile[];
  query: string;
  language: Language;
}) {
  const [selected, setSelected] = useState(files[0]?.artifact);
  const file = files.find((value) => value.artifact === selected) ?? files[0];
  const zh = language === "zh";
  if (!file) return null;
  return (
    <section
      className="research-alignment"
      aria-label={
        zh ? "完整多序列比对" : "Complete multiple-sequence alignment"
      }
    >
      <header className="evidence-material-toolbar">
        <label>
          {zh ? "比对类型" : "Alignment"}
          <select
            value={file.artifact}
            onChange={(event) => setSelected(event.target.value)}
          >
            {files.map((value) => (
              <option value={value.artifact} key={value.artifact}>
                {value.artifact === "pairing.a3m"
                  ? zh
                    ? "配对比对"
                    : "Paired alignment"
                  : zh
                    ? "非配对比对"
                    : "Unpaired alignment"}{" "}
                · {value.rows.toLocaleString()} ×{" "}
                {value.columns.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <a href={artifactUrl(jobId, file.artifact)} download>
          {zh ? "下载完整比对 · A3M" : "Download complete alignment · A3M"}
        </a>
      </header>
      <LoadedAlignment
        key={`${jobId}:${JSON.stringify(file)}:${query}`}
        jobId={jobId}
        file={file}
        query={query}
        language={language}
      />
      <p className="field-help">
        {zh
          ? "显示全部比对行和查询匹配列；小写插入保留在原始 A3M 下载文件中。未推断系统发育树。"
          : "All rows and query match columns are available. Lowercase insertions remain in the original A3M download. No phylogenetic tree is inferred."}
      </p>
    </section>
  );
}
