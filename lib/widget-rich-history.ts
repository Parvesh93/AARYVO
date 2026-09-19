import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

let ready: Promise<void> | null = null;

async function ensureTable() {
  if (!ready) {
    ready = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS widget_message_rich (
        id VARCHAR(191) PRIMARY KEY,
        messageId VARCHAR(191) NOT NULL,
        conversationId VARCHAR(191) NOT NULL,
        uiJson LONGTEXT NULL,
        productsJson LONGTEXT NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uniq_widget_message_rich_message(messageId),
        INDEX idx_widget_message_rich_conversation(conversationId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => undefined);
  }
  return ready;
}

export async function saveWidgetRichMessage(input: {
  messageId: string;
  conversationId: string;
  ui?: unknown;
  products?: unknown;
}) {
  const hasUi = input.ui !== null && input.ui !== undefined;
  const hasProducts = Array.isArray(input.products) && input.products.length > 0;
  if (!hasUi && !hasProducts) return;

  await ensureTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO widget_message_rich(id,messageId,conversationId,uiJson,productsJson)
     VALUES(?,?,?,?,?)
     ON DUPLICATE KEY UPDATE uiJson=VALUES(uiJson),productsJson=VALUES(productsJson)`,
    randomUUID(),
    input.messageId,
    input.conversationId,
    hasUi ? JSON.stringify(input.ui) : null,
    hasProducts ? JSON.stringify(input.products) : null,
  );
}

export async function getWidgetRichMessages(conversationId: string) {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<Array<{
    messageId: string;
    uiJson: string | null;
    productsJson: string | null;
  }>>(
    `SELECT messageId,uiJson,productsJson
     FROM widget_message_rich
     WHERE conversationId=?`,
    conversationId,
  );

  const parse = (value: string | null) => {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  };

  return new Map(
    rows.map((row) => [
      row.messageId,
      {
        ui: parse(row.uiJson),
        products: parse(row.productsJson),
      },
    ]),
  );
}
