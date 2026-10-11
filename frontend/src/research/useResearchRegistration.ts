import { useRef } from "react";
import { api } from "../api";
import type { ObjectKind, ScientificObject } from "./types";

export function useResearchRegistration({
  notes,
  rating,
  selectionIntent,
  load,
  selectSaved,
}: {
  notes: string;
  rating: number;
  selectionIntent(): number;
  load(): Promise<void>;
  selectSaved(id: string, intent: number): void;
}) {
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  return async function register(
    assetId: string,
    kind: ObjectKind,
    name: string,
    parent?: ScientificObject,
  ) {
    const intent = selectionIntent();
    const body = {
      asset_id: assetId,
      kind,
      label: name,
      record: parent?.reference.record ?? 0,
      conformer: parent?.reference.conformer ?? 0,
      parent_id: parent?.id ?? null,
      relation: parent ? "edited_from" : "derived_from",
      notes: parent ? notes : "",
      rating: parent ? rating : 0,
    };
    const fingerprint = JSON.stringify(body);
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const value = await api.post<ScientificObject>(
      "/research/objects",
      body,
      pending.current.key,
    );
    if (
      !value ||
      !value.id ||
      value.reference?.version_id !== value.id ||
      value.reference.asset_id !== assetId ||
      value.kind !== kind ||
      value.label !== name ||
      value.parent_id !== body.parent_id ||
      value.reference.record !== body.record ||
      value.reference.conformer !== body.conformer ||
      value.notes !== body.notes ||
      value.rating !== body.rating ||
      (parent && value.reference.sha256 !== parent.reference.sha256)
    )
      throw new Error(
        "The saved version does not match the confirmed material. Choose the original material again.",
      );
    await load();
    selectSaved("object:" + value.id, intent);
    return value;
  };
}
