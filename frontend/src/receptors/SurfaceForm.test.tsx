import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { SurfaceForm } from "./SurfaceForm";
import { ExampleContext } from "../examples/context";
import type { MoleculeRef } from "../research/types";
import { surfaceDefaults } from "./surface-types";
import type { PreparedExample } from "../examples/types";
const ref = {
  asset_id: "source",
  sha256: "a".repeat(64),
  version_id: "immutable-version",
  record: 0,
  conformer: 0,
};
// Exact archive references and observed JQ1 records from the checksum-verified
// public-case bundle e0df54c105e695480ab568048ac131f732ca1d02c1286a0574b69be16e975f29.
// The full observed complex hashes to the brd4_alt_a reference below; these are
// its unmodified JQ1 records, not a computed or synthetic binding pose.
const archiveReferences = {
  receptor: {
    asset_id: "f0058a41-5c7d-4b0f-8a1c-fff50bd50f69",
    sha256: "1f59bf725f67beff28cce2352e8a56350948e1c85b55091df05b3d48fd7930c6",
    record: 0,
    conformer: 0,
    version_id: "c9f8170d-f010-551f-8e7a-51215802dd10",
  },
  brd4_alt_a: {
    asset_id: "bcdd7f13-61d9-4763-ae9f-ed8a35f6ebc1",
    sha256: "00a5b4262d303384c1b760ca29a94f45034a0cf6a25cefcd898bfc2104ddf806",
    record: 0,
    conformer: 0,
    version_id: "4e5e827e-43eb-5123-b9ee-2514333a4ad3",
  },
};
const observedJq1 = [
  "HETATM 1076  CAA JQ1 A   1      29.899  18.962   1.724  1.00  7.28           C  ",
  "HETATM 1077  CAB JQ1 A   1      25.204  15.116   1.393  1.00  9.95           C  ",
  "HETATM 1078  CAC JQ1 A   1      25.682  14.930  -1.694  1.00 10.30           C  ",
  "HETATM 1079  CAD JQ1 A   1      29.233  13.118  -5.465  1.00 15.92           C  ",
  "HETATM 1080  CAE JQ1 A   1      30.649  11.124  -4.687  1.00 18.36           C  ",
  "HETATM 1081  CAF JQ1 A   1      28.543  11.742  -3.510  1.00 15.62           C  ",
  "HETATM 1082  OAG JQ1 A   1      32.109  13.864  -4.714  1.00 20.67           O  ",
  "HETATM 1083 CLAH JQ1 A   1      24.824  18.476  -6.770  1.00  9.02          CL  ",
  "HETATM 1084  CAI JQ1 A   1      25.532  17.964  -4.219  1.00  8.34           C  ",
  "HETATM 1085  CAJ JQ1 A   1      27.032  17.110  -5.868  1.00  6.71           C  ",
  "HETATM 1086  CAK JQ1 A   1      26.351  17.447  -3.210  1.00  6.66           C  ",
  "HETATM 1087  CAL JQ1 A   1      27.857  16.609  -4.867  1.00  6.48           C  ",
  "HETATM 1088  CAM JQ1 A   1      31.898  14.964  -2.576  1.00  8.11           C  ",
  "HETATM 1089  NAN JQ1 A   1      29.662  16.042  -2.828  1.00  7.69           N  ",
  "HETATM 1090  NAO JQ1 A   1      31.817  18.128   0.283  1.00  8.44           N  ",
  "HETATM 1091  NAP JQ1 A   1      32.044  17.250  -0.625  1.00  8.68           N  ",
  "HETATM 1092  OAQ JQ1 A   1      30.400  13.247  -3.384  1.00 10.41           O  ",
  "HETATM 1093  SAR JQ1 A   1      27.810  16.331   1.456  1.00  8.19           S  ",
  "HETATM 1094  CAS JQ1 A   1      31.475  13.972  -3.665  1.00 13.62           C  ",
  "HETATM 1095  CAT JQ1 A   1      28.375  16.220  -2.489  1.00  7.13           C  ",
  "HETATM 1096  CAU JQ1 A   1      25.880  17.822  -5.542  1.00  8.01           C  ",
  "HETATM 1097  CAV JQ1 A   1      30.534  18.050   0.671  1.00  7.28           C  ",
  "HETATM 1098  CAW JQ1 A   1      27.522  16.765  -3.512  1.00  6.19           C  ",
  "HETATM 1099  CAX JQ1 A   1      26.460  15.625   0.646  1.00  7.78           C  ",
  "HETATM 1100  CAY JQ1 A   1      26.696  15.557  -0.722  1.00  7.26           C  ",
  "HETATM 1101  CAZ JQ1 A   1      30.894  16.581  -0.833  1.00  7.50           C  ",
  "HETATM 1102  CBA JQ1 A   1      27.931  16.125  -1.137  1.00  8.00           C  ",
  "HETATM 1103  CBB JQ1 A   1      28.660  16.602  -0.030  1.00  6.74           C  ",
  "HETATM 1104  CBC JQ1 A   1      30.646  15.463  -1.866  1.00  9.05           C  ",
  "HETATM 1105  NBD JQ1 A   1      29.932  17.088  -0.061  1.00  7.77           N  ",
  "HETATM 1106  CBE JQ1 A   1      29.731  12.302  -4.299  1.00 14.82           C  ",
].join("\n");
const observedRegions = [
  ...new Map(
    observedJq1.split("\n").map((line) => {
      const region = {
        chain: line.slice(21, 22).trim(),
        number: Number(line.slice(22, 26)),
        insertion_code: line.slice(26, 27).trim(),
        resname: line.slice(17, 20),
      };
      return [JSON.stringify(region), region];
    }),
  ).values(),
];
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Viewer boundary</div>,
}));
vi.mock("./SurfaceRegionPicker", () => ({
  SurfaceRegionPicker: ({
    source,
    onChange,
  }: {
    source: MoleculeRef;
    onChange(v: unknown): void;
  }) => (
    <div>
      <output aria-label="Region source">{JSON.stringify(source)}</output>
      <button
        type="button"
        disabled={source.sha256 === archiveReferences.receptor.sha256}
        onClick={() =>
          onChange(
            source.sha256 === archiveReferences.brd4_alt_a.sha256
              ? observedRegions
              : [{ chain: "A", number: 1, insertion_code: "", resname: "JQ1" }],
          )
        }
      >
        Select observed JQ1
      </button>
    </div>
  ),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    value,
    onChange,
  }: {
    value: unknown;
    onChange(v: unknown): void;
  }) => (
    <div>
      {value ? "Selected structure" : "New structure required"}
      <button type="button" onClick={() => onChange(ref)}>
        Choose source
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({ ...ref, asset_id: "replacement", sha256: "b".repeat(64) })
        }
      >
        Replace source
      </button>
    </div>
  ),
}));
beforeEach(() => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : [],
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("uses the explicitly loaded public structure even when no computed exposure result is pinned", () => {
  const example = {
    request: null,
    objects: { brd4_alt_a: { reference: ref } },
  } as unknown as PreparedExample;
  render(
    <ExampleContext.Provider value={example}>
      <SurfaceForm language="en" onCreated={vi.fn()} />
    </ExampleContext.Provider>,
  );
  expect(screen.getByText("Selected structure")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});
it("starts empty and submits exact region only from the reviewed final step", async () => {
  const user = userEvent.setup(),
    submit = vi
      .spyOn(api, "submit")
      .mockRejectedValue(new Error("Native boundary"));
  render(<SurfaceForm language="en" onCreated={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose source" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Select observed JQ1" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Standard (recommended)" }),
  ).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Fine sampling" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "Fine sampling" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate exposure and burial" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Native boundary");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: "surface_exposure",
      structure: ref,
      scientific_inputs: [ref],
      regions: [{ chain: "A", number: 1, insertion_code: "", resname: "JQ1" }],
      options: expect.objectContaining({
        sphere_points: 1920,
        probe_radius_angstrom: 1.4,
        context_chains: [],
      }),
    }),
    expect.any(String),
  );
});
it("clears previous region and custom conditions when the source changes", async () => {
  const user = userEvent.setup();
  render(
    <SurfaceForm language="en" onCreated={vi.fn()} initialStructure={ref} />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Select observed JQ1" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Replace source" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

it("binds the archive fallback to the observed 31-atom JQ1 complex and submits its exact identity", async () => {
  const user = userEvent.setup();
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("Native boundary"));
  const example = {
    request: null,
    objects: {
      receptor: { reference: archiveReferences.receptor },
      brd4_alt_a: { reference: archiveReferences.brd4_alt_a },
    },
  } as unknown as PreparedExample;
  expect(observedJq1.split("\n")).toHaveLength(31);
  expect(observedRegions).toEqual([
    { chain: "A", number: 1, insertion_code: "", resname: "JQ1" },
  ]);
  render(
    <ExampleContext.Provider value={example}>
      <SurfaceForm language="en" onCreated={vi.fn()} />
    </ExampleContext.Provider>,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    JSON.parse(screen.getByLabelText("Region source").textContent!),
  ).toEqual(archiveReferences.brd4_alt_a);
  await user.click(screen.getByRole("button", { name: "Select observed JQ1" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate exposure and burial" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Native boundary");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      structure: archiveReferences.brd4_alt_a,
      scientific_inputs: [archiveReferences.brd4_alt_a],
      regions: observedRegions,
    }),
    expect.any(String),
  );
});
it.each(["pinned", "explicit", "receptor-only"] as const)(
  "preserves %s structure precedence",
  async (mode) => {
    const user = userEvent.setup();
    const pinned = { ...ref, asset_id: "pinned-surface" };
    const explicit = { ...ref, asset_id: "explicit-structure" };
    const example = {
      request:
        mode === "receptor-only"
          ? null
          : {
              operation: "surface_exposure",
              structure: pinned,
              regions: [],
              options: surfaceDefaults,
            },
      objects: {
        receptor: { reference: archiveReferences.receptor },
        ...(mode === "receptor-only"
          ? {}
          : { brd4_alt_a: { reference: archiveReferences.brd4_alt_a } }),
      },
    } as unknown as PreparedExample;
    render(
      <ExampleContext.Provider value={example}>
        <SurfaceForm
          language="en"
          onCreated={vi.fn()}
          initialStructure={mode === "explicit" ? explicit : undefined}
        />
      </ExampleContext.Provider>,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      JSON.parse(screen.getByLabelText("Region source").textContent!),
    ).toEqual(
      mode === "explicit"
        ? explicit
        : mode === "pinned"
          ? pinned
          : archiveReferences.receptor,
    );
  },
);
