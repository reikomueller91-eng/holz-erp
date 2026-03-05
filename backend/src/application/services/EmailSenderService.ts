import { createTransport } from 'nodemailer';
import type { ISystemConfigRepository } from '../../infrastructure/repositories/SystemConfigRepository';
import fs from 'fs';

export class EmailSenderService {
    constructor(private configRepo: ISystemConfigRepository) { }

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
        const pass = await this.configRepo.getValue('smtp_password');

        if (!host || !user || !pass) {
            throw new Error('SMTP Konfiguration unvollständig. Bitte in den Einstellungen ergänzen.');
        }

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
