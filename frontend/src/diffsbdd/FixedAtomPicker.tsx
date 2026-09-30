import { useEffect, useRef, useState } from "react";
import { api, artifactUrl, request } from "../api";
import type { Job, Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { IdentityResult } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import { referenceKey } from "./model";
import { SavedRegions } from "./SavedRegions";

export function FixedAtomPicker({
  initial,
  fixed,
  onChange,
  language,
  onSaved,
}: {
  initial: MoleculeRef;
  fixed: number[];
  onChange(v: number[]): void;
  language: Language;
  onSaved(id: string | null): void;
}) {
  const zh = language === "zh",
    [job, setJob] = useState<Job | null>(null),
    [result, setResult] = useState<IdentityResult | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    attempt = useRef(crypto.randomUUID());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      void request<Job>(`/jobs/${job.id}`, { signal: c.signal })
        .then((current) => {
          if (!c.signal.aborted) setJob(current);
        })
        .catch((e) => {
          if (!c.signal.aborted) setError(String(e));
        });
    }, 1200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [job]);
  useEffect(() => {
    if (job?.status !== "succeeded") return;
    const c = new AbortController();
    void api
      .result(job.id, c.signal)
      .then((data) => {
        const r = data as unknown as IdentityResult;
        if (
          r.mode !== "identity" ||
          r.identity_basis !== "rdkit_removeHs_record_order" ||
          referenceKey(r.reference) !== referenceKey(initial)
        )
          throw new Error(
            "Atom identity does not match the selected input version.",
          );
        if (!c.signal.aborted) setResult(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(String(e));
      });
    return () => c.abort();
  }, [job?.status]);
  const running =
    busy || (!!job && ["queued", "running", "cancelling"].includes(job.status));
  async function inspect() {
    setBusy(true);
    setError("");
    try {
      const created = await api.submit(
        {
          operation: "diffsbdd",
          name: zh ? "读取分子原子身份" : "Inspect molecular atom identities",
          payload: { mode: "identity", molecule: initial },
        },
        attempt.current,
      );
      if (live.current) setJob(created);
    } catch (e) {
      if (live.current) setError(String(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section>
      <p>
        {zh
          ? "先由真实化学解析器读取这个版本，再在预览中点选固定原子。显示序号从 1 开始，提交使用解析器的原子身份。"
          : "Read this version with the real chemical parser, then click fixed atoms. Display numbering starts at 1; submission uses parser identities."}
      </p>
      {!result && (
        <button type="button" disabled={running} onClick={() => void inspect()}>
          {running
            ? zh
              ? "正在读取…"
              : "Reading…"
            : zh
              ? "读取可选原子"
              : "Read selectable atoms"}
        </button>
      )}
      {job && !["queued", "running", "succeeded"].includes(job.status) && (
        <p role="alert">
          {job.status}: {job.error}
        </p>
      )}
      {job && result && (
        <>
          <StructureViewer
            urls={[artifactUrl(job.id, result.molecule_artifact)]}
            language={language}
            onAtomSelected={(s) => {
              const atom = result.atoms.find(
                (a) => a.index === s?.source_atom_index && a.selectable,
              );
              if (atom)
                onChange(
                  fixed.includes(atom.index)
                    ? fixed.filter((n) => n !== atom.index)
                    : [...fixed, atom.index].sort((a, b) => a - b),
                );
            }}
          />
          <div
            className="sequence-picker"
            role="group"
            aria-label={zh ? "固定原子" : "Fixed atoms"}
          >
            {result.atoms
              .filter((a) => a.selectable)
              .map((a) => (
                <button
                  type="button"
                  key={a.index}
                  aria-pressed={fixed.includes(a.index)}
                  title={`${a.element} · ${a.index + 1}`}
                  onClick={() =>
                    onChange(
                      fixed.includes(a.index)
                        ? fixed.filter((n) => n !== a.index)
                        : [...fixed, a.index].sort((a, b) => a - b),
                    )
                  }
                >
                  {a.index + 1} {a.element}
                </button>
              ))}
          </div>
          <p>
            {zh ? "已固定" : "Fixed"}:{" "}
            {fixed.map((n) => n + 1).join(", ") || "—"}
          </p>
          <SavedRegions
            subject={initial}
            identityJob={job.id}
            fixed={fixed}
            onFixed={onChange}
            onSaved={onSaved}
            language={language}
          />
          <button type="button" onClick={() => onChange([])}>
            {zh ? "清空选择" : "Clear selection"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </section>
  );
}
