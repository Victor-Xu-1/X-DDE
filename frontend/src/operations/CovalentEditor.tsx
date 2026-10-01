import { useTaskReadiness } from "../guided/useTaskReadiness";
import { useEffect, useRef, useState } from "react";
import { api, artifactUrl, request } from "../api";
import type { Component, Job, Language, Parameters } from "../types";
import { terminal } from "../types";
import type { BondAtom, CovalentBond, OperationResult } from "./types";
import { StructureViewer } from "../viewer/StructureViewer";
import type { SelectionInfo } from "../viewer/protocol";

type Atom = NonNullable<OperationResult["atoms"]>[number];
const clean = (a: Atom): BondAtom => ({
  entity: a.entity,
  copy_index: a.copy_index,
  position: a.position,
  atom: a.atom,
});
const label = (a: Atom) => `${a.chain}:${a.residue}${a.position} · ${a.atom}`;
export function CovalentEditor({
  components,
  parameters,
  value,
  onChange,
  language,
}: {
  components: Component[];
  parameters: Parameters;
  value: CovalentBond[];
  onChange(b: CovalentBond[]): void;
  language: Language;
}) {
  const { ready: inspectionReady, error: inspectionReadinessError } =
    useTaskReadiness("native.inspect");
  const zh = language === "zh",
    [job, setJob] = useState<Job | null>(null),
    [atoms, setAtoms] = useState<Atom[]>([]),
    [readyKey, setReadyKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [side, setSide] = useState<"left" | "right">("left"),
    [left, setLeft] = useState(-1),
    [right, setRight] = useState(-1),
    [query, setQuery] = useState("");
  const [pollRevision, setPollRevision] = useState(0);
  const key = JSON.stringify(components),
    live = useRef(true),
    submission = useRef({ body: "", key: crypto.randomUUID() });
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!job || (terminal(job.status) && job.status !== "succeeded")) return;
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<Job>(`/jobs/${job.id}`, {
          signal: c.signal,
        });
        if (!c.signal.aborted) {
          if (next.status === "succeeded") {
            const data = await api.result(next.id, c.signal);
            if (!c.signal.aborted) {
              setAtoms(data.atoms ?? []);
              setJob(next);
            }
          } else if (terminal(next.status)) {
            setJob(next);
            setError(next.error ?? next.status);
          } else {
            setJob(next);
            timer = setTimeout(poll, 2000);
          }
        }
      } catch (e) {
        if (!c.signal.aborted) setError(String(e));
      }
    };
    timer = setTimeout(poll, 1000);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [job?.id, pollRevision]);
  const usable = readyKey === key && job?.status === "succeeded";
  async function prepare() {
    setBusy(true);
    setError("");
    setAtoms([]);
    setLeft(-1);
    setRight(-1);
    const body = JSON.stringify({ components, parameters, language });
    if (submission.current.body !== body || (job && terminal(job.status)))
      submission.current = { body, key: crypto.randomUUID() };
    try {
      const next = await api.submit(
        {
          operation: "inspect",
          name: zh ? "输入原子检查" : "Input atom inspection",
          components,
          parameters: {
            ...parameters,
            feature_mode: "none",
            use_template: false,
            use_rna_msa: false,
            tfg: false,
            allow_network: false,
          },
          covalent_bonds: [],
        },
        submission.current.key,
      );
      if (live.current) {
        setJob(next);
        setReadyKey(key);
        if (next.status === "succeeded")
          setAtoms((await api.result(next.id)).atoms ?? []);
      }
      return next;
    } catch (e) {
      if (live.current) setError(String(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  function pick(selection: SelectionInfo | null) {
    if (!selection || !usable) return;
    const index = atoms.findIndex(
      (a) =>
        a.chain === selection.chain &&
        `${a.residue}${a.position}` === selection.residue &&
        a.atom === selection.atom,
    );
    if (index >= 0) (side === "left" ? setLeft : setRight)(index);
  }
  return (
    <details className="covalent-editor">
      <summary>
        {zh
          ? "共价连接 · 从真实原子中选择"
          : "Covalent bonds · select actual atoms"}
      </summary>
      <p className="small">
        {zh
          ? "先检查输入，再在预览中点选两个原子，或搜索下拉列表。该预览用于编辑输入拓扑，不是结合姿势预测。"
          : "Inspect inputs, then pick two atoms in the preview or search the list. This preview edits input topology; it is not a predicted binding pose."}
      </p>
      <button
        type="button"
        disabled={
          !inspectionReady || busy || Boolean(job && !terminal(job.status))
        }
        onClick={() => void prepare()}
        title={
          zh
            ? "仅解析输入拓扑并准备预览；结构预测仍需在最后一步递交。"
            : "Parse input topology and prepare a preview only; structure prediction is submitted at the final step."
        }
      >
        {busy || Boolean(job && !terminal(job.status))
          ? zh
            ? "正在准备原子列表…"
            : "Preparing atoms…"
          : zh
            ? "检查输入并打开选择器"
            : "Inspect inputs and open selector"}
      </button>
      {inspectionReadinessError && (
        <p role="alert">{inspectionReadinessError}</p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
          {job && !terminal(job.status) && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setPollRevision((n) => n + 1);
              }}
            >
              {zh ? "重新读取检查结果" : "Retry reading inspection"}
            </button>
          )}
        </p>
      )}
      {usable && job && (
        <>
          <div className="segmented">
            {(["left", "right"] as const).map((s) => (
              <button
                type="button"
                key={s}
                aria-pressed={side === s}
                onClick={() => setSide(s)}
              >
                {s === "left"
                  ? zh
                    ? "选择第一个原子"
                    : "Select first atom"
                  : zh
                    ? "选择第二个原子"
                    : "Select second atom"}
              </button>
            ))}
          </div>
          <StructureViewer
            urls={[artifactUrl(job.id, "input-preview.cif")]}
            language={language}
            onAtomSelected={pick}
          />
          <label className="field">
            {zh ? "搜索链、残基或原子" : "Search chain, residue or atom"}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {([left, right] as const).map((v, sideIndex) => (
            <label className="field" key={sideIndex}>
              {zh ? `原子 ${sideIndex + 1}` : `Atom ${sideIndex + 1}`}
              <select
                value={v}
                onChange={(e) =>
                  (sideIndex === 0 ? setLeft : setRight)(Number(e.target.value))
                }
              >
                <option value={-1}>{zh ? "请选择" : "Choose"}</option>
                {v >= 0 && atoms[v] && (
                  <option value={v}>{label(atoms[v])}</option>
                )}
                {atoms
                  .map((a, i) => ({ a, i }))
                  .filter(
                    ({ a, i }) =>
                      i !== v &&
                      label(a).toLowerCase().includes(query.toLowerCase()),
                  )
                  .slice(0, 300)
                  .map(({ a, i }) => (
                    <option key={i} value={i}>
                      {label(a)}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <button
            type="button"
            disabled={left < 0 || right < 0 || left === right}
            onClick={() => {
              onChange([
                ...value,
                { left: clean(atoms[left]), right: clean(atoms[right]) },
              ]);
              setLeft(-1);
              setRight(-1);
            }}
          >
            {zh ? "添加共价连接" : "Add covalent bond"}
          </button>
        </>
      )}
      {value.map((bond, i) => (
        <div className="bond-row" key={i}>
          <span>{`${bond.left.entity}:${bond.left.copy_index}:${bond.left.position}:${bond.left.atom} ↔ ${bond.right.entity}:${bond.right.copy_index}:${bond.right.position}:${bond.right.atom}`}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            {zh ? "删除" : "Remove"}
          </button>
        </div>
      ))}
    </details>
  );
}
