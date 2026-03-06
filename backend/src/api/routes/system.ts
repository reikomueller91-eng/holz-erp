import { FastifyInstance } from 'fastify';
import { requireUnlocked } from '../middleware/auth';

export async function systemRoutes(fastify: FastifyInstance) {
    const { db } = fastify;

    // GET /api/system/export/json - Export all database tables as JSON
    fastify.get(
        '/system/export/json',
        { preHandler: requireUnlocked },
        async (_request, reply) => {

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
        async (_request, reply) => {
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

    // POST /api/system/wipe - Complete database wipe (requires confirmation token)
    fastify.post<{ Body: { confirmation: string } }>(
        '/system/wipe',
        { preHandler: requireUnlocked },
        async (request, reply) => {
            const { confirmation } = request.body;

            // Require exact confirmation string
            if (confirmation !== 'DATENBANK UNWIDERRUFLICH LÖSCHEN') {
                return reply.status(400).send({
                    error: 'Bestätigungstext stimmt nicht überein.',
                    message: 'Bitte geben Sie den exakten Bestätigungstext ein.',
                });
            }

            try {
                // Delete in correct order to respect FK constraints (children first, parents last)
                const deleteOrder = [
                    'document_history',
                    'link_access_log',
                    'document_links',
                    'notifications',
                    'invoice_versions',
                    'invoices',
                    'orders',
                    'offer_versions',
                    'offers',
                    'price_history',
                    'customers',
                    'products',
                    'system_config',
                ];

                // Get all user tables (skip migrations and sqlite internals)
                const tables = db.query(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
                ) as { name: string }[];
                const tableNames = new Set(tables.map(t => t.name));

                // Delete in dependency order, then any remaining tables
                const orderedTables = [
                    ...deleteOrder.filter(t => tableNames.has(t)),
                    ...tables.map(t => t.name).filter(t => !deleteOrder.includes(t)),
                ];

                db.transaction(() => {
                    for (const tableName of orderedTables) {
                        db.run(`DELETE FROM ${tableName}`);
                    }
                });

                return reply.send({
                    success: true,
                    message: 'Datenbank wurde vollständig gelöscht.',
                    tablesCleared: orderedTables,
                });
            } catch (error) {
                return reply.status(500).send({
                    error: 'Fehler beim Löschen der Datenbank.',
                    details: String(error),
                });
            }
        }
    );
}
