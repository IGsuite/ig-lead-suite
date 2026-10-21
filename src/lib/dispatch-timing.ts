/** Keep the normal idle heartbeat, but wake at the next recipient's deadline. */
export function dispatchWakeDelay(nextDue: Date | null, now = Date.now()): number {
  return nextDue ? Math.max(5, Math.min(60, Math.ceil((nextDue.getTime() - now) / 1000))) : 60;
}

/** Sub-minute deadlines must not collide with an already consumed minute wake-up. */
export function dispatchWakeSlot(delaySeconds: number, now = Date.now()): string {
  const due = now + delaySeconds * 1000;
  return delaySeconds > 0 && delaySeconds < 60 ? `precise:${Math.floor(due / 5000)}` : String(Math.floor(due / 60000));
}
