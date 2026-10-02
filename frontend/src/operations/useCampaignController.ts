import { useRef, useState } from "react";
import { useExample } from "../examples/context";
import { api } from "../api";
import type { Language } from "../types";
import { campaignConfig, type DesignDraft, type Plan } from "./campaign-model";
export function useCampaignController(language: Language) {
  const example = useExample();
  const zh = language === "zh",
    [draft, setDraft] = useState<DesignDraft>(
      example?.campaign_draft ?? {
        targetName: example ? "HER2 · trastuzumab reference" : "",
        targets: example?.sequences.antigen
          ? { C: example.sequences.antigen }
          : { A: "" },
        format: example ? "VHVL" : "VHH",
        binders:
          example?.sequences.heavy && example.sequences.light
            ? { B: example.sequences.heavy, A: example.sequences.light }
            : { B: "" },
        cdr: {},
        fixed: {},
        budget: "standard",
      },
    ),
    [expert, setExpert] = useState(false),
    [raw, setRaw] = useState<Record<string, unknown> | null>(null),
    [plan, setPlan] = useState<Plan | null>(null),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [external, setExternal] = useState(false),
    [revision, setRevision] = useState(0);
  const keys = useRef({ body: "", id: crypto.randomUUID() });
  const config = raw ?? campaignConfig(draft);
  const [configAsset, setConfigAsset] = useState("");
  async function importConfig() {
    setBusy(true);
    setError("");
    try {
      setRaw(
        await api.post<Record<string, unknown>>("/harness/config/import", {
          asset_id: configAsset,
        }),
      );
      setExpert(true);
      setPlan(null);
      setReviewed(false);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  }
  function change(patch: Partial<DesignDraft>) {
    setDraft({ ...draft, ...patch });
    setPlan(null);
    setReviewed(false);
  }
  async function validate() {
    setError("");
    setBusy(true);
    setReviewed(false);
    const body = JSON.stringify(config);
    if (keys.current.body !== body)
      keys.current = { body, id: crypto.randomUUID() };
    try {
      setPlan(
        await api.post<Plan>("/harness/plans", { config }, keys.current.id),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!plan) return;
    setError("");
    setBusy(true);
    try {
      const next = await api.post<Plan>(
        `/harness/plans/${plan.id}/${plan.state === "validated" ? "start" : "reconcile"}`,
        { digest: plan.digest },
      );
      setPlan(next);
      setRevision((n) => n + 1);
      if (next.task_id) return next;
    } catch (e) {
      setError(String(e));
      setPlan({ ...plan, state: "uncertain" });
      setRevision((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  return {
    zh,
    draft,
    expert,
    setExpert,
    raw,
    setRaw,
    plan,
    setPlan,
    reviewed,
    setReviewed,
    busy,
    error,
    external,
    setExternal,
    revision,
    config,
    configAsset,
    setConfigAsset,
    importConfig,
    change,
    validate,
    start,
  };
}
