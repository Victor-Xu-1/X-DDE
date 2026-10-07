import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ScientificChoices } from "./ScientificChoices";

afterEach(cleanup);
it("keeps numerical native counts while presenting distinct selectable choices", async () => {
  const change = vi.fn();
  render(
    <ScientificChoices
      program="ligandmpnn"
      language="en"
      payload={{ kind: "ligandmpnn", candidates: 20 }}
      onChange={change}
      options={{ device: "cpu", cpu: 2, memory_mib: 4096, seed: 101 }}
      onOptions={vi.fn()}
      expert={false}
      onExpert={vi.fn()}
    />,
  );
  expect(screen.getByRole("radio", { name: "20 candidates" })).toBeChecked();
  await userEvent
    .setup()
    .click(screen.getByRole("radio", { name: "50 candidates" }));
  expect(change).toHaveBeenCalledExactlyOnceWith({ candidates: 50 });
});
