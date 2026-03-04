import { FastifyInstance } from 'fastify';
import { requireUnlocked } from '../middleware/auth';

export async function systemRoutes(fastify: FastifyInstance) {
    // GET /api/system/export/json - Export all database tables as JSON
    fastify.get(
        '/system/export/json',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const db = (fastify as any).db;

            // Get all table names
            const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            const exportData: Record<string, any[]> = {};

            for (const table of tables as { name: string }[]) {
                exportData[table.name] = db.query(`SELECT * FROM ${table.name}`);
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            reply.header('Content-Type', 'application/json');
            reply.header('Content-Disposition', `attachment; filename="holzerp_export_${timestamp}.json"`);
            return exportData;
        }
    );

    // GET /api/system/export/csv - Export all database tables as a multipart CSV file
    fastify.get(
        '/system/export/csv',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const db = (fastify as any).db;

            const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            let csvOutput = '';

            for (const table of tables as { name: string }[]) {
                const rows = db.query(`SELECT * FROM ${table.name}`) as Record<string, any>[];

                if (rows.length === 0) continue;

                csvOutput += `--- TABLE: ${table.name} ---\n`;
                const headers = Object.keys(rows[0]);
                csvOutput += headers.map(h => `"${h}"`).join(',') + '\n';

                for (const row of rows) {
                    const values = headers.map(h => {
                        const val = row[h];
                        if (val === null || val === undefined) return '';
                        const strVal = String(val).replace(/"/g, '""'); // Escape quotes
                        return `"${strVal}"`;
                    });
                    csvOutput += values.join(',') + '\n';
                }

                csvOutput += '\n\n';
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            reply.header('Content-Type', 'text/csv');
            reply.header('Content-Disposition', `attachment; filename="holzerp_export_${timestamp}.csv"`);
            return reply.send(csvOutput);
        }
    );
}
