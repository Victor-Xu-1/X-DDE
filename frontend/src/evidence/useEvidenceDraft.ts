import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { Asset } from "../operations/types";
import {
  blankColumns,
  blankConditions,
  type Columns,
  type Endpoint,
  type EvidenceDocument,
  type EvidenceInput,
  type EvidencePreview,
} from "./types";
export function useEvidenceDraft(language: Language, initial?: EvidenceInput) {
  const zh = language === "zh";
  const [file, setFile] = useState(initial?.source.asset_id ?? ""),
    [asset, setAsset] = useState<Asset | null>(null),
    [names, setNames] = useState<string[]>([]);
  const [delimiter, setDelimiter] = useState<EvidenceInput["delimiter"]>(
    initial?.delimiter ?? ",",
  );
  const [columns, setColumns] = useState<Columns>(
    initial?.columns ?? { ...blankColumns },
  );
  const [conditions, setConditions] = useState(
      initial?.conditions ?? { ...blankConditions },
    ),
    [endpoint, setEndpoint] = useState<Endpoint | "">(initial?.endpoint ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "nM"),
    [citation, setCitation] = useState(initial?.citation ?? "");
  const [name, setName] = useState(
    initial?.name ?? (zh ? "实验测量记录" : "Experimental observations"),
  );
  const [links, setLinks] = useState<EvidenceInput["compound_links"]>(
    initial?.compound_links ?? {},
  );
  const [uncertainty, setUncertainty] = useState<"sd" | "sem">(
    initial?.uncertainty_kind ?? "sd",
  );
  const [preview, setPreview] = useState<EvidencePreview | null>(null),
    [previewKey, setPreviewKey] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const intent = useRef({ body: "", key: crypto.randomUUID() }),
    pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setAsset(null);
    setNames([]);
    setPreview(null);
    setPreviewKey("");
    setError("");
    setLoading(false);
    if (!file) return () => controller.abort();
    setLoading(true);
    void request<{ asset: Asset; columns: string[] }>(
      `/research/evidence/inputs/${file}?delimiter=${encodeURIComponent(delimiter)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setAsset(data.asset);
          setNames(data.columns);
          setColumns((previous) => {
            const next = { ...previous };
            for (const key of Object.keys(next) as (keyof Columns)[]) {
              if (next[key] && !data.columns.includes(next[key]))
                next[key] = "";
            }
            return next;
          });
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [file, delimiter]);
  const input: EvidenceInput | null =
    asset && endpoint
      ? {
          name,
          source: {
            asset_id: asset.id,
            sha256: asset.sha256,
            record: 0,
            conformer: 0,
            version_id: null,
          },
          conditions,
          endpoint,
          unit,
          columns,
          delimiter,
          uncertainty_kind: uncertainty,
          citation,
          reported_by: "",
          compound_links: links,
          parent_id: null,
        }
      : null;
  const body = input ? JSON.stringify(input) : "",
    inspectionKey = input
      ? JSON.stringify({ ...input, name: "Experimental preview" })
      : "";
  const valid = Boolean(
    input &&
    name.trim() &&
    citation.trim() &&
    conditions.target.trim() &&
    conditions.assay.trim() &&
    columns.compound &&
    columns.value,
  );
  async function inspect() {
    if (!input || !valid) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const value = await api.authorized<EvidencePreview>(
        "/research/evidence/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        },
      );
      if (!controller.signal.aborted) {
        setPreview(value);
        setPreviewKey(inspectionKey);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(String(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const checked = Boolean(preview && previewKey === inspectionKey);
  async function save(): Promise<EvidenceDocument | undefined> {
    if (!input || !checked) return;
    setBusy(true);
    setError("");
    if (intent.current.body !== body)
      intent.current = { body, key: crypto.randomUUID() };
    try {
      return await api.post<EvidenceDocument>(
        "/research/evidence",
        input,
        intent.current.key,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function changeFile(id: string) {
    setFile(id);
    setLinks({});
    setColumns({ ...blankColumns });
  }
  return {
    zh,
    language,
    file,
    changeFile,
    asset,
    names,
    delimiter,
    setDelimiter,
    columns,
    setColumns,
    conditions,
    setConditions,
    endpoint,
    setEndpoint,
    unit,
    setUnit,
    citation,
    setCitation,
    name,
    setName,
    links,
    setLinks,
    uncertainty,
    setUncertainty,
    preview,
    busy,
    error,
    loading,
    valid,
    checked,
    inspect,
    save,
  };
}
export type EvidenceDraft = ReturnType<typeof useEvidenceDraft>;
