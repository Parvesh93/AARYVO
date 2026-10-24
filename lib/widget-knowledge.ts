/**
 * Merchant-authored policies are first-party store facts. Keep them ahead of
 * historical website crawl pages and synced product content when a customer
 * asks about returns, shipping or another store policy.
 *
 * This module is deliberately independent of Prisma so it can be regression
 * tested without a database or an OpenAI request.
 */
export type WidgetKnowledgeItem = {
  title: string | null;
  source: string;
  content: string;
  createdAt?: Date | string;
};

type PolicyTopic = "returns" | "shipping" | "cancellation" | "payments" | "warranty" | "privacy";

const POLICY_PATTERNS: Array<{topic: PolicyTopic; pattern: RegExp}> = [
  { topic: "returns", pattern: /\b(return(?:s|ed|ing)?|refund(?:s|ed)?|exchange(?:s|d)?|replacement(?:s)?)\b/i },
  { topic: "shipping", pattern: /\b(shipping|ship(?:ped|ment|ments)?|deliver(?:y|ies|ed)?|dispatch|courier)\b/i },
  { topic: "cancellation", pattern: /\b(cancel(?:led|lation|lations|ing)?|cancellation)\b/i },
  { topic: "payments", pattern: /\b(payment(?:s)?|cash on delivery|cod|prepaid|pay on delivery)\b/i },
  { topic: "warranty", pattern: /\b(warrant(?:y|ies)|guarantee(?:s)?)\b/i },
  { topic: "privacy", pattern: /\b(privacy|personal data|data protection)\b/i },
];

const TOPIC_TERMS: Record<PolicyTopic, RegExp> = {
  returns: /\b(return(?:s|ed|ing)?|refund(?:s|ed)?|exchange(?:s|d)?|replacement(?:s)?)\b/i,
  shipping: /\b(shipping|ship(?:ped|ment|ments)?|deliver(?:y|ies|ed)?|dispatch|courier)\b/i,
  cancellation: /\b(cancel(?:led|lation|lations|ing)?|cancellation)\b/i,
  payments: /\b(payment(?:s)?|cash on delivery|cod|prepaid)\b/i,
  warranty: /\b(warrant(?:y|ies)|guarantee(?:s)?)\b/i,
  privacy: /\b(privacy|personal data|data protection)\b/i,
};

export function requestedPolicyTopic(message: string): PolicyTopic | null {
  // "Do you provide returns?" and "What's your refund policy?" are policy
  // questions, not requests to search product titles.
  if (!message || message.length > 3000) return null;
  return POLICY_PATTERNS.find(p => p.pattern.test(message))?.topic || null;
}

function policyScore(item: WidgetKnowledgeItem, topic: PolicyTopic | null): number {
  if (!topic) return 0;
  const title = item.title || "";
  const body = item.content.slice(0, 8000);
  const pattern = TOPIC_TERMS[topic];
  if (pattern.test(title)) return 100;
  if (pattern.test(body) && /\b(policy|policies|faq|terms|store information)\b/i.test(title)) return 35;
  if (pattern.test(body)) return 12;
  return 0;
}

function createdTime(item: WidgetKnowledgeItem) {
  const value = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

export function rankWidgetKnowledge<T extends WidgetKnowledgeItem>(items: T[], message: string): T[] {
  const topic = requestedPolicyTopic(message);
  return items
    .filter(item => !item.source.startsWith("shopify://") && Boolean(item.content.trim()))
    .sort((a, b) => {
      const scoreA = policyScore(a, topic) + (a.source.startsWith("manual:") ? 30 : 0);
      const scoreB = policyScore(b, topic) + (b.source.startsWith("manual:") ? 30 : 0);
      return scoreB - scoreA || createdTime(b) - createdTime(a);
    });
}

export function matchingManualPolicy<T extends WidgetKnowledgeItem>(items: T[], message: string): T | null {
  const topic = requestedPolicyTopic(message);
  if (!topic) return null;
  const candidates = items
    .filter(item => item.source.startsWith("manual:") &&
      Boolean(item.content.trim()) && policyScore(item, topic) > 0)
    .sort((a,b) => policyScore(b, topic) - policyScore(a, topic) ||
      createdTime(b) - createdTime(a));
  return candidates[0] || null;
}

/** Use the exact approved policy for short content, not an AI approximation. */
export function verifiedManualPolicyReply(item: WidgetKnowledgeItem): string | null {
  const body = item.content.trim();
  if (!body || body.length > 2700) return null;
  const heading = (item.title || "store policy").trim();
  return "Here's our " + heading + ":\n\n" + body;
}

/** Storefront knowledge scope: Shopify manual entries belong to the merchant
 * workspace, but crawled pages belong only to the current assistant. */
export function scopeWidgetKnowledge<T extends WidgetKnowledgeItem & {agentId: string}>(
  items: T[], activeAgentId: string,
) {
  return items.filter(item =>
    !item.source.startsWith("shopify://") &&
    (item.agentId === activeAgentId || item.source.startsWith("manual:")),
  );
}
