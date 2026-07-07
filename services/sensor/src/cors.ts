import type { FastifyInstance } from 'fastify';

/** Allow Mission Control on Butterbase Pages (or any origin when CORS_ORIGIN=*). */
export function registerCors(app: FastifyInstance): void {
  const origin = process.env.CORS_ORIGIN ?? '*';
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });
}
