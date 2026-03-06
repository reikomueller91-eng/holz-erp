import { createTransport } from 'nodemailer';
import type { ISystemConfigRepository } from '../../infrastructure/repositories/SystemConfigRepository';
import type { ICryptoService } from '../ports/ICryptoService';
import fs from 'fs';

function decryptSensitive(crypto: ICryptoService, stored: string): string {
    try {
        const parsed = JSON.parse(stored);
        return crypto.decrypt(parsed);
    } catch {
        // Fallback: might be stored in plaintext from before encryption was added
        return stored;
    }
}

export class EmailSenderService {
    constructor(
        private configRepo: ISystemConfigRepository,
        private crypto?: ICryptoService
    ) { }

    async sendEmailWithAttachment(
        to: string,
        subject: string,
        text: string,
        html: string,
        attachmentPath: string | undefined,
        attachmentFilename: string
    ): Promise<void> {
        const host = await this.configRepo.getValue('smtp_host');
        const portStr = await this.configRepo.getValue('smtp_port');
        const user = await this.configRepo.getValue('smtp_user');
        const passRaw = await this.configRepo.getValue('smtp_password');

        if (!host || !user || !passRaw) {
            throw new Error('SMTP Konfiguration unvollständig. Bitte in den Einstellungen ergänzen.');
        }

        // Decrypt the password (it's stored encrypted with the master key)
        const pass = this.crypto ? decryptSensitive(this.crypto, passRaw) : passRaw;

        const port = portStr ? parseInt(portStr, 10) : 587;

        const transporter = createTransport({
            host,
            port,
            secure: port === 465, // true for 465, false for other ports
            auth: { user, pass },
        });

        const attachments = [];
        if (attachmentPath && fs.existsSync(attachmentPath)) {
            attachments.push({
                filename: attachmentFilename,
                path: attachmentPath,
            });
        }

        await transporter.sendMail({
            from: `"HolzERP" <${user}>`,
            to,
            subject,
            text,
            html,
            attachments,
        });
    }
}
