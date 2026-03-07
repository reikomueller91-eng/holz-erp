import type { ISystemConfigRepository } from '../repositories/SystemConfigRepository';

/**
 * Sends Telegram Bot API messages for real-time notifications.
 */
export class TelegramService {
  constructor(
    private configRepo: ISystemConfigRepository,
  ) {}

  /**
   * Send a Telegram message. Silently fails if not enabled or token/chatId are not configured.
   */
  async sendMessage(text: string): Promise<boolean> {
    try {
      const enabled = await this.configRepo.getValue('telegram_enabled');
      if (enabled !== 'true') {
        return false; // Telegram disabled in settings
      }

      const botToken = await this.configRepo.getValue('telegram_bot_token');
      const chatId = await this.configRepo.getValue('telegram_chat_id');

      if (!botToken || !chatId) {
        return false; // Not configured – skip silently
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
