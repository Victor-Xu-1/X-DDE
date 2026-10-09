import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { MethodSwitch } from "./MethodSwitch";
import { ModuleTaskPicker } from "./ModuleTaskPicker";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([
  ["predict", "Boltz-2", "boltz.predict"],
  ["mpnn", "LigandMPNN", "ligandmpnn.design"],
] as const)(
  "offers reviewed methods for %s without submitting a job",
  async (value, label, next) => {
    const change = vi.fn(),
      submit = vi.spyOn(client.api, "submit");
    vi.spyOn(client, "request").mockResolvedValue({
      availability: { configuration_present: true },
    });
    const user = userEvent.setup();
    render(<MethodSwitch value={value} language="en" onChange={change} />);
    expect(screen.getByRole("group", { name: "Backend method" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: label }));
    expect(change).toHaveBeenCalledExactlyOnceWith(next);
    expect(submit).not.toHaveBeenCalled();
  },
);
it("labels an unconfigured implementation without inventing installed status", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: false },
  });
  render(<MethodSwitch value="predict" language="en" onChange={vi.fn()} />);
  expect(
    await screen.findByRole("button", { name: /^Boltz-2.*Not configured/ }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /RFdiffusion|CODesign|Rosetta/ }),
  ).toBeNull();
});
it("selects the sole backend for a task and does not dispatch when clicked", async () => {
  const change = vi.fn(),
    user = userEvent.setup();
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  render(<MethodSwitch value="gnina.dock" language="en" onChange={change} />);
  const group = screen.getByRole("group", { name: "Backend method" });
  const selected = screen.getByRole("button", { name: /GNINA/ });
  expect(group).toBeVisible();
  expect(selected).toHaveAttribute("aria-pressed", "true");
  await user.click(selected);
  expect(change).not.toHaveBeenCalled();
});

it("switches dynamics from OpenMM to GROMACS without submitting a task", async () => {
  const change = vi.fn(),
    user = userEvent.setup();
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: false },
  });
  render(
    <MethodSwitch value="openmm.dynamics" language="en" onChange={change} />,
  );
  expect(
    screen.getByRole("button", { name: /OpenMM.*Default/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: /GROMACS/ }));
  expect(change).toHaveBeenCalledExactlyOnceWith("gromacs.dynamics");
});

it("selects a backend even for a task outside the research navigation groups", () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  render(
    <ModuleTaskPicker value="resources" language="en" onChange={vi.fn()} />,
  );
  expect(screen.getByRole("group", { name: "Backend method" })).toBeVisible();
  expect(screen.getByRole("button", { name: /Default/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
