import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReceptorForm } from "./ReceptorForm";
import * as client from "../api";
const ref = {
  asset_id: "r",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "v",
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    label,
    onChange,
    value,
  }: {
    label: string;
    onChange(v: unknown): void;
    value: unknown;
  }) => (
    <button type="button" onClick={() => onChange(ref)}>
      {label}
      {value ? " selected" : ""}
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function boundary(ready = false) {
  vi.spyOn(client, "request").mockImplementation(
    async () => ({ availability: { configuration_present: ready } }) as never,
  );
}
async function chooseTwo(user: ReturnType<typeof userEvent.setup>) {
  for (const n of [1, 2])
    await user.click(
      screen.getByRole("button", {
        name: `Receptor ${n} structural version`,
      }),
    );
}
it("retains comparison, expert parameters and name across steps/languages and blocks missing environment", async () => {
  boundary();
  const user = userEvent.setup(),
    submit = vi.spyOn(client.api, "submit");
  const { rerender } = render(
    <ReceptorForm language="en" onCreated={vi.fn()} />,
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await chooseTwo(user);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "How should these structures be compared?",
    }),
    "similar",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Expert settings" }));
  const options = screen.getByRole("textbox", {
    name: "Alignment and resource parameters (server validated)",
  }) as HTMLTextAreaElement;
  expect(JSON.parse(options.value)).toMatchObject({
    minimum_identity: 0.95,
    maximum_rmsd_angstrom: 5,
  });
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "retained name",
  );
  rerender(<ReceptorForm language="zh" onCreated={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "retained name",
  );
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(
    screen.getByRole("button", { name: "对齐并建立受体集合" }),
  ).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});
it("resets the alignment reference to a remaining structure when a member is removed after returning", async () => {
  boundary();
  const user = userEvent.setup();
  render(<ReceptorForm language="en" onCreated={vi.fn()} />);
  await chooseTwo(user);
  await user.click(
    screen.getByRole("button", { name: "Add receptor structure" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Receptor 3 structural version",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Which structure is the alignment reference?",
    }),
    "2",
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(
    within(screen.getByRole("region", { name: "Receptor 3" })).getByRole(
      "button",
      { name: "Remove structure" },
    ),
  );
  expect(
    screen.getAllByRole("region", { name: /^Receptor [0-9]+$/ }),
  ).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", {
      name: "Which structure is the alignment reference?",
    }),
  ).toHaveValue("0");
});
it("submits actual exact structure references only after review and shows the returned task", async () => {
  boundary(true);
  const user = userEvent.setup(),
    submit = vi
      .spyOn(client.api, "submit")
      .mockResolvedValue({ id: "aligned" } as never);
  render(<ReceptorForm language="en" onCreated={vi.fn()} />);
  await chooseTwo(user);
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Align and register receptor ensemble",
      }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Align and register receptor ensemble",
    }),
  );
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "receptor_ensemble",
    inputs: [{ structure: ref }, { structure: ref }],
    options: {
      reference_index: 0,
      minimum_identity: 1,
      maximum_rmsd_angstrom: 3,
    },
  });
  expect(
    await screen.findByRole("link", { name: "Open task progress and results" }),
  ).toHaveAttribute("href", "/#task=aligned");
});
