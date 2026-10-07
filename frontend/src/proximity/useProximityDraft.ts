import { useCallback, useState } from "react";
import { useExampleTask } from "../examples/context";
import { defaults } from "./generated";
import { partnerRoles, type TernaryPayload } from "./types";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";

export function useProximityDraft(language: Language) {
  const example = useExampleTask("ternary_model");
  const initial = (role: string) =>
    example?.inputs.find((i) => i.role === role)?.source ?? null;
  const [ligand, setLigand] = useState<MoleculeRef | null>(initial("ligand"));
  const [first, setFirst] = useState<MoleculeRef | null>(initial("partner_a"));
  const [second, setSecond] = useState<MoleculeRef | null>(
    initial("partner_b"),
  );
  const [armA, setArmA] = useState<MoleculeRef | null>(initial("arm_a"));
  const [armB, setArmB] = useState<MoleculeRef | null>(initial("arm_b"));
  const [payload, setPayload] = useState<TernaryPayload>(() =>
    example
      ? (example.payload as TernaryPayload)
      : ({
          ...defaults,
          partner_a_name: partnerRoles("protac", language === "zh")[0],
          partner_b_name: partnerRoles("protac", language === "zh")[1],
          partner_a_chain: "",
          partner_b_chain: "",
          arm_a_map: [],
          arm_b_map: [],
          binding_region_a: [],
          binding_region_b: [],
        } as TernaryPayload),
  );
  const [validA, setValidA] = useState(Boolean(example)),
    [validB, setValidB] = useState(Boolean(example));
  const [mappingValidA, setMappingValidA] = useState(true),
    [mappingValidB, setMappingValidB] = useState(true);
  const binary =
    payload.mechanism !== "molecular_glue" &&
    payload.input_mode === "binary_poses";
  const region = payload.mechanism !== "molecular_glue" && !binary;
  const onChainA = useCallback(
    (partner_a_chain: string) => setPayload((p) => ({ ...p, partner_a_chain })),
    [],
  );
  const onChainB = useCallback(
    (partner_b_chain: string) => setPayload((p) => ({ ...p, partner_b_chain })),
    [],
  );
  const onFirst = useCallback((value: MoleculeRef | null) => {
    setFirst(value);
    setValidA(false);
    setMappingValidA(true);
    setPayload((p) => ({
      ...p,
      partner_a_chain: "",
      binding_region_a: [],
      arm_a_map: [],
    }));
  }, []);
  const onSecond = useCallback((value: MoleculeRef | null) => {
    setSecond(value);
    setValidB(false);
    setMappingValidB(true);
    setPayload((p) => ({
      ...p,
      partner_b_chain: "",
      binding_region_b: [],
      arm_b_map: [],
    }));
  }, []);
  const onLigand = useCallback((value: MoleculeRef | null) => {
    setLigand(value);
    setMappingValidA(true);
    setMappingValidB(true);
    setPayload((p) => ({
      ...p,
      binding_region_a: [],
      binding_region_b: [],
      arm_a_map: [],
      arm_b_map: [],
    }));
  }, []);
  const sameChain = Boolean(
    first &&
    second &&
    first.asset_id === second.asset_id &&
    payload.partner_a_chain === payload.partner_b_chain,
  );
  const firstReady = Boolean(
    first &&
    validA &&
    (!binary || (armA && mappingValidA)) &&
    (!region || payload.binding_region_a.length >= 3),
  );
  const secondReady = Boolean(
    second &&
    validB &&
    !sameChain &&
    (!binary || (armB && mappingValidB)) &&
    (!region || payload.binding_region_b.length >= 3),
  );
  const planReady =
    Number.isInteger(payload.attempt_budget) &&
    payload.attempt_budget >= payload.samples &&
    payload.attempt_budget <= Math.min(60, payload.samples * 4) &&
    Number.isInteger(payload.wall_seconds) &&
    payload.wall_seconds >= 60 &&
    payload.wall_seconds <= 1800;
  return {
    ligand,
    onLigand,
    first,
    second,
    armA,
    setArmA,
    armB,
    setArmB,
    payload,
    setPayload,
    binary,
    region,
    sameChain,
    onChainA,
    onChainB,
    onFirst,
    onSecond,
    setValidA,
    setValidB,
    firstReady,
    secondReady,
    planReady,
    setMappingValidA,
    setMappingValidB,
  };
}
export type ProximityDraft = ReturnType<typeof useProximityDraft>;
