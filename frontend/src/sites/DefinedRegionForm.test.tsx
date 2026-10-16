import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";
import type { ScientificObject } from "../research/types";
import type { ReceptorSet } from "../receptors/types";
import type { DefinedSiteInput } from "./types";
import { DefinedRegionForm } from "./DefinedRegionForm";

vi.mock("./RegionPreview", () => ({
  RegionPreview: ({ onCenter }: { onCenter?: unknown }) => (
    <div data-testid="source-preview">
      {onCenter ? "Editable source center" : "Read-only source preview"}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const frame = {
  asset_id: "aligned-receptor",
  sha256: "a".repeat(64),
  version_id: "receptor-version",
  record: 0,
  conformer: 0,
};
const reference = {
  ...frame,
  asset_id: "reference-ligand",
  version_id: "ligand-version",
  record: 2,
};
const ensemble = {
  id: "aligned-ensemble",
  members: [
    {
      reference: frame,
      evidence: {
        index: 0,
        quality: { backbone_complete: true },
        transformation: {
          rotation: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          translation: [0, 0, 0],
        },
      },
    },
  ],
} as unknown as ReceptorSet;
function sources() {
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path.startsWith("/research/input-catalog?"))
      return catalogFixture([
        {
          id: "ligand-version",
          kind: "molecule",
          label: "Bound reference ligand",
          reference,
        },
      ] as ScientificObject[]) as never;
    const ligand = path.includes("reference-ligand");
    return {
      id: ligand ? reference.asset_id : frame.asset_id,
      sha256: frame.sha256,
      size: 100,
      suffix: ligand ? ".sdf" : ".pdb",
      kind: ligand ? "ligand" : "structure",
      name: ligand ? "reference.sdf" : "aligned-receptor.pdb",
    } as never;
  });
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
}

it("requires explicit receptor and bounds, preserves idempotency after a failed response and never starts calculation", async () => {
  sources();
  const post = vi
    .spyOn(client.api, "post")
    .mockRejectedValueOnce(new Error("Response timed out"))
    .mockImplementationOnce(async (_path, value) => ({
      id: "saved-regions",
      schema_version: 2,
      request: value,
    }));
  const saved = vi.fn(),
    user = userEvent.setup();
  render(
    <DefinedRegionForm ensemble={ensemble} language="en" onSaved={saved} />,
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: /^Receptor 1/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Where should the search run?" }),
    "box",
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.type(
    screen.getByRole("spinbutton", { name: "Center X (Å)" }),
    "1.25",
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "Center Y (Å)" }),
    "-8.1",
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "Center Z (Å)" }),
    "20",
  );
  await user.clear(screen.getByRole("spinbutton", { name: "Length X (Å)" }));
  await user.type(
    screen.getByRole("spinbutton", { name: "Length X (Å)" }),
    "26.501",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(post).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save search regions" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Response timed out",
  );
  await user.click(screen.getByRole("button", { name: "Save search regions" }));
  await screen.findByText(
    "Search conditions saved; no computation has started.",
  );
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[0][2]).toBe(post.mock.calls[1][2]);
  const body = post.mock.calls[1][1] as DefinedSiteInput;
  expect(post.mock.calls[1][0]).toBe("/research/site-sets");
  expect(body).toMatchObject({
    kind: "defined_regions",
    ensemble_id: ensemble.id,
    regions: [
      {
        member_index: 0,
        search: {
          kind: "box",
          frame,
          box: {
            center: [1.25, -8.1, 20],
            size: [26.501, 20, 20],
            unit: "angstrom",
          },
        },
      },
    ],
  });
  expect(JSON.stringify(body)).not.toContain("probability");
  expect(screen.getByTestId("source-preview")).toHaveTextContent(
    "Read-only source preview",
  );
  expect(saved).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Explore poses in these regions" }),
  );
  expect(saved).toHaveBeenCalledWith(
    expect.objectContaining({ id: "saved-regions" }),
  );
});

it("requires reference-frame confirmation and revokes it when the source selection changes", async () => {
  sources();
  const post = vi.spyOn(client.api, "post"),
    user = userEvent.setup();
  render(
    <DefinedRegionForm ensemble={ensemble} language="en" onSaved={vi.fn()} />,
  );
  await user.click(screen.getByRole("checkbox", { name: /^Receptor 1/ }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Upload a new file" }),
  ).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  const picker = await screen.findByRole("combobox", {
    name: /Reference pocket ligand.*Historical files/,
  });
  await waitFor(() => expect(picker).toBeEnabled());
  await user.selectOptions(picker, "version:ligand-version");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  const confirm = screen.getByRole("checkbox", {
    name: /reference ligand uses the currently aligned/,
  });
  expect(confirm).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(confirm);
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: /Reference pocket ligand.*Historical files/,
    }),
    "",
  );
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: /Reference pocket ligand.*Historical files/,
    }),
    "version:ligand-version",
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("checkbox", {
      name: /reference ligand uses the currently aligned/,
    }),
  ).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});
