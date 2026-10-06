import { useEffect, useState } from "react";
import { useExample } from "../examples/context";
import { ReferencePicker } from "../diffsbdd/ReferencePicker";
import { SearchRegion } from "../docking/SearchRegion";
import { parseBox } from "../docking/model";
import type { MoleculeRef } from "../research/types";
import type { Language } from "../types";
import type { DatasetMaterial, PocketSelection } from "./types";

export function usePocketQuestions(language: Language) {
  const [receptor, setReceptor] = useState<MoleculeRef | null>(null),
    [reference, setReference] = useState<MoleculeRef | null>(null),
    [kind, setKind] = useState<"reference" | "box">("reference"),
    [center, setCenter] = useState<string[]>(["", "", ""]),
    [size, setSize] = useState<string[]>(["20", "20", "20"]),
    [confirmed, setConfirmed] = useState(false);
  const example = useExample();
  useEffect(() => {
    const task = example?.request;
    if (
      !task?.operation ||
      !["drugclip_retrieve", "screening_dock"].includes(task.operation)
    )
      return;
    const payload = (task as import("./types").DatasetTask).payload;
    const search = payload.search as PocketSelection | undefined;
    if (!search) return;
    setReceptor(payload.receptor as MoleculeRef);
    if (search.kind === "reference_ligand") {
      setKind("reference");
      setReference(search.reference);
      setConfirmed(true);
    } else {
      setKind("box");
      setCenter(search.box.center.map(String));
      setSize(search.box.size.map(String));
    }
  }, [example]);
  let pocket: PocketSelection | null = null;
  try {
    if (receptor && kind === "box")
      pocket = {
        kind: "box",
        frame: receptor,
        box: parseBox(center, size, language),
      };
    else if (receptor && reference && confirmed)
      pocket = {
        kind: "reference_ligand",
        frame: receptor,
        reference,
        coordinate_basis: "user_confirmed",
      };
  } catch {
    /* Incomplete questionnaire input remains editable; submission requires a valid exact frame. */
  }
  const inputs: DatasetMaterial[] = receptor
    ? [{ role: "structure", source: receptor }]
    : [];
  if (pocket?.kind === "reference_ligand")
    inputs.push({ role: "ligand", source: pocket.reference });
  return {
    receptor,
    reference,
    kind,
    center,
    size,
    confirmed,
    pocket,
    inputs,
    setReceptor,
    setReference,
    setKind,
    setCenter,
    setSize,
    setConfirmed,
  };
}
export function ReceptorQuestion({
  value,
  language,
}: {
  value: ReturnType<typeof usePocketQuestions>;
  language: Language;
}) {
  return (
    <ReferencePicker
      kind="structure"
      label={language === "zh" ? "选择靶点结构" : "Target structure"}
      language={language}
      value={value.receptor}
      onChange={(ref) => {
        value.setReceptor(ref);
        value.setConfirmed(false);
      }}
      allowedSuffixes={[".pdb"]}
    />
  );
}
export function PocketQuestion({
  value,
  language,
}: {
  value: ReturnType<typeof usePocketQuestions>;
  language: Language;
}) {
  const zh = language === "zh";
  return (
    <>
      <SearchRegion
        receptor={value.receptor}
        language={language}
        kind={value.kind}
        onKind={value.setKind}
        reference={value.reference}
        onReference={(ref) => {
          value.setReference(ref);
          value.setConfirmed(false);
        }}
        center={value.center}
        onCenter={value.setCenter}
        size={value.size}
        onSize={value.setSize}
      />
      {value.kind === "reference" && (
        <label className="dataset-confirm">
          <input
            type="checkbox"
            checked={value.confirmed}
            onChange={(e) => value.setConfirmed(e.target.checked)}
          />
          {zh
            ? "参考配体来自这个靶点结构，位置已经确认"
            : "The reference ligand is confirmed in this target's coordinates"}
        </label>
      )}
    </>
  );
}
