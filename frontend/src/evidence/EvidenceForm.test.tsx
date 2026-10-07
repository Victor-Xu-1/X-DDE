import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { EvidenceForm } from "./EvidenceForm";
vi.mock("../api", () => ({
  request: vi.fn(),
  api: { assets: vi.fn(), upload: vi.fn(), authorized: vi.fn(), post: vi.fn() },
}));
const asset = {
  id: "input-csv",
  name: "assay.csv",
  kind: "measurements",
  sha256: "a".repeat(64),
  size: 100,
  suffix: ".csv",
  created_at: "today",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.assets).mockResolvedValue([]);
  vi.mocked(api.upload).mockResolvedValue(asset as never);
  vi.mocked(request).mockImplementation(
    async () => ({ asset, columns: ["compound_id", "value"] }) as never,
  );
});
it("starts fresh and prevents progressing until actual columns are selected", async () => {
  const user = userEvent.setup();
  render(<EvidenceForm language="en" />);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(api.upload).not.toHaveBeenCalled();
  await user.upload(
    screen.getByLabelText("Upload Experimental CSV table"),
    new File(["compound_id,value\nA,10"], "assay.csv", { type: "text/csv" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "Compound/material ID" }),
    ).toBeInTheDocument(),
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Compound/material ID" }),
    "compound_id",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Reported value" }),
    "value",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("heading", { name: "2. Define assay conditions" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", { name: "Compound/material ID" }),
  ).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
