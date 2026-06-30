export const inactiveSessionExpiredToastCopy = {
  message: "You have been disconnected after 7 days of inactivity. Pair this device again.",
  title: "Connection expired",
} as const;

type InactiveSessionExpiredListener = () => void;

const inactiveSessionExpiredListeners = new Set<InactiveSessionExpiredListener>();
let inactiveSessionExpiredNoticePending = false;

export function isClientTokenExpiredByInactivity(
  expiresAt: string | undefined,
  nowMs = Date.now(),
) {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

export function shouldClearClientSessionForInvalidStatus(
  status: number,
  expiresAt: string | undefined,
  nowMs = Date.now(),
) {
  return status === 410 || isClientTokenExpiredByInactivity(expiresAt, nowMs);
}

export function markInactiveSessionExpired() {
  if (inactiveSessionExpiredNoticePending) {
    return;
  }

  inactiveSessionExpiredNoticePending = true;
  for (const listener of inactiveSessionExpiredListeners) {
    listener();
  }
}

export function consumeInactiveSessionExpiredNotice() {
  if (!inactiveSessionExpiredNoticePending) {
    return false;
  }

  inactiveSessionExpiredNoticePending = false;
  return true;
}

export function subscribeInactiveSessionExpired(listener: InactiveSessionExpiredListener) {
  inactiveSessionExpiredListeners.add(listener);
  return () => {
    inactiveSessionExpiredListeners.delete(listener);
  };
}
