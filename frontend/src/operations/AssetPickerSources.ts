import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type AssetSource = "file" | "saved" | "results";

/** Controlled values remain authoritative; each explicit source keeps its own choice. */
export function useAssetSources(
  value: string,
  showHistory: boolean,
  onChange: (id: string) => void,
  uploadKey?: string,
) {
  const [source, setSource] = useState<AssetSource>(
    showHistory && value && !uploadKey ? "saved" : "file",
  );
  const choices = useRef<Record<AssetSource, string>>({
    file: showHistory && !uploadKey ? "" : value,
    saved: showHistory && !uploadKey ? value : "",
    results: "",
  });
  const uploaded = useRef(uploadKey);
  const adopting = useRef(false);
  useLayoutEffect(() => {
    if (!uploadKey || uploaded.current === uploadKey) return;
    uploaded.current = uploadKey;
    choices.current.file = value;
    adopting.current = source !== "file";
    setSource("file");
  }, [uploadKey]);
  useEffect(() => {
    if (adopting.current && source !== "file") {
      adopting.current = false;
      return;
    }
    choices.current[source] = value;
  }, [value, source, uploadKey]);
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
