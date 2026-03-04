import { createTransport } from 'nodemailer';

// Types
interface ParsedEmail {
  id: string;
  subject: string;
  from: { name: string; address: string };
  to: string;
  date: Date;
  text: string;
  html?: string;
}

interface EmailConfig {
  imap: { host: string; port: number; user: string; password: string; tls: boolean };
  smtp: { host: string; port: number; user: string; password: string };
  filterKeywords: string[];
}

interface ProductData {
  id: string;
  name: string;
  woodType: string;
  qualityGrade: string;
  heightMm: number;
  widthMm: number;
  currentPricePerM2: number;
}

// SMTP Service only - IMAP would require additional setup
export class SmtpService {
  private transporter: ReturnType<typeof createTransport>;

  constructor(config: EmailConfig['smtp']) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: false,
      auth: { user: config.user, pass: config.password },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: 'HolzERP <reikomueller91@gmail.com>',
      to,
      subject,
      html,
    });
  }
}

// Email Worker with manual polling via API endpoint
export class EmailWorker {
  private smtp: SmtpService;
  private config: EmailConfig;
  private isRunning = false;
  private pollInterval = 60000;

  constructor(config: EmailConfig) {
    this.config = config;
    this.smtp = new SmtpService(config.smtp);
  }

  async start(
    getProducts: () => Promise<ProductData[]>,
    createOffer: (data: {
      customerId: string;
      customerName: string;
      customerEmail: string;
      items: Array<{productId: string; lengthMm: number; quantity: number}>;
      notes: string;
    }) => Promise<{id: string; ticketNumber: string}>
  ): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('📧 E-Mail Worker gestartet...');

    const processLoop = async () => {
      if (!this.isRunning) return;

      try {
        // For now, we'll just log that we're running
        // Full IMAP integration would need more setup
        console.log('📥 E-Mail Worker läuft - wartet auf eingehende E-Mails...');
      } catch (error) {
        console.error('❌ Fehler im E-Mail Worker:', error);
      }

      if (this.isRunning) {
        setTimeout(processLoop, this.pollInterval);
      }
    };

    processLoop();
  }

  stop(): void {
    this.isRunning = false;
    console.log('📧 E-Mail Worker gestoppt');
  }

  // Helper to check if email is relevant
  isRelevantEmail(subject: string, text: string): boolean {
    const content = `${subject} ${text}`.toLowerCase();
    return this.config.filterKeywords.some(keyword => content.includes(keyword.toLowerCase()));
  }

  // Generate ticket number
  generateTicketNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ANGEBOT-${year}-${random}`;
  }

  // Extract product requests from email text
  extractProductRequests(text: string, products: ProductData[]): Array<{product: ProductData; requestedLength: number; quantity: number}> {
    const textLower = text.toLowerCase();
    const results: Array<{product: ProductData; requestedLength: number; quantity: number}> = [];

    for (const product of products) {
      if (textLower.includes(product.name.toLowerCase())) {
        const quantity = this.extractNumber(text) || 1;
        const lengthMm = this.extractLength(text) || 1000;
        results.push({ product, requestedLength: lengthMm, quantity });
      }
    }
    return results;
  }

  private extractNumber(text: string): number | null {
    const match = text.match(/(\d+)\s*(stück|pieces|q|quantity|x)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  private extractLength(text: string): number | null {
    const mmMatch = text.match(/(\d+)\s*mm/i);
    const cmMatch = text.match(/(\d+)\s*cm/i);
    if (mmMatch) return parseInt(mmMatch[1], 10);
    if (cmMatch) return parseInt(cmMatch[1], 10) * 10;
    return null;
  }

  async sendConfirmation(to: string, subject: string, ticketNumber: string): Promise<void> {
    await this.smtp.sendEmail(
      to,
      `Re: ${subject} [${ticketNumber}]`,
      `<h1>Anfrage erhalten!</h1>
       <p>Sehr geehrte/r Kunde/in,</p>
       <p>wir haben Ihre Anfrage erhalten und bearbeiten diese.</p>
       <p><strong>Ticket-Nummer: ${ticketNumber}</strong></p>
       <p>Sie erhalten in Kürze ein Angebot von uns.</p>
       <p>Mit freundlichen Grüßen,<br/>Ihr HolzERP Team</p>`
    );
  }
}

export function createEmailWorker(env: Record<string, string>): EmailWorker | null {
  const config: EmailConfig = {
    imap: { host: env.IMAP_HOST || '', port: parseInt(env.IMAP_PORT || '993', 10), user: env.IMAP_USER || '', password: env.IMAP_PASSWORD || '', tls: env.IMAP_TLS !== 'false' },
    smtp: { host: env.SMTP_HOST || '', port: parseInt(env.SMTP_PORT || '587', 10), user: env.SMTP_USER || '', password: env.SMTP_PASSWORD || '' },
    filterKeywords: (env.EMAIL_FILTER_KEYWORDS || 'angebot,anfrage,holz,produkt').split(','),
  };

  if (!config.smtp.host) {
    console.log('📧 E-Mail Worker nicht konfiguriert (fehlende SMTP Settings)');
    return null;
  }

  return new EmailWorker(config);
}