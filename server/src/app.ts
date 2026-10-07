import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { Database } from './db/client.js';
import type { CsvStorage } from './services/storage.js';
import { createLinkService } from './services/links.js';
import { createExportService } from './services/export.js';
import { AppError } from './errors.js';
import {
  codeParamsSchema,
  createLinkSchema,
  idParamsSchema,
  listQuerySchema,
} from './validation.js';

export interface AppOptions {
  database: Database;
  frontendUrl: string;
  corsOrigin: string;
  storage?: CsvStorage;
  logger?: boolean;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024,
    requestTimeout: 120_000,
  });
  await app.register(cors, {
    origin: options.corsOrigin.split(',').map((origin) => origin.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  const service = createLinkService(options.database);
  const exportLinks = createExportService(options.database, options.frontendUrl, options.storage);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Verifique os campos informados.',
        issues: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (error instanceof AppError)
      return reply.status(error.statusCode).send({ code: error.code, message: error.message });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply
        .status(error.statusCode)
        .send({ code: 'INVALID_REQUEST', message: 'A requisição é inválida.' });
    }
    request.log.error(error);
    return reply
      .status(500)
      .send({ code: 'INTERNAL_ERROR', message: 'Ocorreu um erro no servidor. Tente novamente.' });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada.' }),
  );

  app.get('/health', async () => {
    await options.database.client`SELECT 1`;
    return { status: 'ok' };
  });
  app.post('/links', async (request, reply) => {
    const input = createLinkSchema.parse(request.body);
    const link = await service.create(input);
    return reply.status(201).send(link);
  });
  app.get('/links', async (request) => {
    const query = listQuerySchema.parse(request.query);
    return service.list(query.limit, query.cursor);
  });
  app.get('/links/:shortCode', async (request) => {
    const { shortCode } = codeParamsSchema.parse(request.params);
    return service.find(shortCode);
  });
  app.delete('/links/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await service.remove(id);
    return reply.status(204).send();
  });
  app.patch('/links/:id/access', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return service.increment(id);
  });
  app.post('/links/export', async () => exportLinks());

  return app;
}
