import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalUrl: text('original_url').notNull(),
    shortCode: text('short_code').notNull(),
    accessCount: integer('access_count').notNull().default(0),
    // Milissegundos garantem que o cursor JSON não perde precisão do timestamp.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('links_short_code_unique').on(table.shortCode),
    index('links_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
    check('links_access_count_nonnegative', sql`${table.accessCount} >= 0`),
    check(
      'links_short_code_valid',
      sql`${table.shortCode} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${table.shortCode}) <= 60`,
    ),
  ],
);

export type Link = typeof links.$inferSelect;
