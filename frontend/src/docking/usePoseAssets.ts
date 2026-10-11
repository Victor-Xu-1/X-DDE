import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ScientificObject } from "../research/types";
import {
  lookupPoseAssets,
  poseAssetKey,
  type PoseAssetError,
  type PoseAssetTarget,
} from "./pose-asset-lookup";

/** Selected outputs only; late indexing and reads cannot restore an old selection. */
export function usePoseAssets(
  jobId: string,
  targets: readonly PoseAssetTarget[],
) {
  const serialized = JSON.stringify(targets);
  const choice = JSON.stringify([jobId, serialized]);
  const active = useRef(choice),
    mounted = useRef(true),
    intent = useRef(0);
  active.current = choice;
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{
    choice: string;
    token: number;
    promise: Promise<void>;
  } | null>(null);
  const [state, setState] = useState<{
    choice: string;
    objects: Record<string, ScientificObject>;
    action: "load" | "register" | "";
    error: PoseAssetError;
  }>({ choice: "", objects: {}, action: "", error: "" });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      intent.current++;
    };
  }, []);
  const run = useCallback(
    (register = false): Promise<void> => {
      if (active.current !== choice || !mounted.current)
        return Promise.resolve();
      if (pending.current?.choice === choice) return pending.current.promise;
      const selected: PoseAssetTarget[] = JSON.parse(serialized);
      if (!selected.length) {
        setState({ choice, objects: {}, action: "", error: "" });
        return Promise.resolve();
      }
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      const signal = AbortSignal.any([
        current.signal,
        AbortSignal.timeout(30000),
      ]);
      const token = ++intent.current;
      const isCurrent = () =>
        mounted.current &&
        active.current === choice &&
        token === intent.current;
      setState({
        choice,
        objects: {},
        action: register ? "register" : "load",
        error: "",
      });
      const promise = (async () => {
        try {
          let partial = false;
          if (register) {
            // OutputCatalog owns deterministic registration and recovery. Cancellation
            // stops UI waiting; it never deletes an already registered version.
            const receipt = await api.authorized<{
              state: string;
              count: number;
              errors: unknown[];
            }>(`/jobs/${encodeURIComponent(jobId)}/index-assets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
              signal,
            });
            signal.throwIfAborted();
            if (
              !["complete", "partial", "failed"].includes(receipt.state) ||
              !Number.isSafeInteger(receipt.count) ||
              receipt.count < 0 ||
              !Array.isArray(receipt.errors)
            )
              throw new Error("identity");
            partial = receipt.state !== "complete";
          }
          const objects = await lookupPoseAssets(jobId, selected, signal);
          signal.throwIfAborted();
          if (
            register &&
            selected.some((target) => !objects[poseAssetKey(target)])
          )
            partial = true;
          if (isCurrent())
            setState({
              choice,
              objects,
              action: "",
              error: partial ? "partial" : "",
            });
        } catch (error) {
          if (isCurrent())
            setState({
              choice,
              objects: {},
              action: "",
              error:
                error instanceof Error && error.message === "identity"
                  ? "identity"
                  : "unavailable",
            });
        } finally {
          if (pending.current?.token === token) pending.current = null;
        }
      })();
      pending.current = { choice, token, promise };
      return promise;
    },
    [choice, jobId, serialized],
  );
  useEffect(() => {
    void run();
    return () => {
      controller.current?.abort();
      intent.current++;
      pending.current = null;
    };
  }, [run]);
  function cancel() {
    controller.current?.abort();
    intent.current++;
    pending.current = null;
    setState({ choice, objects: {}, action: "", error: "" });
  }
  const current = state.choice === choice ? state : null;
  return {
    object: (target: PoseAssetTarget) => current?.objects[poseAssetKey(target)],
    busy: Boolean(current?.action),
    error: current?.error ?? "",
    retry: () => run(),
    refresh: () => run(true),
    cancel,
  };
}
