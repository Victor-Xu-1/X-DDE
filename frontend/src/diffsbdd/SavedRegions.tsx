import { useEffect, useRef, useState } from "react";
import { api, request } from "../api";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import { referenceKey } from "./model";
interface SavedRegion {
  id: string;
  body: {
    name: string;
    subject: MoleculeRef;
    identity_job: string;
    regions: { name: string; role: string; atom_indices: number[] }[];
  };
}
export function SavedRegions({
  subject,
  identityJob,
  fixed,
  onFixed,
  onSaved,
  language,
}: {
  subject: MoleculeRef;
  identityJob: string;
  fixed: number[];
  onFixed(v: number[]): void;
  onSaved(id: string | null): void;
  language: Language;
}) {
  const zh = language === "zh",
    [values, setValues] = useState<SavedRegion[]>([]),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const intent = useRef({ body: "", key: crypto.randomUUID() }),
    [selected, setSelected] = useState("");
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      const all: SavedRegion[] = [];
      for (let offset = 0; offset < 10000; offset += 200) {
        const page = await request<SavedRegion[]>(
          `/research/regions?limit=200&offset=${offset}`,
          { signal: c.signal },
        );
        all.push(...page);
        if (page.length < 200) break;
      }
      if (!c.signal.aborted)
        setValues(
          all.filter(
            (v) => referenceKey(v.body.subject) === referenceKey(subject),
          ),
        );
    }
    void load().catch((e) => {
      if (!c.signal.aborted) setError(String(e));
    });
    return () => c.abort();
  }, [referenceKey(subject)]);
  useEffect(() => {
    const value = values.find((v) => v.id === selected);
    const expected = value
      ? [
          ...new Set(
            value.body.regions
              .filter((r) => r.role === "fixed_core")
              .flatMap((r) => r.atom_indices),
          ),
        ].sort((a, b) => a - b)
      : null;
    if (expected && JSON.stringify(expected) !== JSON.stringify(fixed))
      setSelected("");
  }, [JSON.stringify(fixed), selected]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = {
        name: name.trim() || (zh ? "固定核心" : "Fixed core"),
        subject,
        identity_job: identityJob,
        regions: [{ name: "core", role: "fixed_core", atom_indices: fixed }],
      };
      const text = JSON.stringify(body);
      if (text !== intent.current.body)
        intent.current = { body: text, key: crypto.randomUUID() };
      const value = await api.post<SavedRegion>(
        "/research/regions",
        body,
        intent.current.key,
      );
      setValues((old) => [value, ...old.filter((v) => v.id !== value.id)]);
      setSelected(value.id);
      onSaved(value.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <p className="field-help">
        {zh
          ? "保存选区后可在同一分子版本上复用。选区是完整分子的逻辑区域，不会切断分子或修改原始文件。编辑生成新版本后需要重新确认原子身份。"
          : "Saved regions can be reused on this exact molecule version. Regions are logical parts of the full molecule; they do not cut bonds or modify the file. Edits require new atom identity confirmation."}
      </p>
      <label className="field">
        {zh ? "选区名称" : "Selection name"}
        <input
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={busy || !fixed.length}
        onClick={() => void save()}
      >
        {zh ? "保存固定区域" : "Save fixed region"}
      </button>
      <label className="field">
        {zh ? "复用这个版本的固定区域" : "Reuse fixed regions for this version"}
        <select
          value={selected}
          disabled={busy}
          onChange={(e) => {
            const value = values.find((v) => v.id === e.target.value);
            setSelected(value?.id ?? "");
            if (value) {
              onFixed(
                [
                  ...new Set(
                    value.body.regions
                      .filter((r) => r.role === "fixed_core")
                      .flatMap((r) => r.atom_indices),
                  ),
                ].sort((a, b) => a - b),
              );
              onSaved(value.id);
            } else onSaved(null);
          }}
        >
          <option value="">—</option>
          {values
            .filter((v) => v.body.regions.some((r) => r.role === "fixed_core"))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.body.name} · {v.id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
