import { useEffect, useState } from "react";
import { request } from "../api";
import type { ScientificEngine } from "../types";

export interface Deployment {
  config: { root?: string; automatic?: boolean };
  default_location: string;
  locations: string[];
  restart_required: boolean;
  prerequisites: {
    docker: boolean;
    uv: boolean;
    gpu_tool: boolean;
    supported: boolean;
  };
  installed: Record<string, { version: string; web?: string }>;
  environments?: Record<string, ScientificEngine>;
  engines: Record<string, ScientificEngine>;
  packages: {
    id: string;
    name: string;
    version: string;
    description: string;
    size: string;
    automatic: boolean;
    engine: string | null;
    kind: "runtime" | "model" | "editor" | "data";
    license: string;
    dependencies?: string[];
  }[];
  compute_service?: {
    restart_required?: boolean;
    configured: boolean;
    running: boolean;
    ready: boolean;
    automatic?: boolean;
    active?: number;
    queued?: number;
    reason?: string | null;
  };
  operations: {
    id: string;
    package: string;
    action: string;
    state: string;
    stage: string;
    error: string | null;
  }[];
}

export function useDeployment() {
  const [data, setData] = useState<Deployment | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await request<Deployment>("/deployment", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setData(next);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e));
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 2500);
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision]);
  return { data, error, refresh: () => setRevision((v) => v + 1) };
}

export function linuxLocation(value: string) {
  const match = /^([a-z]):[\\/](.*)$/i.exec(value.trim());
  return match
    ? `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`
    : value.trim();
}
