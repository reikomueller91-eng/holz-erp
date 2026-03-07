import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import type { ISystemConfigRepository } from '../../infrastructure/repositories/SystemConfigRepository';
import type { ICryptoService } from '../../application/ports/ICryptoService';
import { requireUnlocked } from '../middleware/auth';
import { DEFAULT_SELLER_ADDRESS } from '../../shared/constants';

const DUMMY_PASSWORD = '••••••••';

const UpdateSettingsSchema = z.object({
    sellerAddress: z.string().min(1, "Absenderadresse darf nicht leer sein").optional(),
    vatPercent: z.number().min(0).max(100).optional(),
    taxNumber: z.string().optional(),
    ustId: z.string().optional(),
    bankAccountHolder: z.string().optional(),
    bankIban: z.string().optional(),
    bankBic: z.string().optional(),
    deliveryNote: z.string().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    mainDomain: z.string().url("Domain muss eine gültige URL sein").optional().or(z.literal('')),
    offerLinkValidityDays: z.number().min(1).max(365).optional(),
    telegramEnabled: z.boolean().optional(),
    telegramBotToken: z.string().optional(),
    telegramChatId: z.string().optional(),
});

// Helper: encrypt a sensitive value for DB storage
function encryptSensitive(crypto: ICryptoService, value: string): string {
    const encrypted = crypto.encrypt(value);
    return JSON.stringify(encrypted);
}

// Helper: decrypt a sensitive value from DB storage
function decryptSensitive(crypto: ICryptoService, stored: string): string {
    try {
        const parsed = JSON.parse(stored);
        return crypto.decrypt(parsed);
    } catch {
        // Fallback: might be stored in plaintext from before encryption was added
        return stored;
    }
}

export function buildSettingsRoutes(configRepo: ISystemConfigRepository): FastifyPluginAsync {
    return async (fastify: FastifyInstance) => {
        const crypto = fastify.cryptoService;

        // GET /api/settings - Get all public settings
        fastify.get(
            '/settings',
            { preHandler: requireUnlocked },
            async () => {
                const config = await configRepo.getAll();

                // Decrypt sensitive fields for internal use, but return masked values
                const hasSmtpPassword = !!config['smtp_password'];
                const logoPath = config['logo_path'] || '';
                const hasLogo = !!(logoPath && fs.existsSync(logoPath));

                return {
                    sellerAddress: config['seller_address'] || DEFAULT_SELLER_ADDRESS,
                    vatPercent: config['vat_percent'] ? parseFloat(config['vat_percent']) : 19,
                    taxNumber: config['tax_number'] || '',
                    ustId: config['ust_id'] || '',
                    bankAccountHolder: config['bank_account_holder'] || '',
                    bankIban: config['bank_iban'] || '',
                    bankBic: config['bank_bic'] || '',
                    deliveryNote: config['delivery_note'] || 'Der Kunde ist für die Ladungssicherung verantwortlich.',
                    smtpHost: config['smtp_host'] || '',
                    smtpPort: config['smtp_port'] ? parseInt(config['smtp_port'], 10) : 587,
                    smtpUser: config['smtp_user'] || '',
                    smtpPassword: hasSmtpPassword ? DUMMY_PASSWORD : '',
                    mainDomain: config['main_domain'] || '',
                    offerLinkValidityDays: config['offer_link_validity_days'] ? parseInt(config['offer_link_validity_days'], 10) : 14,
                    telegramEnabled: config['telegram_enabled'] === 'true',
                    telegramBotToken: config['telegram_bot_token'] || '',
                    telegramChatId: config['telegram_chat_id'] || '',
                    hasLogo,
                };
            }
        );

        // PUT /api/settings - Update settings
        fastify.put<{ Body: z.infer<typeof UpdateSettingsSchema> }>(
            '/settings',
            { preHandler: requireUnlocked },
            async (request, reply) => {
                const data = UpdateSettingsSchema.parse(request.body);
                if (data.sellerAddress !== undefined) {
                    await configRepo.setValue('seller_address', data.sellerAddress);
                }
                if (data.vatPercent !== undefined) {
                    await configRepo.setValue('vat_percent', String(data.vatPercent));
                }
                if (data.taxNumber !== undefined) {
                    await configRepo.setValue('tax_number', data.taxNumber);
                }
                if (data.ustId !== undefined) {
                    await configRepo.setValue('ust_id', data.ustId);
                }
                if (data.bankAccountHolder !== undefined) {
                    await configRepo.setValue('bank_account_holder', data.bankAccountHolder);
                }
                if (data.bankIban !== undefined) {
                    await configRepo.setValue('bank_iban', data.bankIban);
                }
                if (data.bankBic !== undefined) {
                    await configRepo.setValue('bank_bic', data.bankBic);
                }
                if (data.deliveryNote !== undefined) {
                    await configRepo.setValue('delivery_note', data.deliveryNote);
                }
                if (data.smtpHost !== undefined) {
                    await configRepo.setValue('smtp_host', data.smtpHost);
                }
                if (data.smtpPort !== undefined) {
                    await configRepo.setValue('smtp_port', String(data.smtpPort));
                }
                if (data.smtpUser !== undefined) {
                    await configRepo.setValue('smtp_user', data.smtpUser);
                }
                // Only update password if it's not the dummy value
                if (data.smtpPassword !== undefined && data.smtpPassword !== DUMMY_PASSWORD) {
                    if (data.smtpPassword === '') {
                        // Empty = clear the password
                        await configRepo.setValue('smtp_password', '');
                    } else {
                        // Encrypt the password before storing
                        await configRepo.setValue('smtp_password', encryptSensitive(crypto, data.smtpPassword));
                    }
                }
                if (data.mainDomain !== undefined) {
                    await configRepo.setValue('main_domain', data.mainDomain);
                }
                if (data.offerLinkValidityDays !== undefined) {
                    await configRepo.setValue('offer_link_validity_days', String(data.offerLinkValidityDays));
                }
                // Telegram settings (token stored plaintext – must be readable without system unlock for public routes)
                if (data.telegramEnabled !== undefined) {
                    await configRepo.setValue('telegram_enabled', String(data.telegramEnabled));
                }
                if (data.telegramBotToken !== undefined) {
                    await configRepo.setValue('telegram_bot_token', data.telegramBotToken);
                }
                if (data.telegramChatId !== undefined) {
                    await configRepo.setValue('telegram_chat_id', data.telegramChatId);
                }
                return reply.status(200).send({ message: 'Settings updated successfully' });
            }
        );

        // POST /api/settings/logo - Upload logo (base64)
        const UploadLogoSchema = z.object({
            data: z.string().min(1, 'Logo-Daten dürfen nicht leer sein'),
            filename: z.string().min(1),
        });

        fastify.post<{ Body: z.infer<typeof UploadLogoSchema> }>(
            '/settings/logo',
            { preHandler: requireUnlocked },
            async (request, reply) => {
                const { data } = UploadLogoSchema.parse(request.body);

                // Extract base64 content (strip data URL prefix if present)
                const base64Match = data.match(/^data:image\/(png|jpeg|jpg|gif|svg\+xml);base64,(.+)$/);
                if (!base64Match) {
                    return reply.status(400).send({ error: 'Ungültiges Bildformat. Erlaubt: PNG, JPEG, GIF, SVG' });
                }

                const ext = base64Match[1] === 'svg+xml' ? 'svg' : base64Match[1];
                const base64Data = base64Match[2];
                const buffer = Buffer.from(base64Data, 'base64');

                // Max 2 MB
                if (buffer.length > 2 * 1024 * 1024) {
                    return reply.status(400).send({ error: 'Logo darf max. 2 MB groß sein.' });
                }

                const logoDir = path.join('/data', 'logo');
                if (!fs.existsSync(logoDir)) {
                    fs.mkdirSync(logoDir, { recursive: true });
                }

                // Remove old logo files
                try {
                    const existing = fs.readdirSync(logoDir);
                    for (const f of existing) {
                        fs.unlinkSync(path.join(logoDir, f));
                    }
                } catch { /* ignore */ }

                const logoFileName = `logo.${ext}`;
                const logoPath = path.join(logoDir, logoFileName);
                fs.writeFileSync(logoPath, buffer);

                // Store path in config
                await configRepo.setValue('logo_path', logoPath);

                return { message: 'Logo erfolgreich hochgeladen', logoPath };
            }
        );

        // GET /api/settings/logo - Get logo
        fastify.get(
            '/settings/logo',
            { preHandler: requireUnlocked },
            async (_request, reply) => {
                const logoPath = await configRepo.getValue('logo_path');
                if (!logoPath || !fs.existsSync(logoPath)) {
                    return reply.status(404).send({ error: 'Kein Logo vorhanden' });
                }

                const ext = path.extname(logoPath).slice(1);
                const mimeMap: Record<string, string> = {
                    png: 'image/png',
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg',
                    gif: 'image/gif',
                    svg: 'image/svg+xml',
                };
                const contentType = mimeMap[ext] || 'application/octet-stream';

                const stream = fs.createReadStream(logoPath);
                reply.header('Content-Type', contentType);
                return reply.send(stream);
            }
        );

        // DELETE /api/settings/logo - Remove logo
        fastify.delete(
            '/settings/logo',
            { preHandler: requireUnlocked },
            async (_request) => {
                const logoPath = await configRepo.getValue('logo_path');
                if (logoPath && fs.existsSync(logoPath)) {
                    fs.unlinkSync(logoPath);
                }
                await configRepo.setValue('logo_path', '');
                return { message: 'Logo entfernt' };
            }
        );
    };
}

// Exported for use by EmailSenderService and other services
export { decryptSensitive };
