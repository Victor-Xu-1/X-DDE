import { useEffect, useRef, useState } from "react";
import { request } from "../api";
import type {
  AvailableDataset,
  DatasetCandidate,
  DatasetResult,
} from "./types";

export function useBatchCandidates(onError: (message: string) => void) {
  const [source, setSource] = useState<AvailableDataset[]>([]);
  const [candidates, setCandidates] = useState<DatasetCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const intent = useRef(0);
  useEffect(
    () => () => {
      intent.current++;
    },
    [],
  );

  async function choose(
    values: AvailableDataset[],
    initialSelected?: string[],
  ) {
    const current = ++intent.current;
    setSource(values);
    setCandidates([]);
    setSelected([]);
    setLoading(Boolean(values[0]));
    onError("");
    if (!values[0]) return;
    try {
      const result = await request<DatasetResult>(
        `/jobs/${values[0].job_id}/result`,
      );
      if (current !== intent.current) return;
      const rows = result.candidates.filter((row) => row.artifact);
      setCandidates(rows);
      setSelected(initialSelected ?? rows.slice(0, 25).map((row) => row.id));
    } catch (error) {
      if (current === intent.current) onError(String(error));
    } finally {
      if (current === intent.current) setLoading(false);
    }
  }
  function toggle(id: string) {
    setSelected((values) =>
      values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    );
  }
  const ready =
    !loading &&
    source.length === 1 &&
    selected.length > 0 &&
    selected.every((id) => candidates.some((row) => row.id === id));
  return {
    source,
    candidates,
    selected,
    choose,
    toggle,
    setSelected,
    ready,
    loading,
  };
}
