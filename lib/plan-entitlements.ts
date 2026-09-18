import type { PlanKey } from "@/lib/billing";

export const PLAN_RANK: Record<PlanKey, number> = {
  FREE: 0,
  STARTER: 1,
  GROWTH: 2,
  PRO: 3,
};

export const FEATURE_MIN_PLAN = {
  leadQualification: "STARTER",
  leadScoring: "STARTER",
  appointments: "STARTER",
  emailAlerts: "STARTER",
  whatsappHandoff: "STARTER",
  conversationHistory: "STARTER",
  shopifyIntegration: "STARTER",
  followUpWorkflow: "GROWTH",
  customWidgetBranding: "GROWTH",
  advancedWidgetControls: "GROWTH",
  customSmtp: "GROWTH",
  richAiActions: "STARTER",
  prioritySupport: "GROWTH",
  premiumSupport: "PRO",
  earlyAccess: "PRO",
} as const satisfies Record<string, PlanKey>;

export type PlanFeature = keyof typeof FEATURE_MIN_PLAN;

export function normalizePlan(plan: string | null | undefined): PlanKey {
  const value = String(plan || "FREE").toUpperCase();
  return value === "STARTER" || value === "GROWTH" || value === "PRO" ? value : "FREE";
}

export function hasFeature(plan: string | null | undefined, feature: PlanFeature) {
  const current = normalizePlan(plan);
  return PLAN_RANK[current] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function minimumPlan(feature: PlanFeature) {
  return FEATURE_MIN_PLAN[feature];
}

export function featureError(feature: PlanFeature) {
  const required = FEATURE_MIN_PLAN[feature];
  const labels: Record<PlanKey, string> = { FREE: "Free", STARTER: "Starter", GROWTH: "Growth", PRO: "Pro" };
  return `This feature requires the ${labels[required]} plan or higher.`;
}

export function entitlementsForPlan(plan: string | null | undefined) {
  return Object.fromEntries(
    (Object.keys(FEATURE_MIN_PLAN) as PlanFeature[]).map((feature) => [feature, hasFeature(plan, feature)]),
  ) as Record<PlanFeature, boolean>;
}
