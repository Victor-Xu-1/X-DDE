import { MoleculeImage } from "../presentation/MoleculeImage";
import { StructureViewer } from "../viewer/StructureViewer";
import type { Language } from "../types";
import type { ReferenceImportResult } from "./ReferenceImportResults";
import { useEffect, useState } from "react";
import {
  readMolecularSource,
  type MolecularSourceSnapshot,
} from "../presentation/depiction-renderer";

/** Display the archived source without preparing new molecular coordinates. */
export function ReferenceArchivePreview({
  result,
  url,
  language,
  onVerified,
}: {
  result: ReferenceImportResult;
  url: string;
  language: Language;
  onVerified(ready: boolean): void;
}) {
  if (!/^[a-f0-9]{64}$/i.test(result.sha256))
    return (
      <p role="alert">
        {language === "zh"
          ? "暂时无法核验此文件，请重新导入参考材料。"
          : "This file cannot be verified. Import the reference again."}
      </p>
    );
  const sha256 = result.sha256.toLowerCase();
  return result.kind === "molecule" ? (
    <VerifiedMoleculePreview
      url={url}
      sha256={sha256}
      label={result.identifier}
      language={language}
      onVerified={onVerified}
    />
  ) : (
    <StructureViewer
      urls={[url]}
      language={language}
      sourceSnapshot
      expectedStructureSha256={sha256}
      onStructureVerification={onVerified}
    />
  );
}

function VerifiedMoleculePreview({
  url,
  sha256,
  label,
  language,
  onVerified,
}: {
  url: string;
  sha256: string;
  label: string;
  language: Language;
  onVerified(ready: boolean): void;
}) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [verified, setVerified] = useState<MolecularSourceSnapshot | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(25000),
    ]);
    onVerified(false);
    setFailed(false);
    setVerified(null);
    void readMolecularSource({ url, sha256, record: 0 }, signal)
      .then((value) => {
        signal.throwIfAborted();
        setVerified(value);
        onVerified(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          onVerified(false);
          setFailed(true);
        }
      });
    return () => {
      controller.abort();
      onVerified(false);
    };
  }, [url, sha256, attempt, onVerified]);
  const zh = language === "zh";
  return (
    <>
      {failed && (
        <div className="error-box">
          <p role="alert">
            {zh
              ? "暂时无法核验源文件，请重试。"
              : "The source file could not be verified. Try again."}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {zh ? "重新核验源文件" : "Retry source verification"}
          </button>
        </div>
      )}
      {verified ? (
        <MoleculeImage
          source={{ url, record: 0, sha256 }}
          language={language}
          label={label}
          verifiedSource={verified}
        />
      ) : (
        <div
          className="molecule-image"
          data-drawing-state={failed ? "unavailable" : "loading"}
          aria-busy={!failed}
        >
          {!failed && (
            <p role="status">
              {zh ? "正在读取源文件…" : "Reading source file…"}
            </p>
          )}
        </div>
      )}
    </>
  );
}
