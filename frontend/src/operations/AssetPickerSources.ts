import { useEffect, useRef, useState } from "react";

export type AssetSource = "file" | "saved" | "results";

/** Controlled values remain authoritative; each explicit source keeps its own choice. */
export function useAssetSources(
  value: string,
  showHistory: boolean,
  onChange: (id: string) => void,
) {
  const [source, setSource] = useState<AssetSource>(
    showHistory && value ? "saved" : "file",
  );
  const choices = useRef<Record<AssetSource, string>>({
    file: showHistory ? "" : value,
    saved: showHistory ? value : "",
    results: "",
  });
  useEffect(() => {
    choices.current[source] = value;
  }, [value, source]);
  function choose(id: string) {
    choices.current[source] = id;
    onChange(id);
  }
  function changeSource(next: AssetSource) {
    setSource(next);
    onChange(choices.current[next]);
  }
  return { source, choose, changeSource };
}
