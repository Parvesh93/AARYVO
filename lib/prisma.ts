import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseDatabaseUrl(rawValue?: string): DbConfig {
  if (!rawValue) throw new Error("DATABASE_URL is not configured");

  const raw = rawValue.trim().replace(/^['\"]|['\"]$/g, "");
  if (!raw.startsWith("mysql://")) {
    throw new Error("DATABASE_URL must start with mysql://");
  }

  const value = raw.slice("mysql://".length);
  const atIndex = value.lastIndexOf("@");
  if (atIndex <= 0) throw new Error("DATABASE_URL is missing database host");

  const credentials = value.slice(0, atIndex);
  const target = value.slice(atIndex + 1);
  const colonIndex = credentials.indexOf(":");
  if (colonIndex <= 0) throw new Error("DATABASE_URL is missing username or password");

  const user = decode(credentials.slice(0, colonIndex));
  const password = decode(credentials.slice(colonIndex + 1));

  const slashIndex = target.indexOf("/");
  if (slashIndex <= 0) throw new Error("DATABASE_URL is missing database name");

  const hostPort = target.slice(0, slashIndex);
  const databaseWithQuery = target.slice(slashIndex + 1);
  const database = decode(databaseWithQuery.split("?")[0]);

  const lastColon = hostPort.lastIndexOf(":");
  let host = hostPort;
  let port = 3306;
  if (lastColon > 0 && /^\d+$/.test(hostPort.slice(lastColon + 1))) {
    host = hostPort.slice(0, lastColon);
    port = Number(hostPort.slice(lastColon + 1));
  }

  if (!host || !user || !database) throw new Error("DATABASE_URL is incomplete");

  return { host, port, user, password, database };
}

function createPrismaClient() {
  const config = parseDatabaseUrl(process.env.DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 5,
    connectTimeout: 5000,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
