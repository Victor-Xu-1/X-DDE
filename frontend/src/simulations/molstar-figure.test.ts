import { expect, it, vi } from "vitest";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import type { Task } from "molstar/lib/mol-task";
import { molecularFigure } from "./molstar-figure";
import { defaultFigure } from "../publication/settings";

it.each([
  { shape: undefined, height: 1577, scale: 1 },
  { shape: "square" as const, height: 2102, scale: 1.5 },
  { shape: "landscape" as const, height: 1401, scale: 0.75 },
  { shape: "portrait" as const, height: 2803, scale: 2 },
  {
    shape: "square" as const,
    width: 1003,
    height: 927,
    panel: { width: 1003, height: 927 },
    scale: 0.5,
    paused: true,
  },
] as const)(
  "restores the offscreen pass and camera after a failed $scale× render",
  async (scenario) => {
    const { shape, height, scale } = scenario;
    const width = "width" in scenario ? scenario.width : 2102;
    const panel = "panel" in scenario ? scenario.panel : undefined;
    const paused = "paused" in scenario && scenario.paused;
    const fov = Math.PI / 4;
    const camera = { fov, radius: 17, minNear: 1 };
    const originalProps = {
      postprocessing: {
        occlusion: { name: "on", params: { samples: 32 } },
        outline: { name: "off" },
      },
      multiSample: { mode: "on", sampleLevel: 4 },
      transparentBackground: false,
    };
    const pass = {
      props: { ...originalProps },
      setProps: vi.fn((props) => Object.assign(pass.props, props)),
      updateBackground: vi.fn(async () => undefined),
      getImageData: vi.fn(async (_runtime, pixelsWide, pixelsHigh) => {
        expect([pixelsWide, pixelsHigh]).toEqual([width, height]);
        expect(Math.tan(fov / 2) / Math.tan(camera.fov / 2)).toBeCloseTo(scale);
        expect(camera).toMatchObject({ radius: 17, minNear: 1 });
        expect(pass.props).toMatchObject({
          postprocessing: { occlusion: { name: "off" } },
          multiSample: { sampleLevel: 2 },
          transparentBackground: true,
        });
        await Promise.resolve();
        expect(camera.fov).toBe(fov);
        throw new Error("Native capture failed");
      }),
    };
    const animationLoop = {
      isAnimating: !paused,
      stop: vi.fn(),
      start: vi.fn(() => {
        expect(camera.fov).toBe(fov);
        expect(pass.props).toEqual(originalProps);
      }),
    };
    const viewport = document.createElement("div");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
    } as DOMRect);
    const plugin = {
      canvas3d: { camera: { state: camera } },
      helpers: { viewportScreenshot: { imagePass: pass } },
      runTask: (task: Task<unknown>) => task.run(),
      animationLoop,
    } as unknown as PluginContext;
    await expect(
      molecularFigure(
        plugin,
        viewport,
        { ...defaultFigure, shape, structureScale: scale, transparent: true },
        panel,
      ),
    ).rejects.toThrow("Native capture failed");
    expect(camera).toEqual({ fov, radius: 17, minNear: 1 });
    expect(pass.props).toEqual(originalProps);
    expect(animationLoop.stop).toHaveBeenCalledTimes(paused ? 0 : 1);
    expect(animationLoop.start).toHaveBeenCalledTimes(paused ? 0 : 1);
  },
);
