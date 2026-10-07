import { useEffect, useState } from "react";
import { request } from "../api";
import type { Language } from "../types";
import { useExample } from "../examples/context";
import { EvidenceForm } from "./EvidenceForm";
import { EvidenceResults } from "./EvidenceResults";
import type { EvidenceDocument } from "./types";
interface Entry {
  id: string;
  name: string;
  observations: number;
  target: string;
  endpoint: string;
  created_at: string;
}
export function EvidenceWorkspace({ language }: { language: Language }) {
  const zh = language === "zh",
    example = useExample();
  const [tab, setTab] = useState<"new" | "history">("new"),
    [rows, setRows] = useState<Entry[]>([]),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState<EvidenceDocument | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (tab !== "history") return;
    const c = new AbortController();
    setError("");
    void request<Entry[]>(`/research/evidence?limit=50&offset=${offset}`, {
      signal: c.signal,
    })
      .then((v) => {
        if (!c.signal.aborted) setRows(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [tab, offset]);
  return (
    <>
      <div
        className="segmented"
        role="group"
        aria-label={zh ? "实验工作区" : "Experimental workspace"}
      >
        <button
          type="button"
          aria-pressed={tab === "new"}
          onClick={() => setTab("new")}
        >
          {zh ? "新任务" : "New task"}
        </button>
        <button
          type="button"
          aria-pressed={tab === "history"}
          onClick={() => setTab("history")}
        >
          {zh ? "历史实验记录" : "Historical evidence"}
        </button>
      </div>
      {tab === "new" ? (
        <EvidenceForm
          key={
            example?.record?.kind === "experimental.evidence"
              ? example.record.value.id
              : "fresh"
          }
          language={language}
        />
      ) : (
        <section aria-label={zh ? "历史实验记录" : "Historical evidence"}>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {selected ? (
            <>
              <button
                className="text-button"
                type="button"
                onClick={() => setSelected(null)}
              >
                {zh ? "返回历史记录" : "Back to historical evidence"}
              </button>
              <EvidenceResults value={selected} language={language} />
            </>
          ) : (
            <>
              <div className="compact-list">
                {rows.map((row) => (
                  <button
                    type="button"
                    className="secondary-button"
                    key={row.id}
                    onClick={() => {
                      setError("");
                      void request<EvidenceDocument>(
                        `/research/evidence/${row.id}`,
                      )
                        .then(setSelected)
                        .catch((e) => setError(String(e)));
                    }}
                  >
                    {row.name} · {row.target} · {row.observations}{" "}
                    {zh ? "条" : "records"}
                  </button>
                ))}
              </div>
              {!rows.length && (
                <p>
                  {zh ? "还没有实验记录。" : "No experimental records yet."}
                </p>
              )}
              <div className="table-pagination">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset((v) => Math.max(0, v - 50))}
                >
                  {zh ? "上一页" : "Previous"}
                </button>
                <button
                  type="button"
                  disabled={rows.length < 50}
                  onClick={() => setOffset((v) => v + 50)}
                >
                  {zh ? "下一页" : "Next"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
