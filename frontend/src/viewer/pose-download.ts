import type { PreviewPose } from "./pose-types";

/** Saved assets can contain a whole ensemble; download the displayed record only. */
export function poseDownloadUrl(pose: PreviewPose, index: number) {
  const url = pose.urls[index];
  if (!url || !/^\/api\/assets\/[0-9a-f-]{36}$/i.test(url)) return url;
  const sourceRecord =
    pose.source?.kind === "asset" || pose.source?.kind === "artifact"
      ? pose.source.record
      : pose.object?.reference.record;
  return `${url}?record=${pose.records?.[index] ?? sourceRecord ?? 0}`;
}
