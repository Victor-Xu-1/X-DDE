import { expect, it, vi } from "vitest";
import {
  createForegroundRecognition,
  type NativeRecognitionWork,
} from "./recognition-foreground";

function setup() {
  const image = new File(["protocol fixture"], "stat6.png", {
    type: "image/png",
  });
  let job: { id: string } | undefined = { id: "actual-native-job" };
  const work: NativeRecognitionWork = {
    file: null,
    state: { phase: "stopped", job: null },
    busy: false,
    error: "",
    smiles: "",
    structureGate: { available: false },
    recognize: vi.fn().mockImplementation(async () => job),
  };
  const controller = createForegroundRecognition(() => work);
  const abort = new AbortController();
  return {
    image,
    work,
    controller,
    abort,
    noJob: () => {
      job = undefined;
    },
  };
}

it("waits for the committed image and accepts only its actual job and chemical gate", async () => {
  const { image, work, controller, abort } = setup();
  const result = controller.request(image, abort.signal),
    ready = vi.fn();
  void result.then(ready);
  expect(work.recognize).not.toHaveBeenCalled();
  work.state.phase = "ready";
  work.file = image;
  controller.update();
  controller.update();
  await Promise.resolve();
  expect(work.recognize).toHaveBeenCalledOnce();
  work.state.job = { id: "actual-native-job", status: "succeeded" };
  work.smiles = "Nc1ccccc1";
  controller.update();
  expect(ready).not.toHaveBeenCalled();
  work.structureGate.available = true;
  controller.update();
  await result;
  expect(ready).toHaveBeenCalledOnce();
});

it("rejects an import if the service stopped before the image committed", async () => {
  const { image, work, controller, abort } = setup();
  work.state.phase = "ready";
  const rejected = expect(controller.request(image, abort.signal)).rejects.toThrow(
    "Recognition service is off",
  );
  work.file = image;
  work.state.phase = "stopped";
  controller.update();
  await rejected;
  expect(work.recognize).not.toHaveBeenCalled();
});

it.each(["cancel", "dispose", "replace"])(
  "%s abandons import without stopping native recognition",
  async (action) => {
    const { image, work, controller, abort } = setup();
    work.file = image;
    work.state.phase = "ready";
    const result = controller.request(image, abort.signal);
    const rejected = expect(result).rejects.toThrow();
    await Promise.resolve();
    if (action === "cancel") abort.abort();
    else if (action === "dispose") controller.dispose();
    else {
      work.file = new File(["new"], "other.png");
      controller.update();
    }
    await rejected;
  },
);

it("never adopts a different running job or starts while another worker is busy", async () => {
  const { image, work, controller, abort } = setup();
  work.file = image;
  work.state = { phase: "busy", job: { id: "other", status: "running" } };
  work.busy = true;
  await expect(controller.request(image, abort.signal)).rejects.toThrow(
    "Another native job",
  );
  expect(work.recognize).not.toHaveBeenCalled();
});

it("does not treat an old succeeded job as the result when native submission fails", async () => {
  const { image, work, controller, abort, noJob } = setup();
  noJob();
  work.file = image;
  work.state = { phase: "ready", job: { id: "old", status: "succeeded" } };
  work.smiles = "Nc1ccccc1";
  work.structureGate.available = true;
  await expect(controller.request(image, abort.signal)).rejects.toThrow(
    "could not start",
  );
});
