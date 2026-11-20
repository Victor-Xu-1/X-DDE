import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UtilityTask } from "./UtilityTask";
import * as client from "../api";
import type { Asset } from "../operations/types";
import type { Job } from "../types";
import type { ImageMolecule } from "./image-molecule";
import { StateForm } from "../chemistry/StateForm";

vi.mock("../operations/OperationResults", () => ({
  OperationResults: ({ onCreated }: { onCreated(job: Job): void }) => (
    <StateForm language="en" onCreated={onCreated} />
  ),
}));

vi.mock("../examples/ExampleActions", () => ({ ExampleActions: () => null }));
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Loaded molecular structure</span>,
}));
vi.mock("./image-molecule", async (original) => ({
  ...(await original<object>()),
  imageMoleculeFile: async (molecule: ImageMolecule) =>
    new File([molecule.molfile], "image-structure.sdf"),
}));
vi.mock("./ImageMoleculeDialog", () => ({
  ImageMoleculeDialog: ({
    automatic,
    initialMolecule,
    mode,
    onAccept,
    onClose,
    file,
  }: {
    automatic: boolean;
    initialMolecule?: ImageMolecule;
    mode: string;
    file: File;
    onAccept(value: ImageMolecule, file: File): Promise<void>;
    onClose(): void;
  }) =>
    mode === "hidden" ? null : (
      <div role="dialog" aria-label="Image import">
        <span>
          {automatic ? "Automatic image import" : "Edit current graph"}
        </span>
        <button
          onClick={() =>
            void onAccept(
              initialMolecule ?? { smiles: "Nc1ccccc1", molfile: "M  END\n" },
              file,
            )
          }
        >
          Finish protocol import
        </button>
        <button onClick={() => onClose()}>Cancel import</button>
      </div>
    ),
}));
const asset: Asset = {
  id: "image-input",
  name: "image-structure.sdf",
  suffix: ".sdf",
  kind: "ligand",
  size: 128,
  sha256: "a".repeat(64),
  created_at: "2026-11-17",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  ["admet", "Predict properties"],
  ["brain", "Assess brain penetration"],
  ["properties", "Calculate properties"],
  ["states", "Prepare states and conformers"],
] as const)(
  "%s attaches the offered drawing only on explicit acceptance",
  async (tool, run) => {
    const attached = {
      ...asset,
      id: "editor-input",
      name: "editor-structure.sdf",
    };
    vi.spyOn(client, "request").mockImplementation(async (url) => {
      if (String(url).endsWith("/metadata")) return attached as never;
      return { items: [], files: [], total: 0 } as never;
    });
    const upload = vi.spyOn(client.api, "upload").mockResolvedValue(attached);
    const submit = vi
      .spyOn(client.api, "submit")
      .mockResolvedValue({ id: "not-used" } as never);
    const onDrawingHandled = vi.fn();
    const drawing = {
      id: "offer",
      molecule: { smiles: "CN", molfile: "M  END\n" },
    };
    const { rerender } = render(
      <UtilityTask
        tool={tool}
        language="en"
        onCreated={vi.fn()}
        drawing={drawing}
        onDrawingHandled={onDrawingHandled}
      />,
    );
    expect(screen.getByRole("group", { name: "Drawing ready" })).toBeVisible();
    expect(upload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Use as input" }));
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0].name).toBe("editor-structure.sdf");
    await waitFor(() =>
      expect(onDrawingHandled).toHaveBeenCalledExactlyOnceWith("offer"),
    );
    rerender(<UtilityTask tool={tool} language="en" onCreated={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: run })).toBeEnabled(),
    );
    expect(submit).not.toHaveBeenCalled();
  },
);

it.each([
  ["admet", "Predict properties"],
  ["brain", "Assess brain penetration"],
  ["properties", "Calculate properties"],
  ["screen", "Run library selection"],
  ["states", "Prepare states and conformers"],
] as const)(
  "%s accepts screenshot input directly and still requires an explicit calculation",
  async (tool, run) => {
    vi.spyOn(client, "request").mockImplementation(async (url) => {
      if (String(url).endsWith("/metadata")) return asset as never;
      return { items: [], files: [], total: 0 } as never;
    });
    const upload = vi.spyOn(client.api, "upload").mockResolvedValue(asset);
    const submit = vi
      .spyOn(client.api, "submit")
      .mockResolvedValue({ id: "not-used" } as never);
    render(<UtilityTask tool={tool} language="en" onCreated={vi.fn()} />);
    const uploadLabel =
      tool === "screen" ? "Upload library image" : "Upload structure image";
    expect(screen.getAllByRole("button", { name: uploadLabel })).toHaveLength(1);
    if (tool === "screen")
      expect(screen.getByRole("button", { name: "Upload query image" })).toBeVisible();
    const surface = screen.getByRole("button", { name: uploadLabel }).closest(".image-molecule-input")!;
    fireEvent.paste(surface, {
      clipboardData: {
        files: [new File(["transport"], "stat6.png", { type: "image/png" })],
      },
    });
    expect(screen.getByText("Automatic image import")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Finish protocol import" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(upload).toHaveBeenCalledOnce();
    expect(await screen.findByText("Loaded molecular structure")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: run })).toBeEnabled(),
    );
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation", { name: "Task steps" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit recognized structure" }),
    );
    expect(screen.getByText("Edit current graph")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel import" }),
    );
    expect(submit).not.toHaveBeenCalled();
  },
);

it("switching away preserves the form draft and rejects a delayed image upload", async () => {
  vi.spyOn(client, "request").mockResolvedValue(asset);
  let finish!: (value: Asset) => void;
  vi.spyOn(client.api, "upload").mockImplementation(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const view = render(
    <UtilityTask tool="properties" language="en" onCreated={vi.fn()} />,
  );
  const surface = document.querySelector(".utility-image-entry")!;
  fireEvent.drop(surface, {
    dataTransfer: {
      files: [new File(["transport"], "stat6.png", { type: "image/png" })],
    },
  });
  await userEvent.click(screen.getByText("Finish protocol import"));
  view.rerender(
    <UtilityTask
      tool="properties"
      language="en"
      active={false}
      onCreated={vi.fn()}
    />,
  );
  await act(async () => finish(asset));
  view.rerender(
    <UtilityTask tool="properties" language="en" onCreated={vi.fn()} />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Calculate properties" }),
  ).toBeDisabled();
});

it("keeps a follow-up screenshot and its pending submission separate from the parent result", async () => {
  const next = { ...asset, id: "followup-image", sha256: "b".repeat(64) };
  vi.spyOn(client, "request").mockImplementation(
    async (url) => (String(url).includes(next.id) ? next : asset) as never,
  );
  vi.spyOn(client.api, "upload")
    .mockResolvedValueOnce(asset)
    .mockResolvedValueOnce(next);
  let finish!: (job: Job) => void;
  const submit = vi
    .spyOn(client.api, "submit")
    .mockImplementationOnce(
      async (request) =>
        ({
          id: "parent-result",
          request,
          status: "succeeded",
          error: null,
        }) as never,
    )
    .mockImplementationOnce(
      () =>
        new Promise<Job>((resolve) => {
          finish = resolve;
        }),
    );
  const accepted = vi.fn();
  const view = render(
    <UtilityTask tool="properties" language="en" onCreated={accepted} />,
  );
  const paste = (target: Element) =>
    fireEvent.paste(target, {
      clipboardData: {
        files: [new File(["transport"], "stat6.png", { type: "image/png" })],
      },
    });
  paste(document.querySelector(".utility-image-entry")!);
  await userEvent.click(screen.getByText("Finish protocol import"));
  const run = screen.getByRole("button", { name: "Calculate properties" });
  await waitFor(() => expect(run).toBeEnabled());
  await userEvent.click(run);
  expect(
    await screen.findByRole("region", { name: "Current results" }),
  ).toBeVisible();
  const inputs = document.querySelectorAll(".utility-image-entry");
  expect(inputs).toHaveLength(2);
  paste(inputs[1]);
  await userEvent.click(screen.getByText("Finish protocol import"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("region", { name: "Current results" })).toBeVisible();
  const followup = screen.getByRole("button", {
    name: "Prepare states and conformers",
  });
  expect(followup).toBeEnabled();
  expect(submit).toHaveBeenCalledOnce();
  await userEvent.click(followup);
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("button", { name: "New task" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Edit inputs" })).toBeDisabled();
  view.rerender(
    <UtilityTask
      tool="properties"
      language="en"
      active={false}
      onCreated={accepted}
    />,
  );
  await act(async () =>
    finish({ id: "follow-up", status: "queued", error: null } as Job),
  );
  expect(accepted.mock.calls.map(([job]) => job.id)).toEqual([
    "parent-result",
    "follow-up",
  ]);
  view.rerender(
    <UtilityTask tool="properties" language="en" active onCreated={accepted} />,
  );
  expect(
    screen.getByRole("link", { name: "Task details & downloads" }),
  ).toHaveAttribute("href", "/#task=parent-result");
});
