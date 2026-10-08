import { afterEach, expect, it, vi } from "vitest";
import { Task } from "molstar/lib/mol-task";
import { sampledTrajectory } from "./native-trajectory";
import { frameIdentity, readStructure } from "./trajectory-source";

const pdb = (x: number, atom = " N  ") =>
  `ATOM      1 ${atom} ALA A   1    ${x.toFixed(3).padStart(8)}   2.000   3.000  1.00  0.00           N  \nEND\n`;
afterEach(() => vi.unstubAllGlobals());
it("loads exact native coordinates on demand and uses a bounded model cache", async () => {
  const fetcher = vi.fn(
    async (url: URL) => new Response(pdb(Number(url.searchParams.get("i")))),
  );
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  const trajectory = await sampledTrajectory(
    [0, 1, 2, 3].map((i) => `/api/jobs/example/download?i=${i}`),
    signal,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(trajectory.frameCount).toBe(4);
  expect(trajectory.representative.atomicConformation.x[0]).toBe(0);
  for (const i of [1, 2, 3, 0]) {
    const task = trajectory.getFrameAtIndex(i);
    const model = Task.is(task) ? await task.run() : task;
    expect(model.atomicConformation.x[0]).toBe(i);
  }
  expect(fetcher).toHaveBeenCalledTimes(5);
  const same = trajectory.getFrameAtIndex(0);
  await (Task.is(same) ? same.run() : Promise.resolve(same));
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it("rejects changed topology and unmanaged URLs instead of faking a trajectory", async () => {
  expect(frameIdentity(pdb(0))).toBe(frameIdentity(pdb(10)));
  expect(frameIdentity(pdb(0))).not.toBe(frameIdentity(pdb(0, " CA ")));
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: URL) =>
        new Response(
          pdb(0, url.searchParams.get("i") === "1" ? " CA " : " N  "),
        ),
    ),
  );
  const signal = new AbortController().signal;
  const trajectory = await sampledTrajectory(
    ["/api/a?i=0", "/api/a?i=1"],
    signal,
  );
  const second = trajectory.getFrameAtIndex(1);
  expect(Task.is(second)).toBe(true);
  await expect(
    Task.is(second) ? second.run() : Promise.resolve(second),
  ).rejects.toThrow("atom order changed");
  await expect(
    readStructure("https://unmanaged.invalid/protein.pdb", signal),
  ).rejects.toThrow("managed X-DDE");
});
