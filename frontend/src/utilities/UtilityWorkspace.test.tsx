import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UtilityWorkspace } from "./UtilityWorkspace";
import { navigationItems } from "../studio/navigation-model";
import type { Job } from "../types";

vi.mock("./ImageRecognition", () => ({
  ImageRecognition: () => <input aria-label="Image editing" />,
}));
vi.mock("../admet/AdmetForm", () => ({
  AdmetForm: ({ onCreated }: { onCreated(job: Job): void }) => (
    <>
      <input aria-label="ADMET input" />
      <button onClick={() => onCreated({ id: "accepted" } as Job)}>
        Accept task
      </button>
    </>
  ),
}));
vi.mock("../operations/PropertyForm", () => ({
  PropertyForm: () => <input aria-label="Properties input" />,
}));
vi.mock("../chemistry/LibraryScreenForm", () => ({
  LibraryScreenForm: () => <input aria-label="Screen input" />,
}));
vi.mock("../chemistry/StateForm", () => ({
  StateForm: () => <input aria-label="States input" />,
}));
afterEach(cleanup);

it("places utilities first and preserves inputs while switching tools", async () => {
  expect(navigationItems[0].id).toBe("utilities");
  const user = userEvent.setup();
  render(<UtilityWorkspace language="en" onCreated={vi.fn()} />);
  await user.type(screen.getByLabelText("Image editing"), "retained image");
  expect(screen.queryByLabelText("ADMET input")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  await user.type(screen.getByLabelText("ADMET input"), "retained molecule");
  await user.click(
    screen.getByRole("button", { name: "Image recognition & editor" }),
  );
  expect(screen.getByLabelText("Image editing")).toHaveValue("retained image");
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  expect(screen.getByLabelText("ADMET input")).toHaveValue("retained molecule");
});

it("restarts only the submitted tool while preserving other unfinished work", async () => {
  const accepted = vi.fn(),
    user = userEvent.setup();
  render(<UtilityWorkspace language="en" onCreated={accepted} />);
  await user.type(screen.getByLabelText("Image editing"), "keep drawing");
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  await user.type(screen.getByLabelText("ADMET input"), "first task");
  await user.click(screen.getByRole("button", { name: "Accept task" }));
  expect(accepted).toHaveBeenCalledWith({ id: "accepted" });
  await user.click(screen.getByRole("button", { name: "New task" }));
  expect(screen.getByLabelText("ADMET input")).toHaveValue("");
  await user.click(
    screen.getByRole("button", { name: "Image recognition & editor" }),
  );
  expect(screen.getByLabelText("Image editing")).toHaveValue("keep drawing");
});
