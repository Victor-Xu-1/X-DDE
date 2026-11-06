import { useEffect, useRef, useState } from "react";
import type { MoleculeRef } from "./types";

type SequenceSource = "paste" | "file" | "saved";

/** Keep drafts separate from confirmed references and restore only their own source. */
export function useSequenceSources(
  value: MoleculeRef | null,
  onChange: (reference: MoleculeRef | null) => void,
) {
  const [source, setSource] = useState<SequenceSource>(
    value?.version_id ? "saved" : value ? "file" : "paste",
  );
  const [text, setText] = useState("");
  const selections = useRef<Record<SequenceSource, MoleculeRef | null>>({
    paste: null,
    file: value && !value.version_id ? value : null,
    saved: value?.version_id ? value : null,
  });
  useEffect(() => {
    if (value) selections.current[source] = value;
  }, [value, source]);
  function remember(reference: MoleculeRef | null) {
    selections.current[source] = reference;
    onChange(reference);
  }
  function changeSource(next: SequenceSource) {
    setSource(next);
    onChange(selections.current[next]);
  }
  function edit(raw: string) {
    setText(raw);
    selections.current.paste = null;
    onChange(null);
  }
  return { source, text, remember, changeSource, edit };
}
