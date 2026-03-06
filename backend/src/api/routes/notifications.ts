import { FastifyInstance } from 'fastify';
import { requireUnlocked } from '../middleware/auth';

export async function notificationRoutes(fastify: FastifyInstance) {
    // GET /api/notifications - List notifications
    fastify.get<{ Querystring: { unreadOnly?: string; limit?: string } }>(
        '/notifications',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const unreadOnly = request.query.unreadOnly === 'true';
            const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;

            const notifications = await fastify.notificationRepository.findAll({
                isRead: unreadOnly ? false : undefined,
                limit,
            });

            const unreadCount = fastify.notificationRepository.countUnread();

            return reply.send({
                notifications,
                unreadCount,
            });
        }
    );

    // GET /api/notifications/unread-count - Get unread count only
    fastify.get(
        '/notifications/unread-count',
        { preHandler: requireUnlocked },
        async (_request, reply) => {
            const unreadCount = fastify.notificationRepository.countUnread();
            return reply.send({ unreadCount });
        }
    );

    // PATCH /api/notifications/:id/read - Mark a single notification as read
    fastify.patch<{ Params: { id: string } }>(
        '/notifications/:id/read',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const { id } = request.params;
            const notification = await fastify.notificationRepository.findById(id);
            if (!notification) {
                return reply.status(404).send({ error: 'Notification not found' });
            }
            await fastify.notificationRepository.markRead(id);
            return reply.send({ success: true });
        }
    );

    // PATCH /api/notifications/read-all - Mark all notifications as read
    fastify.patch(
        '/notifications/read-all',
        { preHandler: requireUnlocked },
        async (_request, reply) => {
            await fastify.notificationRepository.markAllRead();
            return reply.send({ success: true });
        }
    );
}
