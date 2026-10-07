import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { links, type Link } from '../db/schema.js';
import { AppError, linkNotFound } from '../errors.js';
import type { CreateLinkInput } from '../validation.js';

const cursorSchema = z.object({ id: z.uuid(), createdAt: z.iso.datetime() });

function parseCursor(value: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'O cursor de paginação é inválido.');
  }
}

function encodeCursor(link: Link) {
  return Buffer.from(
    JSON.stringify({ id: link.id, createdAt: link.createdAt.toISOString() }),
  ).toString('base64url');
}

export function createLinkService({ db }: Database) {
  return {
    async create(input: CreateLinkInput) {
      const [link] = await db
        .insert(links)
        .values(input)
        .onConflictDoNothing({ target: links.shortCode })
        .returning();
      if (!link)
        throw new AppError(
          409,
          'SHORT_CODE_ALREADY_EXISTS',
          'Esse encurtamento já existe. Escolha outro.',
        );
      return link;
    },
    async list(limit: number, rawCursor?: string) {
      const cursor = rawCursor ? parseCursor(rawCursor) : undefined;
      const condition = cursor
        ? or(
            lt(links.createdAt, new Date(cursor.createdAt)),
            and(eq(links.createdAt, new Date(cursor.createdAt)), lt(links.id, cursor.id)),
          )
        : undefined;
      const rows = await db
        .select()
        .from(links)
        .where(condition)
        .orderBy(desc(links.createdAt), desc(links.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return { links: items, nextCursor: hasMore && last ? encodeCursor(last) : null };
    },
    async find(shortCode: string) {
      const [link] = await db.select().from(links).where(eq(links.shortCode, shortCode)).limit(1);
      if (!link) throw linkNotFound();
      return link;
    },
    async remove(id: string) {
      const [link] = await db.delete(links).where(eq(links.id, id)).returning({ id: links.id });
      if (!link) throw linkNotFound();
    },
    async increment(id: string) {
      // O incremento acontece no banco, sem perder acessos concorrentes.
      const [link] = await db
        .update(links)
        .set({ accessCount: sql`${links.accessCount} + 1` })
        .where(eq(links.id, id))
        .returning();
      if (!link) throw linkNotFound();
      return link;
    },
  };
}
