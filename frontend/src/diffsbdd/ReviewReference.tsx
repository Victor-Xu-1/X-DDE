import { useEffect, useState } from "react";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { referenceKey } from "./model";
import { resolveReference } from "./reference-metadata";

/** A filename is descriptive; the selected immutable reference remains authoritative. */
export function ReviewReference({
  reference,
  kind,
  language,
}: {
  reference: MoleculeRef;
  kind: "structure" | "ligand";
  language: Language;
}) {
  const zh = language === "zh";
  const identity = referenceKey(reference);
  const [file, setFile] = useState({ identity: "", name: "", failed: false });
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(30000),
    ]);
    void resolveReference(
      reference.asset_id,
      kind,
      kind === "structure" ? [".pdb"] : [".sdf"],
      reference,
      signal,
      (asset) => {
        if (!controller.signal.aborted)
          setFile({ identity, name: asset.name, failed: false });
      },
    ).catch(() => {
      if (!controller.signal.aborted)
        setFile({ identity, name: "", failed: true });
    });
    return () => controller.abort();
  }, [identity, kind]);
  const current = file.identity === identity ? file : null;
  return (
    <span>
      <a
        href={`/api/assets/${encodeURIComponent(reference.asset_id)}`}
        download
      >
        {current?.name ||
          (current?.failed
            ? zh
              ? "文件名暂不可用 · 下载核对"
              : "Filename unavailable · download to check"
            : zh
              ? "正在读取文件名…"
              : "Reading filename…")}
      </a>
      {kind === "ligand" && (
        <>
          {" · "}
          {zh ? "记录" : "Record"} {reference.record + 1}
          {reference.conformer > 0 && (
            <>
              {" · "}
              {zh ? "构象" : "Conformer"} {reference.conformer + 1}
            </>
          )}
        </>
      )}
    </span>
  );
}
