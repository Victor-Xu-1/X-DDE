import { useTaskReadiness } from "../guided/useTaskReadiness";
import { artifactUrl } from "../api";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { StructureViewer } from "../viewer/StructureViewer";
import { useNativeIdentity } from "../regions/useNativeIdentity";
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
  const { ready: inspectionReady, error: inspectionReadinessError } =
    useTaskReadiness("diffsbdd.identity");
  const zh = language === "zh";
  const { job, result, error, running, inspect, refresh } = useNativeIdentity(
    initial,
    language,
  );
  return (
    <section>
      <p>
        {zh
          ? "先由真实化学解析器读取这个版本，再在预览中点选固定原子。显示序号从 1 开始，提交使用解析器的原子身份。"
          : "Read this version with the real chemical parser, then click fixed atoms. Display numbering starts at 1; submission uses parser identities."}
      </p>
      {!result && (
        <button
          type="button"
          disabled={!inspectionReady || running}
          onClick={() => void inspect()}
          title={
            zh
              ? "仅读取这个分子版本的原子身份，供预览选区使用；不生成新分子。"
              : "Read this molecule version's atom identities for preview selection; no molecular generation."
          }
        >
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
          <button
            type="button"
            disabled={running}
            onClick={() => void inspect()}
          >
            {zh ? "重试检查" : "Retry inspection"}
          </button>
        </p>
      )}
      {job && result && (
        <>
          <StructureViewer
            urls={[artifactUrl(job.id, result.molecule_artifact)]}
            language={language}
            selectionMode="atom"
            onAtomSelected={(s) => {
              if (s?.pick_mode === "distance") return;
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
      {(error || inspectionReadinessError) && (
        <p role="alert" className="error-box">
          {error || inspectionReadinessError}
          <button type="button" onClick={refresh}>
            {zh ? "重新读取任务状态" : "Refresh task status"}
          </button>
        </p>
      )}
    </section>
  );
}
