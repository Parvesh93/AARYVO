/**
 * Resolve a Shopify merchant's quota window without moving its start every
 * time Partner API pricing status is refreshed. Shopify may omit
 * currentBillingCycle during a trial or shortly after an installation.
 *
 * A null interval means the existing calendar-month quota fallback applies.
 * This function never changes subscription status or plan entitlements.
 */
type Window = { start: Date | null; end: Date | null };
type OldWindow = {
  plan: string;
  usagePeriodStart: Date | null;
  usagePeriodEnd: Date | null;
};
function validTime(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
export function resolveShopifyUsageWindow(input: {
  plan: string;
  currentBillingCycle: { startTime: string; endTime: string } | null;
  trialEndsAt: string | null;
  previous: OldWindow | null;
  now?: Date;
}): Window {
  const now = input.now || new Date();
  const cycleStart = validTime(input.currentBillingCycle?.startTime);
  const cycleEnd = validTime(input.currentBillingCycle?.endTime);
  if (cycleStart && cycleEnd && cycleStart <= now && cycleEnd > now &&
      cycleEnd > cycleStart) {
    return { start: cycleStart, end: cycleEnd };
  }

  const previousStart = validTime(input.previous?.usagePeriodStart);
  const previousEnd = validTime(input.previous?.usagePeriodEnd);
  const keepPrevious = input.previous?.plan === input.plan &&
    Boolean(previousStart && previousEnd &&
      previousStart <= now && previousEnd > now &&
      previousEnd > previousStart);

  const trialEnd = validTime(input.trialEndsAt);
  if (trialEnd && trialEnd > now) {
    // A trial window starts once. Do not replace its start with every
    // subsequent billing-status refresh.
    if (keepPrevious && previousEnd?.getTime() === trialEnd.getTime()) {
      return { start: previousStart!, end: previousEnd! };
    }
    return { start: now, end: trialEnd };
  }

  // Partner API did not supply a cycle. Preserve an existing valid cycle
  // only for the same plan; otherwise use a calendar month rather than
  // persist an ever-changing "now" as the beginning of usage.
  if (keepPrevious) return { start: previousStart!, end: previousEnd! };
  return { start: null, end: null };
}
