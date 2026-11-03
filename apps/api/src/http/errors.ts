import type { FastifyInstance } from 'fastify';

export class ApplicationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfter?: number,
  ) {
    super(code);
  }
}

export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApplicationError) {
      if (error.retryAfter !== undefined) reply.header('retry-after', String(error.retryAfter));
      return reply.code(error.status).send({ error: { code: error.code } });
    }
    // Driver and parser errors may contain sensitive input; return only stable codes.
    const errorStatus =
      error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status =
      typeof errorStatus === 'number' && errorStatus >= 400 && errorStatus < 500
        ? errorStatus
        : 500;
    const vocabularyImport = /\/words\/(preview|commit)$/u.test(request.routeOptions.url ?? '');
    const code =
      status === 413 && vocabularyImport
        ? 'BULK_TOO_LARGE'
        : status < 500
          ? 'VALIDATION_FAILED'
          : 'INTERNAL_ERROR';
    return reply.code(status).send({ error: { code } });
  });
}
