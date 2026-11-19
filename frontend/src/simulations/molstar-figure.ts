import type { PluginContext } from "molstar/lib/mol-plugin/context";
import { Camera } from "molstar/lib/mol-canvas3d/camera";
import { canvasToBlob } from "molstar/lib/mol-canvas3d/util";
import { Task } from "molstar/lib/mol-task";
import {
  figureAspect,
  figureDimensions,
  type FigureSettings,
} from "../publication/settings";
import {
  nativeFigurePixels,
  type FigurePixels,
} from "../publication/figure-panels";
export type { FigurePixels } from "../publication/figure-panels";

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
  const size =
    panel === undefined
      ? figureDimensions(
          settings,
          figureAspect(settings, bounds.width / bounds.height),
        )
      : nativeFigurePixels(panel);
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
        const render = () =>
          pass.getImageData(runtime, size.width, size.height);
        if (scale === 1) return await render();
        let pixels: Promise<ImageData>;
        try {
          // ImagePass copies the camera synchronously before awaiting GPU work.
          Camera.copySnapshot(camera, {
            fov: 2 * Math.atan(Math.tan(originalFov / 2) / scale),
          });
          pixels = render();
        } finally {
          Camera.copySnapshot(camera, { fov: originalFov });
        }
        return await pixels;
      } finally {
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
