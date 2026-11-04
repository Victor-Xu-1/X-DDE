import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProximityForm } from "./Form";
import { defaults } from "./generated";
import type { ScientificTask } from "../integrations/types";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  ready: true,
  verifyProtein: vi.fn(),
  protocol: "binary" as "binary" | "shared" | "glue",
  sameSource: false,
  example: null as { name?: string; options: ScientificTask["options"] } | null,
}));
vi.mock("../examples/context", async () => ({
  ...(await vi.importActual<typeof import("../examples/context")>(
    "../examples/context",
  )),
  useExampleTask: () => mocks.example,
}));
vi.mock("../operations/useTaskSubmit", () => ({
  useTaskSubmit: () => ({ busy: false, error: "", submit: mocks.submit }),
}));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: mocks.ready, error: "", recheck: vi.fn() }),
}));
vi.mock("../diffsbdd/reference-metadata", () => ({
  resolveReference: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../research/asset-file", () => ({
  readAssetFile: mocks.verifyProtein,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <div data-testid="structure-viewer">{urls.join(", ")}</div>
  ),
}));
vi.mock("./InitialMaterials", () => ({
  InitialMaterials: () => <p>Confirmed complete molecule</p>,
}));
vi.mock("./PartnerQuestion", () => ({
  PartnerQuestion: () => <p>Confirmed binary pose</p>,
}));
vi.mock("./useProximityDraft", async () => {
  const { useState } = await import("react");
  return {
    useProximityDraft: () => {
      const [payload, setPayload] = useState({
        ...defaults,
        partner_a_name: "Recruiter",
        partner_b_name: "Target",
        ...(mocks.protocol === "shared"
          ? {
              input_mode: "shared_complex",
              binding_region_a: [1, 3, 5],
              binding_region_b: [7, 9, 11],
            }
          : {}),
        ...(mocks.protocol === "glue" ? { mechanism: "molecular_glue" } : {}),
      });
      return {
        ligand: {
          asset_id: "full",
          sha256: "a".repeat(64),
          record: 0,
          conformer: 0,
        },
        first: {
          asset_id: "first",
          sha256: "b".repeat(64),
          record: 0,
          conformer: 0,
        },
        second: {
          asset_id: "second",
          sha256: (mocks.sameSource ? "b" : "c").repeat(64),
          record: 0,
          conformer: 0,
        },
        armA: {
          asset_id: "arm-a",
          sha256: "d".repeat(64),
          record: 0,
          conformer: 0,
        },
        armB: {
          asset_id: "arm-b",
          sha256: "e".repeat(64),
          record: 0,
          conformer: 0,
        },
        binary: mocks.protocol === "binary",
        firstReady: true,
        secondReady: true,
        planReady: true,
        payload,
        setPayload,
        onLigand: vi.fn(),
      };
    },
  };
});
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(null, {
          headers: {
            "X-Structure-Format": "sdf",
            "X-Structure-Record":
              new URL(url, "http://localhost").searchParams.get("record") ?? "",
          },
        }),
    ),
  );
});
afterEach(() => {
  cleanup();
  mocks.example = null;
  mocks.ready = true;
  mocks.protocol = "binary";
  mocks.sameSource = false;
  mocks.verifyProtein.mockReset();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function review(language: "en" | "zh" = "en") {
  const user = userEvent.setup();
  render(<ProximityForm language={language} onCreated={vi.fn()} />);
  for (let step = 0; step < 3; step++)
    await user.click(
      screen.getByRole("button", {
        name: language === "zh" ? "下一步" : "Next",
      }),
    );
  return user;
}
async function submitReviewed(user: ReturnType<typeof userEvent.setup>) {
  const dialog = within(screen.getByRole("dialog"));
  expect(mocks.submit).not.toHaveBeenCalled();
  await user.click(
    dialog.getByRole("button", { name: /Request JSON|提交内容/ }),
  );
  const reviewed = JSON.parse(
    dialog.getByLabelText(/X-DDE submission request|X-DDE 提交请求/)
      .textContent!,
  );
  await user.click(dialog.getByRole("button", { name: /Submit job|提交任务/ }));
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(reviewed),
  );
}

it("allows review while the engine is unavailable and retains settings when returning to edit", async () => {
  mocks.ready = false;
  const user = await review();
  const name = screen.getByRole("textbox", { name: "Task name (optional)" });
  await user.type(name, "STAT6 review");
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(await dialog.findByText("STAT6 review")).toBeVisible();
  expect(dialog.getByRole("button", { name: "Submit job" })).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "Back to edit" }));
  expect(name).toHaveValue("STAT6 review");
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("blocks confirmation when a selected file cannot be verified and retries in place", async () => {
  mocks.verifyProtein.mockRejectedValueOnce(new Error("changed file"));
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(await dialog.findByRole("alert")).toHaveTextContent(
    "could not be verified",
  );
  expect(dialog.getByRole("button", { name: "Submit job" })).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "Check files again" }));
  await submitReviewed(user);
});
it("submits the visible 4 GiB default through the real questionnaire and retains all five inputs", async () => {
  const user = await review();
  expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  await submitReviewed(user);
  const request = mocks.submit.mock.calls[0][0] as ScientificTask;
  expect(request.name).toBe("Induced proximity · ternary assemblies");
  expect(request.options).toEqual({
    device: "cpu",
    cpu: 2,
    memory_mib: 4096,
    seed: 31,
  });
  expect(request.inputs.map((i) => i.role)).toEqual([
    "ligand",
    "partner_a",
    "partner_b",
    "arm_a",
    "arm_b",
  ]);
  expect(request.scientific_inputs).toEqual(
    request.inputs.map((i) => i.source),
  );
  expect(request.payload.ligand_correction).toBe(true);
});
it("submits selected CPU/memory/seed values and keeps them when returning to the previous step", async () => {
  const user = await review();
  await user.click(screen.getByText("Expert settings"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "CPU threads" }),
    "1",
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Memory limit (GiB)" }),
    "8192",
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Random seed" }), {
    target: { value: "53" },
  });
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("1 CPU · 8 GiB")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  await submitReviewed(user);
  expect(mocks.submit.mock.calls[0][0].options).toEqual({
    device: "cpu",
    cpu: 1,
    memory_mib: 8192,
    seed: 53,
  });
});
it("blocks an invalid seed in the Chinese form and recovers without losing the selected budget", async () => {
  const user = await review("zh");
  await user.click(screen.getByText("专家微调"));
  fireEvent.change(screen.getByRole("spinbutton", { name: "随机种子" }), {
    target: { value: "-1" },
  });
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "预览任务" })).toBeDisabled();
  expect(mocks.submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton", { name: "随机种子" }), {
    target: { value: "31" },
  });
  expect(screen.getByRole("button", { name: "预览任务" })).toBeEnabled();
  expect(screen.getByText("2 CPU · 4 GiB")).toBeVisible();
});
it("preserves archived example resources rather than silently changing their reproduction", async () => {
  mocks.example = {
    options: { device: "cpu", cpu: 3, memory_mib: 6144, seed: 909 },
  };
  const user = await review();
  expect(screen.getByText("3 CPU · 6 GiB")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  await submitReviewed(user);
  expect(mocks.submit.mock.calls[0][0].options).toEqual(mocks.example.options);
});

it("submits the selected target anchor without changing protein roles or binary poses", async () => {
  const user = await review();
  await user.click(screen.getByText("Expert settings"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Fixed protein" }),
    "b",
  );
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  await submitReviewed(user);
  const request = mocks.submit.mock.calls[0][0] as ScientificTask;
  expect(request.payload.anchor_partner).toBe("b");
  expect(request.payload.partner_a_name).toBe("Recruiter");
  expect(request.payload.partner_b_name).toBe("Target");
  expect(request.inputs.map((input) => input.role)).toEqual([
    "ligand",
    "partner_a",
    "partner_b",
    "arm_a",
    "arm_b",
  ]);
  expect(request.options.memory_mib).toBe(4096);
});

it("keeps a chosen study name across review navigation and language switching", async () => {
  const user = userEvent.setup();
  const view = render(<ProximityForm language="en" onCreated={vi.fn()} />);
  for (let step = 0; step < 3; step++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "STAT6 / CRBN · R branch",
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  view.rerender(<ProximityForm language="zh" onCreated={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "STAT6 / CRBN · R branch",
  );
  await user.click(screen.getByRole("button", { name: "预览任务" }));
  await submitReviewed(user);
  expect(mocks.submit.mock.calls[0][0].name).toBe("STAT6 / CRBN · R branch");
});

it("prefills an example name and lets the researcher name their own variation", async () => {
  mocks.example = {
    name: "Reference ternary study",
    options: { device: "cpu", cpu: 2, memory_mib: 4096, seed: 31 },
  };
  const user = await review("zh");
  const field = screen.getByRole("textbox", { name: "任务名称（可选）" });
  expect(field).toHaveValue("Reference ternary study");
  await user.clear(field);
  await user.type(field, "  STAT6 三元复合物 S 构型  ");
  await user.click(screen.getByRole("button", { name: "预览任务" }));
  await submitReviewed(user);
  expect(mocks.submit.mock.calls[0][0].name).toBe("STAT6 三元复合物 S 构型");
  expect(mocks.example.name).toBe("Reference ternary study");
});

it.each(["x".repeat(81), "Study\u007f"])(
  "blocks a name outside the existing server contract and recovers without losing inputs",
  async (name) => {
    const user = await review();
    const field = screen.getByRole("textbox", { name: "Task name (optional)" });
    fireEvent.change(field, { target: { value: name } });
    expect(screen.getByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview job" })).toBeDisabled();
    expect(mocks.submit).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: " " } });
    await user.click(screen.getByRole("button", { name: "Preview job" }));
    await submitReviewed(user);
    expect(mocks.submit.mock.calls[0][0].name).toBe(
      "Induced proximity · ternary assemblies",
    );
    expect(mocks.submit.mock.calls[0][0].inputs).toHaveLength(5);
  },
);

it.each(["shared", "glue"] as const)(
  "renders a single intact source scene for %s and submits distinct chain roles",
  async (protocol) => {
    mocks.protocol = protocol;
    mocks.sameSource = true;
    const user = await review();
    await user.click(screen.getByRole("button", { name: "Preview job" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(
      await dialog.findByRole("tab", { name: "Reference complex" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(dialog.queryByRole("tab", { name: "Protein A" })).toBeNull();
    const scene = within(dialog.getByRole("tabpanel"));
    expect(scene.getByTestId("structure-viewer")).toHaveTextContent(
      /^\/api\/assets\/first$/,
    );
    expect(scene.getByText(/Recruiter · A, Target · B/)).toBeVisible();
    await user.click(dialog.getByRole("tab", { name: /^Complete molecule$/ }));
    expect(
      within(dialog.getByRole("tabpanel")).getByTestId("structure-viewer"),
    ).toHaveTextContent(/^\/api\/assets\/full\?record=0$/);
    expect(
      dialog.queryByRole("group", { name: "Inspect selected atoms" }) !== null,
    ).toBe(protocol === "shared");
    await submitReviewed(user);
    const request = mocks.submit.mock.calls[0][0] as ScientificTask;
    expect(request.inputs.map(({ role }) => role)).toEqual([
      "ligand",
      "partner_a",
      "partner_b",
    ]);
    expect(
      request.inputs.slice(1).map(({ source }) => source.asset_id),
    ).toEqual(["first", "second"]);
  },
);

it("does not combine independent molecular-glue files into a reference scene", async () => {
  mocks.protocol = "glue";
  const user = await review();
  await user.click(screen.getByRole("button", { name: "Preview job" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(await dialog.findByRole("tab", { name: "Protein A" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(dialog.queryByRole("tab", { name: "Reference complex" })).toBeNull();
});
