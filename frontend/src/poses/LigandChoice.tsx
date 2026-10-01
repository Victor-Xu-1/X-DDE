import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import type { StateSet } from "../chemistry/types";
import type { MoleculeRef, ScientificObject } from "../research/types";
import type { Language } from "../types";
import type { LigandSelection } from "./types";
export function LigandChoice({
  value,
  onChange,
  states,
  language,
  index,
}: {
  value: LigandSelection | null;
  onChange(v: LigandSelection | null): void;
  states: StateSet[];
  language: Language;
  index: number;
}) {
  const zh = language === "zh";
  const [mode, setMode] = useState("version"),
    [collection, setCollection] = useState(""),
    [member, setMember] = useState(0),
    [conformer, setConformer] = useState(-1),
    [pending, setPending] = useState<MoleculeRef | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      selection.current++;
    },
    [],
  );
  const intent = useRef({ body: "", key: crypto.randomUUID() }),
    selection = useRef(0);
  const state = states.find((s) => s.id === collection);
  function chooseState(id: string, mi: number, ci: number) {
    setCollection(id);
    setMember(mi);
    setConformer(ci);
    setError("");
    const s = states.find((s) => s.id === id),
      m = s?.members[mi],
      c = m?.conformers[ci];
    if (!s || !m) {
      onChange(null);
      return;
    }
    onChange({
      reference: c?.reference ?? m.reference,
      state_set_id: s.id,
      state_index: mi,
      conformer_index: c ? ci : null,
    });
  }
  async function register() {
    if (!pending || busy) return;
    const ticket = selection.current;
    const body = {
      asset_id: pending.asset_id,
      kind: "molecule",
      label: zh ? "姿势探索分子" : "Pose exploration ligand",
      record: pending.record,
      conformer: pending.conformer,
    };
    const encoded = JSON.stringify(body);
    if (intent.current.body !== encoded)
      intent.current = { body: encoded, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const saved = await api.post<ScientificObject>(
        "/research/objects",
        body,
        intent.current.key,
      );
      if (ticket === selection.current) {
        setPending(null);
        onChange({
          reference: saved.reference,
          state_set_id: null,
          state_index: null,
          conformer_index: null,
        });
      }
    } catch (e) {
      if (ticket === selection.current) setError(String(e));
    } finally {
      if (ticket === selection.current) setBusy(false);
    }
  }
  return (
    <section
      className="receptor-input"
      aria-label={(zh ? "探索分子 " : "Exploration ligand ") + (index + 1)}
    >
      <label className="field">
        {zh ? "分子来源" : "Ligand source"}
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => {
            selection.current++;
            setMode(e.target.value);
            setPending(null);
            setError("");
            onChange(null);
          }}
        >
          <option value="version">
            {zh ? "已保存分子或上传 SDF" : "Saved molecule or uploaded SDF"}
          </option>
          <option value="states">
            {zh
              ? "准备后的化学状态与构象"
              : "Prepared chemical state and conformer"}
          </option>
        </select>
      </label>
      {mode === "version" ? (
        <>
          <ReferencePicker
            kind="ligand"
            allowedSuffixes={[".sdf"]}
            value={pending ?? value?.reference ?? null}
            language={language}
            label={zh ? "选择探索分子" : "Choose exploration ligand"}
            onChange={(r) => {
              selection.current++;
              setBusy(false);
              setError("");
              setPending(r && !r.version_id ? r : null);
              onChange(
                r?.version_id
                  ? {
                      reference: r,
                      state_set_id: null,
                      state_index: null,
                      conformer_index: null,
                    }
                  : null,
              );
            }}
          />
          {pending && (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => void register()}
            >
              {busy
                ? zh
                  ? "保存中…"
                  : "Saving…"
                : zh
                  ? "保存此分子的研究版本"
                  : "Save this molecular version"}
            </button>
          )}
        </>
      ) : (
        <>
          <label className="field">
            {zh ? "分子状态集合" : "Molecular state set"}
            <select
              value={collection}
              onChange={(e) =>
                chooseState(
                  e.target.value,
                  0,
                  states.find((s) => s.id === e.target.value)?.members[0]
                    ?.conformers.length
                    ? 0
                    : -1,
                )
              }
            >
              <option value="">
                {zh ? "选择已有准备结果" : "Choose a preparation result"}
              </option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)} · {s.members.length}{" "}
                  {zh ? "种状态" : "states"}
                </option>
              ))}
            </select>
          </label>
          {state && (
            <>
              <label className="field">
                {zh ? "化学状态" : "Chemical state"}
                <select
                  value={member}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    chooseState(
                      collection,
                      m,
                      state.members[m].conformers.length ? 0 : -1,
                    );
                  }}
                >
                  {state.members.map((m, i) => (
                    <option key={i} value={i}>
                      {zh ? "状态 " : "State "}
                      {i + 1} · {m.evidence.formula} · {zh ? "电荷" : "charge"}{" "}
                      {m.evidence.charge}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {zh ? "初始构象" : "Starting conformer"}
                <select
                  value={conformer}
                  onChange={(e) =>
                    chooseState(collection, member, Number(e.target.value))
                  }
                >
                  <option value={-1}>
                    {zh
                      ? "状态本身（运行时检查几何）"
                      : "State itself (geometry checked at runtime)"}
                  </option>
                  {state.members[member].conformers.map((_, i) => (
                    <option key={i} value={i}>
                      {zh ? "已准备构象 " : "Prepared conformer "}
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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
