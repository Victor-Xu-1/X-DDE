import { api, request } from "../api";
import type { Asset } from "../operations/types";

export type DataKind = "library" | "counts" | "reads";
export interface UploadState {
  id: string;
  name: string;
  kind: DataKind;
  size: number;
  offset: number;
  state: string;
  asset_id: string | null;
}
interface Chunk {
  offset: number;
  size: number;
  sha256: string;
}
const chunkBytes = 4 * 1024 ** 2;
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
async function checksum(blob: Blob) {
  return hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
}

export async function uploadDataset(
  file: File,
  kind: DataKind,
  options: {
    signal: AbortSignal;
    key: string;
    resume?: string;
    onState(state: UploadState): void;
    onProgress(done: number, total: number): void;
  },
): Promise<Asset> {
  const state = options.resume
    ? await request<UploadState>(`/assets/uploads/${options.resume}/status`, {
        signal: options.signal,
      })
    : await api.post<UploadState>(
        "/assets/uploads",
        { name: file.name, kind, size: file.size },
        options.key,
      );
  if (
    state.name !== file.name ||
    state.kind !== kind ||
    state.size !== file.size ||
    state.offset > file.size
  )
    throw new Error(
      "The selected file differs from the staged research upload.",
    );
  options.onState(state);
  // Reselecting a file must validate all previously accepted chunks, not just its name/size.
  let previous = 0,
    checked = 0;
  while (checked < state.offset) {
    const page = await request<Chunk[]>(
      `/assets/uploads/${state.id}/chunks?limit=128&offset=${previous * 128}`,
      { signal: options.signal },
    );
    if (!page.length)
      throw new Error(
        "The staged upload's confirmed chunk evidence is incomplete.",
      );
    for (const chunk of page) {
      if (options.signal.aborted) throw options.signal.reason;
      if (
        chunk.offset !== checked ||
        chunk.size <= 0 ||
        chunk.size > chunkBytes ||
        chunk.offset + chunk.size > state.offset ||
        (await checksum(
          file.slice(chunk.offset, chunk.offset + chunk.size),
        )) !== chunk.sha256
      )
        throw new Error(
          "A previously uploaded part belongs to different file bytes.",
        );
      checked += chunk.size;
    }
    previous++;
  }
  let offset = state.offset;
  options.onProgress(offset, file.size);
  while (offset < file.size) {
    if (options.signal.aborted) throw options.signal.reason;
    const blob = file.slice(offset, Math.min(offset + chunkBytes, file.size));
    const hash = await checksum(blob);
    const accepted = await api.authorized<UploadState>(
      `/assets/uploads/${state.id}?offset=${offset}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Chunk-SHA256": hash,
        },
        body: blob,
        signal: options.signal,
      },
    );
    if (accepted.offset !== offset + blob.size)
      throw new Error("The server confirmed a different upload position.");
    offset = accepted.offset;
    options.onState(accepted);
    options.onProgress(offset, file.size);
  }
  return api.authorized<Asset>(`/assets/uploads/${state.id}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": options.key,
    },
    body: "{}",
    signal: options.signal,
  });
}

export async function cancelUpload(id: string) {
  return api.authorized(`/assets/uploads/${id}`, { method: "DELETE" });
}
