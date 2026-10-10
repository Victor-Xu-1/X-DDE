import type { PluginContext } from "molstar/lib/mol-plugin/context";
import {
  figureAspect,
  figureDimensions,
  type FigureSettings,
} from "../publication/settings";
import { dataUrlBlob } from "../publication/png-resolution";

export interface FigurePixels {
  width: number;
  height: number;
}
export function nativeFigurePixels(size: FigurePixels): FigurePixels {
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width < 128 ||
    size.height < 128 ||
    size.width > 8192 ||
    size.height > 8192 ||
    size.width * size.height > 24 * 1024 ** 2
  )
    throw new Error("Unsupported native panel dimensions.");
  return size;
}

/** Native offscreen rendering preserves the live scene, camera and screenshot settings. */
export async function molecularFigure(
  plugin: PluginContext,
  viewport: HTMLElement,
  settings: FigureSettings,
  panel?: FigurePixels,
): Promise<Blob> {
  const helper = plugin.helpers.viewportScreenshot;
  const canvas = plugin.canvas3d;
  if (!helper || !canvas) throw new Error("The molecular view is not ready.");
  const bounds = viewport.getBoundingClientRect();
  const whole = figureDimensions(
    settings,
    figureAspect(settings, bounds.width / bounds.height),
  );
  const size = panel ? nativeFigurePixels(panel) : whole;
  const values = helper.values,
    crop = helper.behaviors.relativeCrop.value,
    cropParams = helper.behaviors.cropParams.value;
  const processing = structuredClone(canvas.props.postprocessing);
  const pass = helper.imagePass;
  const sampling = structuredClone(pass.props.multiSample);
  try {
    // The native screenshot helper otherwise forces 128 occlusion samples for
    // every high-resolution AA pass. Balanced lighting retains full native
    // geometry and supersampling without blocking software WebGL for minutes.
    canvas.setProps({
      postprocessing: { occlusion: { name: "off", params: {} } },
    });
    // Four native jitter samples at the requested print resolution bound work
    // for large paired scenes; the helper's default sixteen samples can stall
    // software WebGL. Scientific geometry and the live viewport are unchanged.
    pass.setProps({ multiSample: { ...sampling, mode: "on", sampleLevel: 2 } });
    helper.behaviors.values.next({
      ...values,
      resolution: {
        name: "custom",
        params: { width: size.width, height: size.height },
      },
      format: { name: "png", params: {} },
      transparent: settings.transparent,
    });
    helper.behaviors.cropParams.next({ ...cropParams, auto: false });
    helper.behaviors.relativeCrop.next({ x: 0, y: 0, width: 1, height: 1 });
    return await dataUrlBlob(await helper.getImageDataUri());
  } finally {
    pass.setProps({ multiSample: sampling });
    canvas.setProps({ postprocessing: processing });
    helper.behaviors.values.next(values);
    helper.behaviors.cropParams.next(cropParams);
    helper.behaviors.relativeCrop.next(crop);
  }
}
