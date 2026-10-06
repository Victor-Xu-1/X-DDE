import { useEffect, useState } from "react";
import { api, request } from "../api";
import type { Asset } from "../operations/types";
import type { Language } from "../types";
import type { Deployment } from "../deployment/client";

export interface PublicLibraryFile {
  id: string;
  supplier: string;
  label: [string, string];
  raw_records: number;
  id_column: string;
  source_page: string;
  scope: string;
  asset: Asset | null;
}

export function PublicLibraryFiles({
  language,
  onChange,
}: {
  language: Language;
  onChange(resource: PublicLibraryFile): void;
}) {
  const zh = language === "zh";
  const [items, setItems] = useState<PublicLibraryFile[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const rows = await request<PublicLibraryFile[]>(
          "/datasets/public-files",
          { signal: controller.signal },
        );
        setItems(rows);
        if (pending && rows.every((item) => item.asset)) setPending(false);
        else if (pending) {
          const status = await request<Deployment>("/deployment", {
            signal: controller.signal,
          });
          const latest = status.operations.find(
            (row) => row.package === "supplier-libraries",
          );
          if (
            latest &&
            ["failed", "paused", "cancelled"].includes(latest.state)
          ) {
            setPending(false);
            setError(
              zh
                ? "公开文件下载未完成，可在安装与组件中继续处理。"
                : "Public-file download is incomplete. Continue in Components.",
            );
          } else timer = setTimeout(() => void refresh(), 3000);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e));
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pending]);
  const chosen = items.find((item) => item.id === selected);
  useEffect(() => {
    if (chosen?.asset) onChange(chosen);
  }, [chosen?.id, chosen?.asset?.id]);
  return (
    <div className="dataset-question-content">
      <label className="field">
        {zh ? "选择供应商结构文件" : "Choose supplier structures"}
        <select
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value);
          }}
        >
          <option value="">
            {zh ? "请选择公开结构库" : "Choose a public structure file"}
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label[zh ? 0 : 1]} · {item.raw_records.toLocaleString()}{" "}
              {zh ? "条源记录" : "source records"}
              {!item.asset ? (zh ? " · 待下载" : " · Download required") : ""}
            </option>
          ))}
        </select>
      </label>
      {chosen && (
        <p className="field-help">
          <a href={chosen.source_page} target="_blank" rel="noreferrer">
            {zh ? "供应商来源 ↗" : "Supplier source ↗"}
          </a>
          {" · "}
          {zh
            ? "分子库准备时检查结构并去重；目录不等于当前库存。"
            : "Preparation checks chemistry and duplicates; a catalogue is not live stock."}
        </p>
      )}
      {items.some((item) => !item.asset) && (
        <button
          type="button"
          className="secondary-button"
          disabled={pending}
          onClick={() => {
            setError("");
            void api
              .post("/deployment/packages/supplier-libraries/install", {})
              .then(() => setPending(true))
              .catch((e) => setError(String(e)));
          }}
        >
          {pending
            ? zh
              ? "正在下载；可在安装与组件中管理"
              : "Downloading; manage in Components"
            : zh
              ? "下载公开结构文件"
              : "Download public structure files"}
        </button>
      )}
      {chosen?.asset && (
        <span className="dataset-status-complete">
          {zh ? "文件已选用" : "File selected"}
        </span>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </div>
  );
}
