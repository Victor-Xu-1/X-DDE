import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ComponentLibrary } from "./ComponentLibrary";
import { deploymentFixture, packageOf } from "./fixtures";

afterEach(cleanup);
const packages = [
  packageOf("openmm", { name: "OpenMM" }),
  packageOf("openfe", { name: "OpenFE" }),
  packageOf("gromacs", { name: "GROMACS" }),
];
const execute = async (action: () => Promise<unknown>) => {
  await action();
};

it.each([true, false])(
  "shows every simulation engine directly, with installed status that cannot reinstall (zh=%s)",
  async (zh) => {
    const install = vi.fn();
    render(
      <ComponentLibrary
        data={deploymentFixture(packages, {
          installed: {
            openmm: { version: "1" },
            gromacs: { version: "1" },
            openfe: { version: "1" },
          },
        })}
        zh={zh}
        busy={false}
        execute={execute}
        install={install}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", {
        name: zh ? "动力学与结合自由能" : "Dynamics and binding free energy",
      }),
    );
    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
      "OpenMM",
      "GROMACS",
      "OpenFE",
    ]);
    expect(
      screen.queryByText(/Optional models|可选模型与配套组件/),
    ).not.toBeInTheDocument();
    for (const card of cards) {
      const status = within(card).getByRole("button", {
        name: zh ? "已安装" : "Installed",
      });
      expect(status).toBeDisabled();
      await user.click(status);
    }
    expect(install).not.toHaveBeenCalled();
  },
);

it("keeps the recommended installation separate from visible alternate engines", async () => {
  const install = vi.fn().mockResolvedValue(undefined);
  render(
    <ComponentLibrary
      data={deploymentFixture(packages)}
      zh={false}
      busy={false}
      execute={execute}
      install={install}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Dynamics and binding free energy" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Install recommended bundle" }),
  );
  expect(install).toHaveBeenCalledWith(["openmm", "openfe"]);
  await user.click(
    within(screen.getByRole("article", { name: "GROMACS" })).getByRole(
      "button",
      { name: "Install" },
    ),
  );
  expect(install).toHaveBeenLastCalledWith(["gromacs"]);
});
