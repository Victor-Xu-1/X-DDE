import { useEffect, useState } from "react";
import { request } from "../api";
import { useExample } from "../examples/context";
import type { Asset } from "../operations/types";
import {
  datasetOperations,
  type AvailableDataset,
  type DatasetTask,
} from "./types";

export interface DataExample {
  task: DatasetTask;
  assets: Map<string, Asset>;
  sources: AvailableDataset[];
}
export function useDatasetExample(onError?: (message: string) => void) {
  const prepared = useExample(),
    [example, setExample] = useState<DataExample | null>(null);
  useEffect(() => {
    setExample(null);
    const task = prepared?.request;
    if (
      !task ||
      !datasetOperations.includes(task.operation as DatasetTask["operation"])
    )
      return;
    const c = new AbortController(),
      value = task as DatasetTask;
    void Promise.all([
      Promise.all(
        value.inputs.map((item) =>
          request<Asset>(`/assets/${item.source.asset_id}/metadata`, {
            signal: c.signal,
          }),
        ),
      ),
      Promise.all(
        value.sources.map((item) =>
          request<AvailableDataset>(`/datasets/${item.job_id}/summary`, {
            signal: c.signal,
          }),
        ),
      ),
    ])
      .then(([assets, sources]) => {
        if (!c.signal.aborted)
          setExample({
            task: value,
            assets: new Map(assets.map((asset) => [asset.id, asset])),
            sources,
          });
      })
      .catch((error) => {
        if (!c.signal.aborted) onError?.(String(error));
      });
    return () => c.abort();
  }, [prepared]);
  return example;
}
