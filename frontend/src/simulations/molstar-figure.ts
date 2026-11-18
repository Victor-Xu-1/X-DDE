import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { canvasToBlob } from "molstar/lib/mol-canvas3d/util";
import { Task } from "molstar/lib/mol-task";
import {
  figureAspect,
  figureDimensions,
  type FigureSettings,
} from "../publication/settings";

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
  const pass = helper.imagePass;
  const { multiSample, postprocessing, transparentBackground } = pass.props;
  const image = await plugin.runTask(
    Task.create("Render molecular figure", async (runtime) => {
      const camera = canvas.camera.state;
      const originalFov = camera.fov;
      const scale = settings.structureScale ?? 1;
      const wasAnimating = plugin.animationLoop.isAnimating;
      if (wasAnimating) plugin.animationLoop.stop({ noDraw: true });
      try {
        // ImagePass copies the source camera while rendering. A narrower field
        // of view magnifies the projection without moving the clipping planes.
        if (scale !== 1)
          camera.fov = 2 * Math.atan(Math.tan(originalFov / 2) / scale);
        // Bound the cost of supersampled print output in software WebGL.
        pass.setProps({
          multiSample: { ...multiSample, mode: "on", sampleLevel: 2 },
          postprocessing: {
            ...postprocessing,
            occlusion: { name: "off", params: {} },
          },
          transparentBackground: settings.transparent,
        });
        await pass.updateBackground();
        return await pass.getImageData(runtime, size.width, size.height);
      } finally {
        camera.fov = originalFov;
        pass.setProps({ multiSample, postprocessing, transparentBackground });
        if (wasAnimating) plugin.animationLoop.start();
      }
    }),
  );
  const output = document.createElement("canvas");
  output.width = image.width;
  output.height = image.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("The figure canvas is unavailable.");
  context.putImageData(image, 0, 0);
  return canvasToBlob(output, "image/png");
}
