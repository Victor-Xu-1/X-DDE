import { afterEach, expect, it, vi } from "vitest";
import { ApiError, request } from "./api";
afterEach(() => vi.restoreAllMocks());
it("retains HTTP status without changing established error messages", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ detail: "Source changed" }),
  } as Response);
  try {
    await request("/test");
    expect.fail("Request should fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect(String(error)).toBe("Error: Source changed");
  }
});
