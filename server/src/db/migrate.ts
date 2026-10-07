import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './client.js';
import { readEnv } from '../env.js';

const { db, client } = createDatabase(readEnv().DATABASE_URL);
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  console.log('Migrations executadas com sucesso.');
} finally {
  await client.end();
}
