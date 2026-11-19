import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ImageMoleculeInput } from "./ImageMoleculeInput";
vi.mock("./ImageMoleculeDialog", () => ({
  ImageMoleculeDialog: ({
    file,
    mode,
    onClose,
    onAccept,
  }: {
    file: File;
    mode: string;
    onClose(): void;
    onAccept(
      molecule: { smiles: string; molfile: string },
      source: File,
    ): Promise<void>;
  }) =>
    mode === "hidden" ? null : (
      <div role="dialog">
        {file.name}
        <button onClick={() => onClose()}>Cancel</button>
        <button
          onClick={() =>
            void onAccept(
              { smiles: "CC(=O)Oc1ccccc1C(=O)O", molfile: "M  END" },
              file,
            )
          }
        >
          Use
        </button>
      </div>
    ),
}));
afterEach(cleanup);
it("opens a pasted or dropped image without changing the existing task input", async () => {
  const apply = vi.fn();
  render(
    <ImageMoleculeInput language="en" onMolecule={apply}>
      <textarea aria-label="SMILES" defaultValue="retained" />
    </ImageMoleculeInput>,
  );
  const target = screen.getByLabelText("SMILES"),
    image = new File(["png"], "screenshot.png", { type: "image/png" });
  fireEvent.paste(target, { clipboardData: { files: [image] } });
  expect(screen.getByRole("dialog")).toHaveTextContent("screenshot.png");
  expect(apply).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Cancel"));
  expect(target).toHaveValue("retained");
  fireEvent.drop(target, { dataTransfer: { files: [image] } });
  expect(screen.getByRole("dialog")).toBeVisible();
});

it("a cancelled apply cannot close a later image dialog", async () => {
  let resolve!: () => void;
  const apply = vi.fn().mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(
    <ImageMoleculeInput language="en" onMolecule={apply}>
      <textarea aria-label="SMILES" />
    </ImageMoleculeInput>,
  );
  const target = screen.getByLabelText("SMILES");
  fireEvent.paste(target, {
    clipboardData: {
      files: [new File(["png"], "first.png", { type: "image/png" })],
    },
  });
  await userEvent.click(screen.getByText("Use"));
  const signal = apply.mock.calls[0][2] as AbortSignal;
  await userEvent.click(screen.getByText("Cancel"));
  expect(signal.aborted).toBe(true);
  fireEvent.paste(target, {
    clipboardData: {
      files: [new File(["png"], "second.png", { type: "image/png" })],
    },
  });
  await act(async () => resolve());
  expect(screen.getByRole("dialog")).toHaveTextContent("second.png");
});
it("keeps image controls out of non-molecular input", () => {
  render(
    <ImageMoleculeInput enabled={false} language="en" onMolecule={vi.fn()}>
      <textarea aria-label="Protein sequence" />
    </ImageMoleculeInput>,
  );
  expect(
    screen.queryByText("Input from structure image"),
  ).not.toBeInTheDocument();
});
