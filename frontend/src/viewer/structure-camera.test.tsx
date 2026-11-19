import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  isStructureCamera,
  type StructureCameraHandle,
} from "./structure-camera";
import { useStructureCamera } from "./useStructureCamera";

const view = [1, 2, 3, -725, 0, 0, 0, 1] as const;

it("admits only finite camera values with a unit rotation", () => {
  expect(isStructureCamera(view)).toBe(true);
  expect(isStructureCamera([1, 2, 3, 0, 0, 0, 0, 0])).toBe(false);
  expect(isStructureCamera([1, 2, 3, 0, 0, 0, 0, Infinity])).toBe(false);
  expect(isStructureCamera([1, 2, 3, 0, 0, 0, 0, "1"])).toBe(false);
  expect(isStructureCamera([1e20, 2, 3, 0, 0, 0, 0, 1])).toBe(false);
});

it("accepts only the pending camera reply for the loaded scene", async () => {
  const host = document.createElement("iframe");
  document.body.appendChild(host);
  const target = host.contentWindow!;
  const post = vi.spyOn(target, "postMessage").mockImplementation(() => {});
  const publish = vi.fn<(handle: StructureCameraHandle | null) => void>();
  const frame = { current: host };
  const hook = renderHook(
    ({ scene }) => useStructureCamera(frame, scene, true, publish),
    { initialProps: { scene: "source-a" } },
  );
  try {
    const current = publish.mock.lastCall![0]!;
    const reading = current.read();
    const id = post.mock.lastCall![0].value;
    expect(post).toHaveBeenLastCalledWith(
      { channel: "opendde-viewer", type: "camera-read", value: id },
      location.origin,
    );
    function reply(
      source: MessageEventSource,
      origin: string,
      requestId: string,
    ) {
      window.dispatchEvent(
        new MessageEvent("message", {
          source,
          origin,
          data: {
            channel: "opendde-viewer",
            type: "camera",
            detail: { id: requestId, camera: view },
          },
        }),
      );
    }
    reply(window, location.origin, id);
    reply(target, "https://invalid.example", id);
    reply(target, location.origin, "unrelated");
    expect(await current.read()).toBeNull();
    reply(target, location.origin, id);
    expect(await reading).toEqual(view);
    current.apply(view);
    expect(post).toHaveBeenLastCalledWith(
      { channel: "opendde-viewer", type: "camera-apply", value: view },
      location.origin,
    );

    const stale = current.read();
    hook.rerender({ scene: "source-b" });
    expect(await stale).toBeNull();
    expect(publish.mock.calls).toContainEqual([null]);
    expect(await current.read()).toBeNull();
  } finally {
    hook.unmount();
    host.remove();
  }
});
