import { describe, expect, it } from "vitest";

import {
  consumeInactiveSessionExpiredNotice,
  isClientTokenExpiredByInactivity,
  markInactiveSessionExpired,
  shouldClearClientSessionForInvalidStatus,
  subscribeInactiveSessionExpired,
} from "../../../apps/mobile/src/lib/session-expiration.js";

describe("mobile session expiration notice", () => {
  it("detects inactivity expiry only when a stored token expiry has passed", () => {
    const now = Date.parse("2026-06-06T00:00:00.000Z");

    expect(isClientTokenExpiredByInactivity("2026-06-05T23:59:59.999Z", now)).toBe(true);
    expect(isClientTokenExpiredByInactivity("2026-06-06T00:00:00.001Z", now)).toBe(false);
    expect(isClientTokenExpiredByInactivity(undefined, now)).toBe(false);
    expect(isClientTokenExpiredByInactivity("not a date", now)).toBe(false);
  });

  it("keeps a locally valid session after transient auth failures", () => {
    const now = Date.parse("2026-06-06T00:00:00.000Z");
    const futureExpiry = "2026-06-06T00:00:00.001Z";

    expect(shouldClearClientSessionForInvalidStatus(401, futureExpiry, now)).toBe(false);
    expect(shouldClearClientSessionForInvalidStatus(403, futureExpiry, now)).toBe(false);
    expect(shouldClearClientSessionForInvalidStatus(410, futureExpiry, now)).toBe(true);
  });

  it("clears a locally expired session after auth failures", () => {
    const now = Date.parse("2026-06-06T00:00:00.000Z");
    const expiredAt = "2026-06-05T23:59:59.999Z";

    expect(shouldClearClientSessionForInvalidStatus(401, expiredAt, now)).toBe(true);
    expect(shouldClearClientSessionForInvalidStatus(403, expiredAt, now)).toBe(true);
  });

  it("notifies listeners once for the same pending inactive-expiry notice", () => {
    let notificationCount = 0;
    const unsubscribe = subscribeInactiveSessionExpired(() => {
      notificationCount += 1;
    });

    markInactiveSessionExpired();
    markInactiveSessionExpired();

    expect(notificationCount).toBe(1);
    expect(consumeInactiveSessionExpiredNotice()).toBe(true);
    expect(consumeInactiveSessionExpiredNotice()).toBe(false);

    markInactiveSessionExpired();
    expect(notificationCount).toBe(2);
    expect(consumeInactiveSessionExpiredNotice()).toBe(true);

    unsubscribe();
  });
});
