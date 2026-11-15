import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { BackendControls } from "./BackendControls";

vi.mock("../api", () => ({ request: vi.fn(), api: { post: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const entry = {
  id: "chemistry",
  name: "RDKit",
  ready: true,
  enabled: false,
  active: false,
};
it("does not start engines on mount, offers only explicit available switches", async () => {
  vi.mocked(request).mockResolvedValue({
    engines: [entry, { ...entry, id: "admet", name: "ADMET-AI", ready: false }],
  });
  const user = userEvent.setup();
  render(<BackendControls data={null} language="en" refresh={vi.fn()} />);
  expect(request).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Backend controls" }));
  const toggle = await screen.findByRole("switch", { name: "RDKit" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("switch", { name: "ADMET-AI" })).toBeDisabled();
  vi.mocked(api.post).mockResolvedValue({ enabled: true });
  vi.mocked(request).mockResolvedValue({
    engines: [{ ...entry, enabled: true }],
  });
  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  expect(api.post).toHaveBeenCalledWith(
    "/runtime-controls/chemistry/start",
    {},
  );
  vi.mocked(api.post).mockResolvedValue({ enabled: false });
  vi.mocked(request).mockResolvedValue({ engines: [entry] });
  await user.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  expect(api.post).toHaveBeenLastCalledWith(
    "/runtime-controls/chemistry/stop",
    {},
  );
});
it("keeps failed changes off and prevents stopping active tasks", async () => {
  vi.mocked(request).mockResolvedValue({ engines: [entry] });
  vi.mocked(api.post).mockRejectedValue(new Error("conflict"));
  render(<BackendControls data={null} language="en" refresh={vi.fn()} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Backend controls" }),
  );
  await userEvent.click(await screen.findByRole("switch", { name: "RDKit" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("switch", { name: "RDKit" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  cleanup();
  vi.mocked(request).mockResolvedValue({
    engines: [{ ...entry, enabled: true, active: true }],
  });
  render(<BackendControls data={null} language="en" refresh={vi.fn()} />);
  await userEvent.click(
    screen.getByRole("button", { name: "Backend controls" }),
  );
  expect(await screen.findByRole("switch", { name: "RDKit" })).toBeDisabled();
});
