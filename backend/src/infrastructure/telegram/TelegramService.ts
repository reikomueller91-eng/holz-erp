import type { ISystemConfigRepository } from '../repositories/SystemConfigRepository';
import type { ICryptoService } from '../../application/ports/ICryptoService';

/**
 * Sends Telegram Bot API messages for real-time notifications.
 */
export class TelegramService {
  constructor(
    private configRepo: ISystemConfigRepository,
    private crypto: ICryptoService,
  ) {}

  /**
   * Send a Telegram message. Silently fails if token/chatId are not configured.
   */
  async sendMessage(text: string): Promise<boolean> {
    try {
      const tokenEncrypted = await this.configRepo.getValue('telegram_bot_token');
      const chatId = await this.configRepo.getValue('telegram_chat_id');

      if (!tokenEncrypted || !chatId) {
        return false; // Not configured – skip silently
      }

      // Decrypt the bot token
      let botToken: string;
      try {
        const parsed = JSON.parse(tokenEncrypted);
        botToken = this.crypto.decrypt(parsed);
      } catch {
        // Fallback: might be stored in plaintext
        botToken = tokenEncrypted;
      }

      if (!botToken) {
        return false;
      }

      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`Telegram API error: ${response.status} – ${body}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }
}
