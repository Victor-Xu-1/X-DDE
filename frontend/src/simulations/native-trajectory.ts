import { parsePDB } from "molstar/lib/mol-io/reader/pdb/parser";
import { trajectoryFromPDB } from "molstar/lib/mol-model-formats/structure/pdb";
import type { Model, Trajectory } from "molstar/lib/mol-model/structure";
import { Task } from "molstar/lib/mol-task";
import {
  PluginStateObject as SO,
  PluginStateTransform,
} from "molstar/lib/mol-plugin-state/objects";
import { ParamDefinition as PD } from "molstar/lib/mol-util/param-definition";
import { readStructure, frameIdentity } from "./trajectory-source";

/** On-demand native frames: at most three parsed models, no full-trajectory text duplication. */
export async function sampledTrajectory(
  urls: string[],
  signal: AbortSignal,
): Promise<Trajectory> {
  if (!urls.length || urls.length > 200)
    throw new Error("A trajectory requires 1–200 sampled frames.");
  const cache = new Map<number, Model>();
  let identity: string | undefined;
  const load = async (index: number): Promise<Model> => {
    signal.throwIfAborted();
    if (index < 0 || index >= urls.length)
      throw new Error("Frame index is outside the native trajectory.");
    const existing = cache.get(index);
    if (existing) {
      cache.delete(index);
      cache.set(index, existing);
      return existing;
    }
    const text = await readStructure(urls[index], signal);
    const current = frameIdentity(text);
    if (identity !== undefined && identity !== current)
      throw new Error("Trajectory atom order changed between sampled frames.");
    identity = current;
    const parsed = await parsePDB(text, "X-DDE native frame").run();
    if (parsed.isError) throw new Error(parsed.message);
    const trajectory = await trajectoryFromPDB(parsed.result).run();
    if (trajectory.frameCount !== 1)
      throw new Error("A sampled artifact must contain exactly one structure.");
    const frame = trajectory.getFrameAtIndex(0);
    const model = Task.is<Model>(frame) ? await frame.run() : frame;
    cache.set(index, model);
    while (cache.size > 3) cache.delete(cache.keys().next().value!);
    return model;
  };
  const representative = await load(0);
  return {
    representative,
    frameCount: urls.length,
    duration: urls.length,
    getFrameAtIndex: (i) =>
      Task.create("Load native trajectory frame", () => load(i)),
  };
}

export const NativeTrajectory = PluginStateTransform.BuiltIn({
  name: "x-dde-native-sampled-trajectory",
  display: { name: "Native sampled trajectory" },
  from: SO.Root,
  to: SO.Molecule.Trajectory,
  params: { trajectory: PD.Value<Trajectory | null>(null, { isHidden: true }) },
})({
  apply({ params }) {
    if (!params.trajectory)
      throw new Error("Native sampled coordinates are required.");
    return new SO.Molecule.Trajectory(params.trajectory, {
      label: "Native molecular dynamics",
    });
  },
});
