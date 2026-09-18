import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { DataClassification } from '../types/domain.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const authService = new AuthService();

  fastify.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Invalid login request body.',
        details: parseResult.error.format()
      });
    }

    const { username, password } = parseResult.data;
    const result = authService.authenticate(username, password);

    if (!result) {
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password.'
      });
    }

    return reply.status(200).send({
      success: true,
      token: result.token,
      user: result.user,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });

  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.status(200).send({
      user: request.user,
      data_classification: DataClassification.SIMULATED_DEMO_DATA
    });
  });
};
