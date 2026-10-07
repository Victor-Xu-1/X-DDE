import { useEffect, useState } from "react";
import type { Language } from "../types";
import type { Observation } from "./types";
import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
export function MaterialPreview({
  row,
  language,
}: {
  row: Observation;
  language: Language;
}) {
  const [sequence, setSequence] = useState(""),
    [error, setError] = useState("");
  const url = row.molecule ? `/api/assets/${row.molecule.asset_id}` : "";
  useEffect(() => {
    setSequence("");
    setError("");
    if (row.material_kind !== "sequence" || !url) return;
    const c = new AbortController();
    void fetch(url, { signal: c.signal })
      .then(async (response) => {
        if (
          !response.ok ||
          Number(response.headers.get("Content-Length")) > 1024 * 1024
        )
          throw Error(
            language === "zh"
              ? "序列文件不可读取或过大。"
              : "Sequence file is unavailable or too large.",
          );
        const text = await response.text();
        if (text.length > 1024 * 1024)
          throw Error("Sequence size exceeds preview budget.");
        if (!c.signal.aborted) setSequence(text);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [url, row.material_kind, language]);
  if (!row.molecule) return null;
  return (
    <div className="evidence-structure">
      <h3>{row.compound}</h3>
      {row.material_kind === "molecule" && (
        <MoleculeImage
          source={{ url, record: row.molecule.record }}
          label={row.compound}
          language={language}
        />
      )}
      {row.material_kind === "structure" && (
        <StructureViewer urls={[url]} language={language} />
      )}
      {row.material_kind === "sequence" && (
        <pre className="evidence-sequence">{sequence}</pre>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
