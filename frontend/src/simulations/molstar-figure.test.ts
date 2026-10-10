import { expect, it, vi } from "vitest";
import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { molecularFigure } from "./molstar-figure";
import { defaultFigure } from "../publication/settings";

it.each([
  { shape: undefined, height: 1577 },
  { shape: "square" as const, height: 2102 },
  { shape: "landscape" as const, height: 1401 },
  { shape: "portrait" as const, height: 2803 },
  {
    shape: "square" as const,
    width: 1003,
    height: 927,
    panel: { width: 1003, height: 927 },
  },
])(
  "restores native lighting, crop and screenshot values for $shape even when rendering fails",
  async ({ shape, height, width = 2102, panel }) => {
    const initial = {
      resolution: { name: "viewport", params: {} },
      transparent: false,
    };
    const values = {
      value: initial,
      next: vi.fn((next) => {
        values.value = next;
      }),
    };
    const crop = {
      value: { x: 0.1, y: 0, width: 0.8, height: 1 },
      next: vi.fn((next) => {
        crop.value = next;
      }),
    };
    const cropParams = {
      value: { auto: true },
      next: vi.fn((next) => {
        cropParams.value = next;
      }),
    };
    const processing = {
      occlusion: { name: "on", params: { samples: 32 } },
      outline: { name: "off" },
    };
    const canvas = {
      props: { postprocessing: structuredClone(processing) },
      setProps: vi.fn((next) =>
        Object.assign(canvas.props.postprocessing, next.postprocessing),
      ),
    };
    const sampling = {
      mode: "on",
      sampleLevel: 4,
      reduceFlicker: true,
      reuseOcclusion: false,
    };
    const pass = {
      props: { multiSample: { ...sampling } },
      setProps: vi.fn((next) => Object.assign(pass.props, next)),
    };
    const helper = {
      imagePass: pass,
      get values() {
        return values.value;
      },
      behaviors: { values, relativeCrop: crop, cropParams },
      getImageDataUri: vi.fn(async () => {
        expect(values.value.resolution).toMatchObject({
          name: "custom",
          params: { width, height },
        });
        expect(canvas.props.postprocessing.occlusion.name).toBe("off");
        expect(pass.props.multiSample).toEqual({ ...sampling, sampleLevel: 2 });
        throw new Error("Native capture failed");
      }),
    };
    const viewport = document.createElement("div");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
    } as DOMRect);
    const plugin = {
      canvas3d: canvas,
      helpers: { viewportScreenshot: helper },
    } as unknown as PluginContext;
    await expect(
      molecularFigure(plugin, viewport, { ...defaultFigure, shape }, panel),
    ).rejects.toThrow("Native capture failed");
    expect(canvas.props.postprocessing).toEqual(processing);
    expect(helper.values).toEqual(initial);
    expect(crop.value).toEqual({ x: 0.1, y: 0, width: 0.8, height: 1 });
    expect(cropParams.value.auto).toBe(true);
    expect(pass.props.multiSample).toEqual(sampling);
  },
);
