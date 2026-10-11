import { useEffect, useRef, useState } from "react";
import { api, ApiError, request as read } from "../api";
import type { Artifact } from "../types";
import type { Asset, AssetKind } from "./types";
import { acceptedAsset } from "./asset-acceptance";
import { compatibleResult } from "./useResultFiles";

interface Receipt {
  choice: string;
  key: string;
  asset?: Asset;
  metadata?: Artifact & { job_id: string; sha256: string };
}
/** The existing server output/asset authority owns deduplication and scientific eligibility. */
export function useResultReuse(
  job: string,
  file: Artifact | null,
  kind: AssetKind,
  formats: readonly string[],
  maxBytes: number,
  onSelected: (asset: Asset) => void,
  onPending?: () => void,
  currentInput = "",
) {
  const choice = [
    job,
    file?.name ?? "",
    file?.size ?? "",
    kind,
    formats.join(","),
    maxBytes,
  ].join(":");
  const active = useRef(choice);
  active.current = choice;
  const receipt = useRef<Receipt | null>(null),
    mounted = useRef(true),
    intent = useRef(0),
    pending = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef({ onSelected, onPending });
  callbacks.current = { onSelected, onPending };
  const [state, setState] = useState<{
    choice: string;
    busy: boolean;
    error: "" | "unavailable" | "identity" | "incompatible" | "changed";
  }>({ choice: "", busy: false, error: "" });
  const previousInput = useRef(currentInput);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      intent.current++;
    };
  }, []);
  useEffect(
    () => () => {
      controller.current?.abort();
      intent.current++;
      pending.current = null;
    },
    [choice],
  );
  function cancel() {
    controller.current?.abort();
    intent.current++;
    pending.current = null;
    receipt.current = null;
    setState({ choice, busy: false, error: "" });
  }
  useEffect(() => {
    if (state.busy && currentInput && currentInput !== previousInput.current)
      cancel();
    previousInput.current = currentInput;
  }, [currentInput]);
  async function save() {
    if (
      pending.current === intent.current ||
      !job ||
      !file ||
      !compatibleResult(file, formats, maxBytes)
    )
      return;
    const token = ++intent.current;
    pending.current = token;
    callbacks.current.onPending?.();
    const current = new AbortController();
    const signal = AbortSignal.any([
      current.signal,
      AbortSignal.timeout(30000),
    ]);
    controller.current = current;
    setState({ choice, busy: true, error: "" });
    let request = receipt.current;
    if (!request || request.choice !== choice) {
      request = { choice, key: crypto.randomUUID() };
      receipt.current = request;
    }
    try {
      if (!request.metadata) {
        const metadata = await read<NonNullable<Receipt["metadata"]>>(
          `/jobs/${encodeURIComponent(job)}/artifact-metadata?${new URLSearchParams({ name: file.name })}`,
          { signal },
        );
        signal.throwIfAborted();
        if (
          metadata.job_id !== job ||
          metadata.name !== file.name ||
          metadata.size !== file.size ||
          !/^[a-f0-9]{64}$/.test(metadata.sha256)
        )
          throw new Error("identity");
        request.metadata = metadata;
      }
      signal.throwIfAborted();
      const asset =
        request.asset ??
        (await api.authorized<Asset>(
          `/jobs/${encodeURIComponent(job)}/assets?${new URLSearchParams({ kind, name: file.name, expected_sha256: request.metadata.sha256 })}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": request.key,
            },
            body: "{}",
            signal,
          },
        ));
      signal.throwIfAborted();
      if (
        !acceptedAsset(asset, asset.id, kind, formats, maxBytes) ||
        asset.name !== file.name.split(/[\\/]/).at(-1) ||
        asset.size !== file.size ||
        asset.sha256 !== request.metadata.sha256
      )
        throw new Error("identity");
      request.asset = asset;
      if (
        mounted.current &&
        active.current === choice &&
        token === intent.current
      ) {
        callbacks.current.onSelected(asset);
        setState({ choice, busy: false, error: "" });
      }
    } catch (error) {
      if (
        mounted.current &&
        active.current === choice &&
        token === intent.current
      )
        setState({
          choice,
          busy: false,
          error:
            error instanceof ApiError && error.status === 409
              ? "changed"
              : error instanceof ApiError && error.status === 422
                ? "incompatible"
                : error instanceof Error && error.message === "identity"
                  ? "identity"
                  : "unavailable",
        });
    } finally {
      if (pending.current === token) pending.current = null;
    }
  }
  return {
    busy: state.choice === choice && state.busy,
    error: state.choice === choice ? state.error : "",
    save,
    cancel,
  };
}
