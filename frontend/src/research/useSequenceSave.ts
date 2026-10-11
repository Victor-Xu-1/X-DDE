import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Asset } from "../operations/types";
import type { MoleculeRef, ScientificObject } from "./types";
import { acceptedAsset } from "../operations/asset-acceptance";

interface SaveIntent {
  raw: string;
  filename: string;
  key: string;
  asset?: Asset;
  version?: ScientificObject;
}
/** Explicit saves retain their upload and version request across an uncertain response. */
export function useSequenceSave(onConfirmed: (reference: MoleculeRef) => void) {
  const current = useRef<SaveIntent | null>(null),
    mounted = useRef(true),
    generation = useRef(0),
    pending = useRef(false);
  const callback = useRef(onConfirmed);
  callback.current = onConfirmed;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<"" | "size" | "unavailable" | "identity">("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  function detach() {
    generation.current++;
    setError("");
  }
  async function save(text: string, filename: string) {
    if (pending.current || !text.trim()) return;
    const raw = text.trim().startsWith(">")
      ? text.trim() + "\n"
      : ">sequence\n" + text.trim() + "\n";
    const file = new File([raw], filename, { type: "text/plain" });
    if (file.size > 2 * 1024 ** 2) {
      setError("size");
      return;
    }
    let intent = current.current;
    if (!intent || intent.raw !== raw || intent.filename !== filename) {
      intent = { raw, filename, key: crypto.randomUUID() };
      current.current = intent;
    }
    const token = generation.current;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (!intent.asset) {
        const asset = await api.upload(file, "sequences");
        if (
          !acceptedAsset(
            asset,
            asset.id,
            "sequences",
            [".fa", ".fasta"],
            2 * 1024 ** 2,
          )
        )
          throw new Error("identity");
        intent.asset = asset;
      }
      if (!mounted.current || token !== generation.current) return;
      if (!intent.version) {
        intent.version = await api.post<ScientificObject>(
          "/research/objects",
          {
            asset_id: intent.asset.id,
            kind: "sequence",
            label: filename,
          },
          intent.key,
        );
      }
      const ref = intent.version.reference;
      if (
        intent.version.kind !== "sequence" ||
        ref.asset_id !== intent.asset.id ||
        ref.sha256 !== intent.asset.sha256 ||
        ref.record !== 0 ||
        ref.conformer !== 0 ||
        ref.version_id !== intent.version.id
      ) {
        intent.version = undefined;
        throw new Error("identity");
      }
      if (mounted.current && token === generation.current)
        callback.current(ref);
    } catch (error) {
      if (mounted.current && token === generation.current)
        setError(
          error instanceof Error && error.message === "identity"
            ? "identity"
            : "unavailable",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, save, detach };
}
