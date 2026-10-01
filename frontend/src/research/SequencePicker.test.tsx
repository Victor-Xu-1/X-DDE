import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { SequencePicker } from "./SequencePicker";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("saves an immutable sequence version only on explicit action and detaches it after editing", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  const asset = {
    id: "file",
    name: "sequence-input.fasta",
    kind: "sequences",
    suffix: ".fasta",
    sha256: "a".repeat(64),
    size: 50,
    created_at: "",
  };
  const upload = vi.spyOn(api, "upload").mockResolvedValue(asset as never);
  const reference = {
    asset_id: "file",
    sha256: asset.sha256,
    record: 0,
    conformer: 0,
    version_id: "saved",
  };
  const save = vi
    .spyOn(api, "post")
    .mockResolvedValue({ id: "saved", kind: "sequence", reference });
  const changed = vi.fn(),
    user = userEvent.setup();
  render(
    <SequencePicker
      language="en"
      value={null}
      label="Input sequences"
      onChange={changed}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Sequence or FASTA" }),
    "ACDEFGHIKLMNPQRSTVWY",
  );
  expect(upload).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Save sequence version" }),
  );
  expect(save).toHaveBeenCalledWith(
    "/research/objects",
    expect.objectContaining({ asset_id: "file", kind: "sequence" }),
  );
  expect(changed).toHaveBeenLastCalledWith(reference);
  await user.type(
    screen.getByRole("textbox", { name: "Sequence or FASTA" }),
    "A",
  );
  expect(changed).toHaveBeenLastCalledWith(null);
});
