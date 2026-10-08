import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { figureDimensions, type FigureSettings } from "../publication/settings";
import { dataUrlBlob } from "../publication/png-resolution";

/** Native offscreen rendering preserves the live scene, camera and screenshot settings. */
export async function molecularFigure(
  plugin: PluginContext,
  viewport: HTMLElement,
  settings: FigureSettings,
): Promise<Blob> {
  const helper = plugin.helpers.viewportScreenshot;
  const canvas = plugin.canvas3d;
  if (!helper || !canvas) throw new Error("The molecular view is not ready.");
  const bounds = viewport.getBoundingClientRect();
  const size = figureDimensions(settings, bounds.width / bounds.height);
  const values = helper.values,
    crop = helper.behaviors.relativeCrop.value,
    cropParams = helper.behaviors.cropParams.value;
  const processing = structuredClone(canvas.props.postprocessing);
  try {
    // The native screenshot helper otherwise forces 128 occlusion samples for
    // every high-resolution AA pass. Balanced lighting retains full native
    // geometry and supersampling without blocking software WebGL for minutes.
    canvas.setProps({
      postprocessing: { occlusion: { name: "off", params: {} } },
    });
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
    canvas.setProps({ postprocessing: processing });
    helper.behaviors.values.next(values);
    helper.behaviors.cropParams.next(cropParams);
    helper.behaviors.relativeCrop.next(crop);
  }
}
