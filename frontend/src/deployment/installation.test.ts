import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { installComponents } from "./installation";
import { deploymentFixture, packageOf } from "./fixtures";
import type { Deployment } from "./client";

afterEach(() => vi.restoreAllMocks());
function network(data: Deployment) {
  const get = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true, json: async () => data } as Response);
  const post = vi.spyOn(api, "post").mockResolvedValue({});
  return { get, post };
}
it("rereads state before a bundle and skips installed, paused and duplicate roots", async () => {
  const data = deploymentFixture(
    [packageOf("ketcher"), packageOf("molstar"), packageOf("chemistry")],
    {
      installed: { ketcher: { version: "1" } },
      operations: [
        {
          id: "paused",
          package: "molstar",
          action: "install",
          state: "paused",
          stage: "Paused",
          error: null,
        },
      ],
    },
  );
  const { get, post } = network(data);
  await installComponents(
    ["ketcher", "molstar", "chemistry", "chemistry"],
    "E:\\WSL\\apps\\x-dde",
    true,
  );
  expect(get.mock.calls[0][0]).toBe("/api/deployment");
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/chemistry/install",
  ]);
  expect(post.mock.calls[0][1]).toMatchObject({
    location: "/mnt/e/WSL/apps/x-dde",
  });
});
it("does not save configuration or install when the bundle became complete", async () => {
  const { post } = network(
    deploymentFixture([packageOf("ketcher")], {
      installed: { ketcher: { version: "1" } },
    }),
  );
  await installComponents(["ketcher"], "/data/components", false);
  expect(post).not.toHaveBeenCalled();
});
it("rejects unknown roots before any configuration or queue mutation", async () => {
  const { post } = network(deploymentFixture([packageOf("ketcher")]));
  await expect(
    installComponents(["ketcher", "unknown"], "/data", false),
  ).rejects.toThrow("Unknown component");
  expect(post).not.toHaveBeenCalled();
});
it("explicit repair targets one installed component without changing queue authority", async () => {
  const { post } = network(
    deploymentFixture(
      [packageOf("compute", { dependencies: ["harness", "runtime"] })],
      { installed: { compute: { version: "1" } } },
    ),
  );
  await installComponents(["compute"], "/data", false, true);
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/compute/install",
  ]);
});
it("submits model roots through the backend dependency installer", async () => {
  const { post } = network(
    deploymentFixture([
      packageOf("standard", {
        dependencies: ["harness", "runtime", "compute"],
      }),
    ]),
  );
  await installComponents(["standard"], "/data", false);
  expect(post.mock.calls.map((c) => c[0])).toEqual([
    "/deployment/config",
    "/deployment/packages/standard/install",
  ]);
});
