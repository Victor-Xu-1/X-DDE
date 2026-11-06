import { expect, it } from "vitest";
import { historicalStudies } from "./prediction-history-model";

const id = "8cb693ab-e83f-4170-98b3-016fe59987d5";
const ref = {
  asset_id: id,
  sha256: "d".repeat(64),
  record: 7,
  conformer: 2,
  version_id: "4d30f7d8-c1ec-5524-8d56-5db8d44012e3",
};
const sequence =
  "WFDGVLDLTKRCLRSYWSDRLIIGFISKQYVTSLLLNEPDGTFLLRFSDSEIGGITIAHVIRGQDGSPQIENIQPFSAKDLSIRSLGDRIRDLAQLKNLYPKKPKDEAFRSHYKPE";
const boltz = () => ({
  operation: "boltz_predict",
  payload: {
    kind: "boltz",
    components: [
      { id: "A", kind: "protein", value: sequence },
      { id: "B", kind: "ligand", value: "", source: ref },
    ],
    samples: 1,
    recycling_steps: 3,
    sampling_steps: 200,
    affinity: false,
  },
  options: { seed: 101 },
});

it("projects the recorded construct and exact ligand identity without mutating or adding MSA defaults", () => {
  const request = boltz(),
    original = JSON.stringify(request);
  const [study] = historicalStudies(request)!;
  expect(study.entities[0].component).toEqual({
    kind: "protein",
    value: sequence,
    count: 1,
    chain_ids: ["A"],
  });
  expect(study.entities[0].files).toEqual([]);
  expect(study.entities[1].component).toMatchObject({
    ligand_file: id,
    ligand_record: 7,
  });
  expect(study.entities[1].molecularFile?.reference).toEqual(ref);
  expect(
    study.settings.find(
      (entry) => entry.label[1] === "Model affinity prediction",
    )?.value,
  ).toBe(false);
  expect(JSON.stringify(request)).toBe(original);
});
it("reads native documents without inventing model, samples, original residue numbering or an SDF entry", () => {
  const result = historicalStudies([
    {
      modelSeeds: [101],
      sequences: [
        {
          proteinChain: {
            sequence,
            count: 1,
            id: ["A"],
            unpairedMsaPath: `/job/assets/${id}.a3m`,
          },
        },
        { ligand: { ligand: `FILE_/job/assets/${id}.sdf`, count: 1 } },
      ],
    },
  ])![0];
  expect(result.entities[0].files[0].id).toBe(id);
  expect(result.entities[1].molecularFile?.id).toBe(id);
  expect(result.entities[1].component.ligand_file).toBeUndefined();
  expect(result.entities[1].component.ligand_record).toBeUndefined();
  expect(result.settings).toEqual([
    { label: ["随机种子", "Seeds"], value: "101" },
  ]);
});
it("never turns arbitrary native URLs or paths into browser requests", () => {
  for (const path of [
    "https://example.invalid/data.a3m",
    `/job/assets/../${id}.a3m`,
    `/mnt/e/${id}.a3m`,
  ]) {
    const data = historicalStudies([
      {
        sequences: [
          { proteinChain: { sequence, count: 1, unpairedMsaPath: path } },
        ],
      },
    ])!;
    expect(data[0].entities[0].files[0].id).toBeUndefined();
  }
});
it.each(["hhr", "json", "mol2", "pdb"])(
  "retains supported native .%s downloads without guessing molecular records",
  (suffix) => {
    const result = historicalStudies([
      {
        sequences: [
          {
            proteinChain: {
              sequence,
              count: 1,
              templatesPath: `/job/assets/${id}.${suffix}`,
            },
          },
          { ligand: { ligand: `FILE_/job/assets/${id}.${suffix}`, count: 1 } },
        ],
      },
    ])![0];
    expect(result.entities[0].files[0].id).toBe(id);
    expect(result.entities[1].molecularFile?.id).toBe(id);
    expect(result.entities[1].component.ligand_record).toBeUndefined();
  },
);
it("preserves OpenDDE's complete unsigned seed range without changing Mol-1 bounds", () => {
  const native = historicalStudies([
    {
      modelSeeds: [2147483648, 4294967295],
      sequences: [{ proteinChain: { sequence, count: 1 } }],
    },
  ])![0];
  expect(native.settings[0].value).toBe("2147483648, 4294967295");
  const components = [{ kind: "protein", value: sequence, count: 1 }];
  const result = historicalStudies({
    operation: "predict",
    components,
    parameters: { seed: 4294967295, additional_seeds: [2147483648] },
  })![0];
  expect(
    result.settings.find((s) => s.label[1] === "Additional seeds")?.value,
  ).toBe("2147483648");
  const mol1 = historicalStudies({
    operation: "mol1_predict",
    payload: { kind: "mol1", components, additional_seeds: [2147483648] },
  })![0];
  expect(mol1.settings.some((s) => s.label[1] === "Additional seeds")).toBe(
    false,
  );
});
it("joins Mol-1 file components only to their own exact recorded references", () => {
  const request = {
    operation: "mol1_predict",
    payload: {
      kind: "mol1",
      components: [{ kind: "ligand", value: "", count: 1, ligand_file: id }],
      samples: 5,
    },
    inputs: [{ role: "ligand", source: ref }],
  };
  expect(
    historicalStudies(request)![0].entities[0].component.ligand_record,
  ).toBe(7);
  expect(
    historicalStudies({ ...request, inputs: [] })![0].entities[0].component
      .ligand_file,
  ).toBeUndefined();
  expect(
    historicalStudies({
      ...request,
      inputs: [
        ...request.inputs,
        { role: "ligand", source: { ...ref, record: 1 } },
      ],
    }),
  ).toBeNull();
});
it("retains explicit native chain copies, modifications and all study records", () => {
  const input = {
    sequences: [
      {
        proteinChain: {
          sequence: "ACDE",
          count: 2,
          id: ["A", "C"],
          modifications: [{ ptmPosition: 3, ptmType: "CCD_MSE" }],
        },
      },
    ],
  };
  const studies = historicalStudies([input, input])!;
  expect(studies).toHaveLength(2);
  expect(studies[1].entities[0].component).toMatchObject({
    count: 2,
    chain_ids: ["A", "C"],
    modifications: [{ position: 3, ccd: "CCD_MSE" }],
  });
});
it.each([
  null,
  {},
  [],
  { operation: "mol1_predict", payload: boltz().payload },
  {
    ...boltz(),
    payload: {
      ...boltz().payload,
      components: [{ kind: "other", value: "ACDE", id: "A" }],
    },
  },
  {
    ...boltz(),
    payload: {
      ...boltz().payload,
      components: [
        { id: "B", kind: "ligand", value: "", source: { ...ref, record: -1 } },
      ],
    },
  },
  [{ sequences: [{ proteinChain: { sequence, count: 0 } }] }],
  [
    {
      sequences: [
        { proteinChain: { sequence, count: 1 } },
        { unsupported: {} },
      ],
    },
  ],
])("falls back honestly for unknown or ambiguous document %j", (value) => {
  expect(historicalStudies(value)).toBeNull();
});
