import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import { AssetPicker } from "../operations/AssetPicker";
import type { Asset } from "../operations/types";
import { HistoricalFileSelect } from "./HistoricalFileSelect";
import { ChoiceCards } from "../guided/ChoiceCards";
import type { Language } from "../types";
import type { MoleculeRef, ScientificObject } from "./types";

export function SequencePicker({
  language,
  value,
  onChange,
  label,
  filename = "sequence-input.fasta",
}: {
  language: Language;
  value: MoleculeRef | null;
  onChange(value: MoleculeRef | null): void;
  label: string;
  filename?: string;
}) {
  const zh = language === "zh",
    intent = useRef(0),
    change = useRef(onChange);
  change.current = onChange;
  const [source, setSource] = useState<"saved" | "file" | "paste">(
      value?.version_id ? "saved" : value ? "file" : "paste",
    ),
    [versions, setVersions] = useState<ScientificObject[]>([]),
    [files, setFiles] = useState<Asset[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (source !== "saved") return;
    const controller = new AbortController();
    async function load() {
      const records: ScientificObject[] = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await request<ScientificObject[]>(
          `/research/objects?limit=200&offset=${offset}`,
          { signal: controller.signal },
        );
        records.push(...page.filter((row) => row.kind === "sequence"));
        if (page.length < 200) break;
      }
      const uploaded = await api.assets(controller.signal);
      if (!controller.signal.aborted) {
        setVersions(records);
        setFiles(
          uploaded.filter(
            (v) =>
              v.kind === "sequences" && [".fa", ".fasta"].includes(v.suffix),
          ),
        );
      }
    }
    void load().catch((e) => {
      if (!controller.signal.aborted) setError(String(e));
    });
    return () => {
      controller.abort();
      intent.current++;
    };
  }, [source]);
  async function choose(id: string, ref?: MoleculeRef) {
    const number = ++intent.current;
    setError("");
    change.current(null);
    if (!id) {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const asset = await request<Asset>(`/assets/${id}/metadata`);
      if (number !== intent.current) return;
      if (
        asset.kind !== "sequences" ||
        ![".fa", ".fasta"].includes(asset.suffix) ||
        asset.size > 2 * 1024 ** 2
      )
        throw new Error(
          zh
            ? "请选择不超过2 MiB的 FASTA 序列。"
            : "Choose a FASTA collection no larger than2MiB.",
        );
      change.current(
        ref ?? {
          asset_id: asset.id,
          sha256: asset.sha256,
          record: 0,
          conformer: 0,
          version_id: null,
        },
      );
    } catch (e) {
      if (number === intent.current) setError(String(e));
    } finally {
      if (number === intent.current) setBusy(false);
    }
  }
  async function save() {
    if (busy || !text.trim()) return;
    const number = ++intent.current;
    setBusy(true);
    setError("");
    try {
      const raw = text.trim().startsWith(">")
        ? text.trim() + "\n"
        : ">sequence\n" + text.trim() + "\n";
      const file = new File([raw], filename, { type: "text/plain" });
      if (file.size > 2 * 1024 ** 2)
        throw new Error(
          zh ? "序列输入超过2 MiB。" : "Sequence input exceeds2MiB.",
        );
      const asset = await api.upload(file, "sequences");
      const saved = await api.post<ScientificObject>("/research/objects", {
        asset_id: asset.id,
        kind: "sequence",
        label: filename,
      });
      if (number === intent.current) {
        setVersions((v) => [saved, ...v.filter((row) => row.id !== saved.id)]);
        change.current(saved.reference);
      }
    } catch (e) {
      if (number === intent.current) setError(String(e));
    } finally {
      if (number === intent.current) setBusy(false);
    }
  }
  return (
    <section className="diff-reference">
      <h3 className="input-purpose">{label}</h3>
      <ChoiceCards<"saved" | "file" | "paste">
        label={label}
        value={source}
        onChange={(mode) => {
          intent.current++;
          setBusy(false);
          setSource(mode);
          setError("");
          setText("");
          onChange(null);
        }}
        options={[
          { value: "paste", title: zh ? "粘贴序列" : "Paste sequences" },
          {
            value: "saved",
            title: zh ? "历史文件" : "Historical files",
          },
          {
            value: "file",
            title: zh ? "上传 FASTA 文件" : "Upload FASTA file",
          },
        ]}
      />
      {source === "paste" && (
        <>
          <label className="field">
            {zh ? "序列或 FASTA" : "Sequence or FASTA"}
            <textarea
              rows={6}
              value={text}
              maxLength={2 * 1024 ** 2}
              disabled={busy}
              onChange={(e) => {
                setText(e.target.value);
                onChange(null);
              }}
              placeholder={
                zh
                  ? "粘贴一条序列；多条序列使用不同的 FASTA 标题。"
                  : "Paste one sequence; use distinct FASTA headers for multiple sequences."
              }
            />
          </label>
          <button
            type="button"
            disabled={busy || !text.trim() || Boolean(value)}
            onClick={() => void save()}
          >
            {busy
              ? zh
                ? "正在保存…"
                : "Saving…"
              : zh
                ? "确认序列"
                : "Confirm sequences"}
          </button>
          {value && (
            <p role="status">
              {zh
                ? "序列已保存，可进入下一步。"
                : "Sequence saved; continue to the next step."}
            </p>
          )}
        </>
      )}
      {source === "saved" && (
        <HistoricalFileSelect
          language={language}
          label={label}
          value={value}
          versions={versions}
          files={files}
          busy={busy}
          onSelect={(id, ref) => void choose(id, ref)}
        />
      )}
      {source === "file" && (
        <AssetPicker
          showHistory={false}
          language={language}
          label={label}
          kind="sequences"
          allowedSuffixes={[".fa", ".fasta"]}
          value={value?.asset_id ?? ""}
          onChange={(id) => void choose(id)}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
