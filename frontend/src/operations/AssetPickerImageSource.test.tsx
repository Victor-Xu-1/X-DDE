import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAssetSources } from "./AssetPickerSources";
afterEach(cleanup);
function Harness({
  value,
  uploadKey,
  change,
}: {
  value: string;
  uploadKey?: string;
  change(value: string): void;
}) {
  const state = useAssetSources(value, true, change, uploadKey);
  return (
    <>
      <output>{state.source}</output>
      <button onClick={() => state.changeSource("saved")}>History</button>
    </>
  );
}
it("an image selects the new file without overwriting the previous historical choice", () => {
  const change = vi.fn();
  const view = render(<Harness value="original-history" change={change} />);
  expect(screen.getByText("saved")).toBeVisible();
  view.rerender(
    <Harness value="new-image" uploadKey="one-import" change={change} />,
  );
  expect(screen.getByText("file")).toBeVisible();
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("History"));
  expect(change).toHaveBeenCalledExactlyOnceWith("original-history");
});
