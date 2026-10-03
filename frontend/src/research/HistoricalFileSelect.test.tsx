import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { HistoricalFileSelect } from "./HistoricalFileSelect";
afterEach(cleanup);
it("keeps the original multi-record collection selectable alongside its exact saved record", async () => {
  const reference = {
    asset_id: "library",
    version_id: "lead",
    sha256: "a".repeat(64),
    record: 12,
    conformer: 0,
  };
  const choose = vi.fn(),
    user = userEvent.setup();
  render(
    <HistoricalFileSelect
      language="en"
      label="Input"
      value={null}
      versions={
        [
          { id: "lead", kind: "molecule", label: "Selected lead", reference },
        ] as never
      }
      files={
        [
          {
            id: "library",
            name: "BRD4-lead-library.sdf",
            kind: "ligand",
            suffix: ".sdf",
          },
        ] as never
      }
      busy={false}
      onSelect={choose}
    />,
  );
  const picker = screen.getByRole("combobox", {
    name: "Input · Historical files",
  });
  expect(picker).toHaveValue("");
  await user.selectOptions(picker, "file:library");
  expect(choose).toHaveBeenLastCalledWith("library");
  await user.selectOptions(picker, "version:lead");
  expect(choose).toHaveBeenLastCalledWith("library", reference);
  expect(reference.record).toBe(12);
});
