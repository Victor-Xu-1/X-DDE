import { expect, it, vi } from "vitest";
import { MolecularUpdateQueue } from "./molecular-update-queue";

it("returns the actual failed frame operation and still allows later display and capture", async () => {
  const queue = new MolecularUpdateQueue();
  const failure = new Error("Native trajectory frame could not update");
  const frame = queue.run(async () => {
    throw failure;
  });
  const display = vi.fn(async () => "protein and ligand"),
    capture = vi.fn(async () => new Blob(["ready figure"]));
  const displayed = queue.run(display),
    figure = queue.run(capture);
  await expect(frame).rejects.toBe(failure);
  await expect(displayed).resolves.toBe("protein and ligand");
  await expect(figure).resolves.toBeInstanceOf(Blob);
  expect(display).toHaveBeenCalledOnce();
  expect(capture).toHaveBeenCalledOnce();
});

it("does not capture before a pending frame is committed", async () => {
  const queue = new MolecularUpdateQueue();
  let commit!: () => void;
  const frame = queue.run(
    () => new Promise<void>((resolve) => (commit = resolve)),
  );
  const capture = vi.fn(async () => "selected frame");
  const figure = queue.run(capture);
  await Promise.resolve();
  expect(capture).not.toHaveBeenCalled();
  commit();
  await frame;
  await expect(figure).resolves.toBe("selected frame");
});
