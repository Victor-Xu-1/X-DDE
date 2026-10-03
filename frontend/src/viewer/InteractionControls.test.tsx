import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { InteractionControls } from "./InteractionControls";
it("offers a concise default and exact distance details without a fake strength scale", () => {
  const options = vi.fn();
  render(
    <InteractionControls
      language="zh"
      enabled
      labels
      limit={5}
      onChange={options}
      summary={{
        cutoff: 4,
        total: 14,
        shown: 5,
        residues: [{ label: "A:ASN140", distance: 3.39, tooClose: false }],
      }}
    />,
  );
  expect(screen.getByLabelText("关注残基")).toHaveValue("5");
  expect(screen.getByRole("status")).toHaveTextContent("5 / 14");
  fireEvent.change(screen.getByLabelText("关注残基"), {
    target: { value: "3" },
  });
  expect(options).toHaveBeenCalledWith({ contactLimit: 3 });
  fireEvent.change(screen.getByLabelText("关注残基"), {
    target: { value: "all" },
  });
  expect(options).toHaveBeenCalledWith({ contactLimit: "all" });
  fireEvent.click(screen.getByText("接触明细"));
  expect(screen.getByRole("cell", { name: "A:ASN140" })).toBeVisible();
  expect(screen.getByRole("cell", { name: "3.39 Å" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "相互作用显示说明" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "不是关键药效残基或作用强弱排名",
  );
});
it("keeps contact data out of an off or empty view", () => {
  const { rerender } = render(
    <InteractionControls
      language="en"
      enabled={false}
      labels
      limit={5}
      summary={null}
      onChange={vi.fn()}
    />,
  );
  expect(screen.queryByText("Contact details")).toBeNull();
  rerender(
    <InteractionControls
      language="en"
      enabled
      labels
      limit={3}
      summary={{ cutoff: 4, total: 0, shown: 0, residues: [] }}
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Contact details"));
  expect(screen.getByText("No contacts within 4 Å.")).toBeVisible();
});
