import { GuidedSteps } from "../guided/Questionnaire";
import { useExampleReference } from "../examples/context";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, request } from "../api";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { referenceKey } from "../diffsbdd/model";
import { useNativeIdentity } from "./useNativeIdentity";
import { savedRegions } from "./records";
import {
  toggleAtom,
  validateRegions,
  type Region,
  type SavedRegion,
} from "./model";
import { RegionDrafts } from "./RegionDrafts";
import { AtomSelection } from "./AtomSelection";

export function RegionWorkspace({ language }: { language: Language }) {
  const example = useExampleReference("mz1_molecule", "jq1");
  const [subject, setSubject] = useState<MoleculeRef | null>(example),
    zh = language === "zh";
  return (
    <RegionEditor
      key={subject ? referenceKey(subject) : "empty"}
      subject={subject}
      language={language}
      inputs={
        <ReferencePicker
          kind="ligand"
          value={subject}
          onChange={setSubject}
          language={language}
          label={zh ? "选择完整分子版本" : "Select the full molecule version"}
        />
      }
    />
  );
}

export function RegionEditor({
  subject,
  language,
  inputs,
}: {
  inputs?: ReactNode;
  subject: MoleculeRef | null;
  language: Language;
}) {
  const zh = language === "zh",
    identity = useNativeIdentity(subject, language);
  const [regions, setRegions] = useState<Region[]>([
    {
      name: zh ? "固定核心" : "Fixed core",
      role: "fixed_core",
      atom_indices: [],
    },
  ]);
  const [active, setActive] = useState(0),
    [name, setName] = useState(""),
    [values, setValues] = useState<SavedRegion[]>([]);
  const [parent, setParent] = useState<string | null>(null),
    [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false),
    [reload, setReload] = useState(0);
  const intent = useRef({ body: "", key: crypto.randomUUID() }),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void Promise.all([
      subject ? savedRegions(subject, controller.signal) : Promise.resolve([]),
      request<{ availability: { configuration_present: boolean } }>(
        "/capabilities/diffsbdd.identity",
        { signal: controller.signal },
      ),
    ])
      .then(([records, capability]) => {
        if (!controller.signal.aborted) {
          setValues(records);
          setReady(capability.availability.configuration_present);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  function change(next: Region[]) {
    setRegions(next);
    setSaved(null);
  }
  async function save() {
    if (!subject || !identity.result || !identity.job) return;
    setError("");
    setBusy(true);
    try {
      const selections = validateRegions(
        regions,
        identity.result.atoms
          .filter((atom) => atom.selectable)
          .map((atom) => atom.index),
      );
      const body = {
        name: name.trim() || (zh ? "分子区域" : "Molecular regions"),
        subject,
        identity_job: identity.job.id,
        parent_id: parent,
        regions: selections,
      };
      const serialized = JSON.stringify(body);
      if (intent.current.body !== serialized)
        intent.current = { body: serialized, key: crypto.randomUUID() };
      const value = await api.post<SavedRegion>(
        "/research/regions",
        body,
        intent.current.key,
      );
      if (mounted.current) {
        setSaved(value.id);
        setValues((old) => [
          value,
          ...old.filter((item) => item.id !== value.id),
        ]);
      }
      return value;
    } catch (failure) {
      if (mounted.current) setError(String(failure));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const reuse = (
    <>
      {inputs}
      <label className="field">
        {zh
          ? "复用已有区域（同一分子版本）"
          : "Reuse saved regions (this molecule version)"}
        <select
          value={parent ?? ""}
          disabled={loading || busy}
          onChange={(event) => {
            const value = values.find((item) => item.id === event.target.value);
            if (value) {
              setRegions(structuredClone(value.body.regions));
              setName(value.body.name);
              setParent(value.id);
              setSaved(null);
              setActive(0);
            } else {
              setParent(null);
              setSaved(null);
            }
          }}
        >
          <option value="">
            {zh ? "新区域定义" : "New region definition"}
          </option>
          {values.map((value) => (
            <option key={value.id} value={value.id}>
              {value.body.name} · {value.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {loading && (
        <p role="status">
          {zh ? "正在读取版本和区域…" : "Loading versions and regions…"}
        </p>
      )}
      {!loading && !ready && (
        <p className="field-help">
          {zh
            ? "在集成环境管理中配置 DiffSBDD 化学解析环境后，可读取原子身份。"
            : "Configure the DiffSBDD chemical parsing environment in component management to read atom identities."}
        </p>
      )}
    </>
  );
  const selection = (
    <>
      {identity.result && identity.job ? (
        <>
          <RegionDrafts
            values={regions}
            active={active}
            onActive={setActive}
            onChange={change}
            language={language}
          />
          <AtomSelection
            job={identity.job.id}
            identity={identity.result}
            selected={regions[active].atom_indices}
            onAtom={(atom) => {
              if (!busy) change(toggleAtom(regions, active, atom));
            }}
            language={language}
          />
        </>
      ) : (
        <p role="status">
          {zh
            ? "请先完成原子身份检查。"
            : "Complete atom identity inspection first."}
        </p>
      )}
      {subject && !identity.result && (
        <button
          type="button"
          disabled={!ready || identity.running || loading}
          title={
            zh
              ? "读取实际原子身份后，可在预览中点击选区；保持原始分子完整。"
              : "Read actual atom identities, then select regions in the preview; retain the intact original molecule."
          }
          onClick={() => void identity.inspect()}
        >
          {identity.running
            ? zh
              ? "正在读取…"
              : "Reading…"
            : zh
              ? "读取可选原子"
              : "Read selectable atoms"}
        </button>
      )}
    </>
  );
  const settings = (
    <label className="field">
      {zh ? "区域集名称" : "Region set name"}
      <input
        value={name}
        maxLength={120}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(null);
        }}
      />
    </label>
  );
  let complete = false;
  try {
    if (identity.result) {
      validateRegions(
        regions,
        identity.result.atoms.filter((a) => a.selectable).map((a) => a.index),
      );
      complete = true;
    }
  } catch {
    complete = false;
  }
  return (
    <GuidedSteps<SavedRegion>
      language={language}
      busy={busy || loading || identity.running}
      error={error || identity.error || identity.job?.error || ""}
      ready={ready && complete}
      submitLabel={zh ? "保存区域版本" : "Save region version"}
      onSubmit={save}
      steps={[
        {
          title: zh ? "选择材料" : "Choose inputs",
          valid: !loading && Boolean(subject),
          content: reuse,
        },
        {
          title: zh ? "选择区域" : "Choose regions",
          valid: complete,
          content: selection,
        },
        {
          title: zh ? "命名版本" : "Name version",
          valid: true,
          content: settings,
        },
        {
          title: zh ? "确认保存" : "Review & save",
          valid: complete,
          content: (
            <dl className="questionnaire-review">
              <dt>{zh ? "区域" : "Regions"}</dt>
              <dd>{regions.map((v) => v.name).join(", ")}</dd>
              <dt>{zh ? "原子" : "Atoms"}</dt>
              <dd>{regions.reduce((n, v) => n + v.atom_indices.length, 0)}</dd>
            </dl>
          ),
        },
      ]}
      renderResult={() => (
        <>
          {saved && (
            <p role="status">
              {zh
                ? "已保存，可在局部重设计的固定区域中复用"
                : "Saved; fixed cores can be reused in inpainting"}{" "}
              · {saved.slice(0, 8)}
            </p>
          )}
          {(error || identity.error || identity.job?.error) && (
            <p role="alert" className="error-box">
              {error || identity.error || identity.job?.error}
              <button
                type="button"
                onClick={() => {
                  setReload((value) => value + 1);
                  identity.refresh();
                }}
              >
                {zh ? "重新读取状态" : "Refresh status"}
              </button>
            </p>
          )}
        </>
      )}
    />
  );
}
