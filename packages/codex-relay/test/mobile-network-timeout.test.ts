import { afterEach, describe, expect, it, vi } from "vitest";

import { requestWithNetworkTimeout } from "../../../apps/mobile/src/lib/network-timeout.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("mobile network request timeout", () => {
  it("rejects requests when the network hangs", async () => {
    vi.useFakeTimers();

    const request = requestWithNetworkTimeout(
      new Promise<Response>(() => undefined),
      undefined,
      25,
    );
    const caught = request.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(25);

    await expect(caught).resolves.toMatchObject({ message: "Request timed out." });
  });
});
