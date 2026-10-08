import { readEnv } from './env.js';
import { createDatabase } from './db/client.js';
import { createCsvStorage } from './services/storage.js';
import { buildApp } from './app.js';

const env = readEnv();
const database = createDatabase(env.DATABASE_URL);
const app = await buildApp({
  database,
  frontendUrl: env.FRONTEND_URL,
  corsOrigin: env.CORS_ORIGIN,
  storage: createCsvStorage(env),
  logger: true,
});
app.addHook('onClose', async () => {
  await database.client.end();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}

try {
  await database.client`SELECT 1`;
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
