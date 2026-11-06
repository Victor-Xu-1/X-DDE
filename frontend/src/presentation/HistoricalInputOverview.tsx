import { useEffect, useState } from "react";
import type { Language } from "../types";
import { assetDownloadUrl } from "../research/asset-download";
import { PredictionEntityPreview } from "./PredictionEntityPreview";
import { readArtifactResponse } from "./artifact-file";
import type {
  HistoryEntity,
  HistoryFile,
  HistoryStudy,
} from "./prediction-history-types";

type SourceState = { ready: boolean; name?: string };
const sourceKey = (file: HistoryFile) => JSON.stringify(file.reference);

function HistoricalEntity({
  entity,
  index,
  language,
}: {
  entity: HistoryEntity;
  index: number;
  language: Language;
}) {
  const zh = language === "zh";
  const [attempt, retry] = useState(0);
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const references = [
    ...entity.files,
    ...(entity.molecularFile ? [entity.molecularFile] : []),
  ].filter((file) => file.reference);
  const identity = JSON.stringify(references);
  useEffect(() => {
    const controller = new AbortController();
    setSources({});
    const files = JSON.parse(identity) as HistoryFile[];
    void Promise.all(
      files.map(async (file) => {
        try {
          const signal = AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]);
          const response = await fetch(
            `/api/assets/${encodeURIComponent(file.id!)}/metadata`,
            { signal },
          );
          const { bytes } = await readArtifactResponse(response, signal, {
            maxBytes: 256 * 1024,
          });
          const metadata: unknown = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
          const value = metadata as Record<string, unknown> | null;
          const ready =
            value?.id === file.id && value?.sha256 === file.reference!.sha256;
          return [
            sourceKey(file),
            {
              ready,
              ...(ready &&
              typeof value?.name === "string" &&
              value.name.length <= 256
                ? { name: value.name }
                : {}),
            },
          ] as const;
        } catch {
          return [sourceKey(file), { ready: false }] as const;
        }
      }),
    ).then((items) => {
      if (!controller.signal.aborted) setSources(Object.fromEntries(items));
    });
    return () => controller.abort();
  }, [identity, attempt]);
  const molecular = entity.molecularFile;
  const previewReady =
    molecular?.reference && sources[sourceKey(molecular)]?.ready;
  const component = {
    ...entity.component,
    ligand_file: previewReady ? entity.component.ligand_file : undefined,
  };
  const failed = references.some(
    (file) => sources[sourceKey(file)]?.ready === false,
  );
  function fileLink(file: HistoryFile) {
    const state = file.reference ? sources[sourceKey(file)] : undefined;
    const label = file.label[zh ? 0 : 1];
    if (!file.id) return <span>{label}</span>;
    if (file.reference && !state?.ready)
      return (
        <span>
          {label} ·{" "}
          {state
            ? zh
              ? "文件不可用"
              : "File unavailable"
            : zh
              ? "正在读取…"
              : "Loading…"}
        </span>
      );
    return (
      <a
        download
        href={assetDownloadUrl(
          file.id,
          file === molecular ? file.reference?.record : undefined,
        )}
      >
        {state?.name ?? label}
      </a>
    );
  }
  return (
    <PredictionEntityPreview
      item={component}
      index={index}
      language={language}
      initiallyExpanded
      emptyMessage={
        molecular
          ? molecular.reference
            ? failed
              ? zh
                ? "无法核对原始分子文件。请重试或查看原始输入。"
                : "The original molecular file could not be matched. Retry or inspect the original input."
              : zh
                ? "正在读取原始分子文件…"
                : "Loading the original molecular file…"
            : zh
              ? "此输入未记录分子条目；请下载原始文件查看。"
              : "This input does not record a molecular entry. Download the original file to inspect it."
          : zh
            ? "此值未记录在原始输入中。"
            : "This value is not recorded in the original input."
      }
    >
      <ul className="prediction-preview-files">
        {molecular && !previewReady && <li>{fileLink(molecular)}</li>}
        {entity.files.map((file, i) => (
          <li key={i}>{fileLink(file)}</li>
        ))}
      </ul>
      {failed && (
        <button
          className="secondary-button"
          type="button"
          onClick={() => retry((n) => n + 1)}
        >
          {zh ? "重试读取文件" : "Retry source files"}
        </button>
      )}
    </PredictionEntityPreview>
  );
}

export function HistoricalInputOverview({
  studies,
  language,
}: {
  studies: HistoryStudy[];
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <div className="prediction-history-studies">
      {studies.map((study, i) => (
        <section
          className="prediction-history-study"
          key={i}
          aria-label={`${zh ? "研究输入" : "Study input"} ${i + 1}`}
        >
          {studies.length > 1 && (
            <h3>
              {zh ? "研究输入" : "Study input"} {i + 1}
            </h3>
          )}
          <div className="prediction-history-overview">
            <div className="prediction-preview-entities">
              {study.entities.map((entity, index) => (
                <HistoricalEntity
                  entity={entity}
                  index={index}
                  language={language}
                  key={index}
                />
              ))}
            </div>
            <aside
              className="prediction-history-settings"
              aria-label={zh ? "已记录的设置" : "Recorded settings"}
            >
              <h3>{zh ? "已记录的设置" : "Recorded settings"}</h3>
              {study.settings.length ? (
                <dl>
                  {study.settings.map((entry, index) => (
                    <div key={index}>
                      <dt>{entry.label[zh ? 0 : 1]}</dt>
                      <dd>
                        {typeof entry.value === "boolean"
                          ? entry.value
                            ? zh
                              ? "开启"
                              : "On"
                            : zh
                              ? "关闭"
                              : "Off"
                          : entry.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>
                  {zh
                    ? "此文档未记录计算设置。"
                    : "Calculation settings are not recorded in this document."}
                </p>
              )}
            </aside>
          </div>
        </section>
      ))}
    </div>
  );
}
