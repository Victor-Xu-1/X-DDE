import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ImageMoleculeInput } from "./ImageMoleculeInput";
vi.mock("./ImageMoleculeDialog", () => ({
  ImageMoleculeDialog: ({ file, onClose }: { file: File; onClose(): void }) => (
    <div role="dialog">
      {file.name}
      <button onClick={onClose}>Cancel</button>
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
