import { request } from "../api";
import type { ScientificObject } from "../research/types";

export interface PoseAssetTarget {
  name: string;
  kind: "molecule" | "structure";
  record: number;
}
export type PoseAssetError = "" | "unavailable" | "identity" | "partial";
export const poseAssetKey = (target: PoseAssetTarget) =>
  JSON.stringify([target.name, target.kind, target.record]);

/** Exact native-file identity over the existing scientific version authority. */
export async function lookupPoseAssets(
  jobId: string,
  targets: readonly PoseAssetTarget[],
  signal: AbortSignal,
): Promise<Record<string, ScientificObject>> {
  const entries = await Promise.all(
    targets.map(async (target) => {
      const metadata = await request<{
        job_id: string;
        name: string;
        sha256: string;
        size: number;
      }>(
        `/jobs/${encodeURIComponent(jobId)}/artifact-metadata?${new URLSearchParams({ name: target.name })}`,
        { signal },
      );
      signal.throwIfAborted();
      if (
        metadata.job_id !== jobId ||
        metadata.name !== target.name ||
        !/^[a-f0-9]{64}$/.test(metadata.sha256) ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size <= 0 ||
        metadata.size > 25 * 1024 ** 2
      )
        throw new Error("identity");
      const query = new URLSearchParams({
        source_job: jobId,
        asset_name: target.name.split(/[\\/]/).at(-1)!,
        sha256: metadata.sha256,
        kind: target.kind,
        record: String(target.record),
        limit: "1",
      });
      const versions = await request<ScientificObject[]>(
        `/research/objects?${query}`,
        { signal },
      );
      signal.throwIfAborted();
      if (!Array.isArray(versions) || versions.length > 1)
        throw new Error("identity");
      const value = versions[0];
      if (
        value &&
        (!value.id ||
          value.reference?.version_id !== value.id ||
          !value.reference.asset_id ||
          value.source_job !== jobId ||
          value.kind !== target.kind ||
          value.reference.sha256 !== metadata.sha256 ||
          value.reference.record !== target.record ||
          value.reference.conformer !== 0)
      )
        throw new Error("identity");
      return value ? ([poseAssetKey(target), value] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}

export function poseAssetMessage(error: PoseAssetError, zh: boolean): string {
  if (error === "identity")
    return zh
      ? "当前结果与保存的材料不一致。请重新选择结果，或检查原始文件。"
      : "This result does not match the saved material. Select it again or inspect the source file.";
  if (error === "partial")
    return zh
      ? "部分结果尚不能用于后续研究。已核对的材料仍可使用，也可以重试。"
      : "Some results are not available for follow-up. Verified materials remain usable; you can retry.";
  return error
    ? zh
      ? "暂时无法读取后续研究材料，请重试。"
      : "Follow-up materials could not be loaded. Please retry."
    : "";
}
