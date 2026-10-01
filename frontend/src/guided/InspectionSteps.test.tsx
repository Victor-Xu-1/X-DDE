import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { InspectionSteps } from "./InspectionSteps";
import type { Job } from "../types";
it("requires preparation review, submits once, and never creates nested forms", async () => {
  const user = userEvent.setup(),
    submit = vi.fn(async () => ({ id: "native-inspection" }) as Job);
  const { container } = render(
    <form>
      <InspectionSteps
        language="en"
        label="Read atoms"
        subject={<p>Exact version</p>}
        busy={false}
        error=""
        onSubmit={submit}
      />
    </form>,
  );
  await user.click(screen.getByRole("button", { name: "Read atoms" }));
  expect(container.querySelectorAll("form")).toHaveLength(1);
  for (let i = 0; i < 3; i++) {
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next" }));
  }
  await user.click(screen.getByRole("button", { name: "Read atoms" }));
  expect(submit).toHaveBeenCalledOnce();
  expect(
    await screen.findByRole("link", { name: "Open task progress and results" }),
  ).toHaveAttribute("href", "/#task=native-inspection");
});
