import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import postgres from 'postgres';

const root = new URL('../', import.meta.url);
const envFile = new URL('server/.env', root);
const config = existsSync(envFile) ? parse(readFileSync(envFile)) : {};
const databaseUrl = process.env.DATABASE_URL ?? config.DATABASE_URL;

async function connectionError() {
  const client = postgres(databaseUrl, { max: 1, connect_timeout: 3 });
  try {
    await client`SELECT 1`;
    return undefined;
  } catch (error) {
    // Não imprime a conexão nem credenciais presentes nas mensagens do driver.
    return error.code ?? 'CONNECTION_FAILED';
  } finally {
    await client.end({ timeout: 1 });
  }
}

try {
  let url;
  try {
    url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error('Configure DATABASE_URL com uma conexão Postgres válida em server/.env.');
  }

  let error = await connectionError();
  const dataDirectory = new URL('.local/postgres-dev/', root);
  const localCluster =
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    url.port === '54329' &&
    existsSync(new URL('PG_VERSION', dataDirectory));

  if (error === 'ECONNREFUSED' && localCluster) {
    console.log('Iniciando o Postgres local existente na porta 54329…');
    try {
      execFileSync(
        'pg_ctl',
        [
          '-D',
          fileURLToPath(dataDirectory),
          '-l',
          fileURLToPath(new URL('.local/postgres-dev.log', root)),
          '-o',
          '-h 127.0.0.1 -p 54329 -k /tmp',
          '-w',
          'start',
        ],
        { stdio: 'inherit' },
      );
    } catch {
      throw new Error(
        'Não foi possível iniciar o Postgres local. Confira pg_ctl e .local/postgres-dev.log.',
      );
    }
    error = await connectionError();
  }

  if (error) {
    throw new Error(
      'Postgres indisponível. Inicie o banco configurado em server/.env e confira DATABASE_URL. ' +
        'Para o banco do Compose: docker compose up -d postgres.',
    );
  }
  console.log('Postgres disponível. Iniciando API e frontend.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
