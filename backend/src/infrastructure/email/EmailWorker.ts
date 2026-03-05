import { createTransport, type Transporter } from 'nodemailer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

// Types
interface ProductData {
  id: string;
  name: string;
  woodType: string;
  qualityGrade: string;
  heightMm: number;
  widthMm: number;
  currentPricePerM2: number;
}

interface EmailConfig {
  imap: { host: string; port: number; user: string; password: string; tls: boolean };
  smtp: { host: string; port: number; user: string; password: string };
  filterKeywords: string[];
}

// SMTP Service
export class SmtpService {
  private transporter: Transporter;

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

// IMAP Service
export class ImapService {
  private client: Imap;

  constructor(config: EmailConfig['imap']) {
    this.client = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once('ready', () => resolve());
      this.client.once('error', (err: any) => reject(err));
      this.client.connect();
    });
  }

  disconnect(): void {
    this.client.end();
  }

  async getUnseenEmails(): Promise<Array<{
    id: string;
    subject: string;
    from: { name: string; address: string };
    to: string;
    date: Date;
    text: string;
    html?: string;
  }>> {
    return new Promise((resolve, reject) => {
      this.client.openBox('INBOX', false, (err: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Search for unseen emails from last 24 hours
        const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - 24 * 60 * 60 * 1000)]];

        this.client.search(searchCriteria, (err: any, results: any[]) => {
          if (err) {
            reject(err);
            return;
          }

          if (results.length === 0) {
            resolve([]);
            return;
          }

          const emails: Array<any> = [];
          let processed = 0;
          results.forEach((msgId: any) => {
            const fetch = this.client.fetch(msgId, { bodies: '' });

            fetch.on('message', (msg: any) => {
              let rawEmail = '';

              msg.on('body', (stream: any) => {
                stream.on('data', (chunk: any) => {
                  rawEmail += chunk.toString();
                });
              });

              msg.once('end', async () => {
                try {
                  const parsed = await simpleParser(rawEmail);
                  const parsedFrom: any = parsed.from;
                  const parsedTo: any = parsed.to;
                  const fromValue = Array.isArray(parsedFrom?.value) ? parsedFrom?.value[0] : parsedFrom?.value;
                  const toValue = Array.isArray(parsedTo?.value) ? parsedTo?.value[0] : parsedTo?.value;

                  emails.push({
                    id: msgId.toString(),
                    subject: parsed.subject || '(kein Betreff)',
                    from: {
                      name: fromValue?.name || fromValue?.address || 'Unbekannt',
                      address: fromValue?.address || '',
                    },
                    to: toValue?.address || '',
                    date: parsed.date || new Date(),
                    text: parsed.text || '',
                    html: parsed.html || undefined,
                  });
                } catch (e) {
                  console.error('Error parsing email:', e);
                }

                processed++;
                if (processed === results.length) {
                  resolve(emails);
                }
              });
            });

            fetch.once('error', (err: any) => {
              console.error('Fetch error:', err);
              processed++;
              if (processed === results.length) {
                resolve(emails);
              }
            });
          });
        });
      });
    });
  }

  markAsSeen(uid: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.addFlags(uid, ['\\Seen'], (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

// Email Worker
export class EmailWorker {
  private imap: ImapService | null = null;
  private smtp: SmtpService;
  private config: EmailConfig;
  private isRunning = false;
  private pollInterval = 60000;

  constructor(config: EmailConfig) {
    this.config = config;
    this.smtp = new SmtpService(config.smtp);

    if (config.imap.host && config.imap.user && config.imap.password) {
      this.imap = new ImapService(config.imap);
    }
  }

  async start(
    getProducts: () => Promise<ProductData[]>,
    createOffer: (data: {
      customerId: string;
      customerName: string;
      customerEmail: string;
      items: Array<{ productId: string; lengthMm: number; quantity: number }>;
      notes: string;
    }) => Promise<{ id: string; ticketNumber: string }>
  ): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('📧 E-Mail Worker gestartet...');

    if (!this.imap) {
      console.log('⚠️ IMAP nicht konfiguriert - E-Mail Worker läuft im Test-Modus');
    } else {
      try {
        await this.imap.connect();
        console.log('✅ IMAP verbunden');
      } catch (err) {
        console.error('❌ IMAP Verbindungsfehler:', err);
        this.imap = null;
      }
    }

    const processLoop = async () => {
      if (!this.isRunning) return;

      try {
        console.log('📥 Prüfe auf neue E-Mails...');

        if (!this.imap) {
          console.log('⚠️ Kein IMAP - überspringe');
          if (this.isRunning) setTimeout(processLoop, this.pollInterval);
          return;
        }

        const emails = await this.imap.getUnseenEmails();
        console.log(`📬 ${emails.length} ungelesene E-Mails gefunden`);

        const products = await getProducts();

        for (const email of emails) {
          const isRelevant = this.isRelevantEmail(email.subject, email.text);
          console.log(`📨 E-Mail von ${email.from.address}: "${email.subject}" - Relevant: ${isRelevant}`);

          if (isRelevant) {
            const ticketNumber = this.generateTicketNumber();
            console.log(`🎫 Ticket: ${ticketNumber}`);

            // Extract products from email
            const requestedProducts = this.extractProductRequests(email.text, products);
            console.log(`📦 ${requestedProducts.length} Produkte gefunden`);

            if (requestedProducts.length > 0) {
              // Create offer
              await createOffer({
                customerId: '',
                customerName: email.from.name,
                customerEmail: email.from.address,
                items: requestedProducts.map(p => ({
                  productId: p.product.id,
                  lengthMm: p.requestedLength,
                  quantity: p.quantity,
                })),
                notes: `E-Mail Anfrage\nBetreff: ${email.subject}\nTicket: ${ticketNumber}`,
              });

              // Send confirmation
              await this.smtp.sendEmail(
                email.from.address,
                `Re: ${email.subject} [${ticketNumber}]`,
                `<h1>Anfrage erhalten!</h1>
                 <p>Sehr geehrte/r ${email.from.name},</p>
                 <p>wir haben Ihre Anfrage erhalten.</p>
                 <p><strong>Ticket-Nummer: ${ticketNumber}</strong></p>
                 <p>Ihre Anfrage wird bearbeitet. Sie erhalten in Kürze ein Angebot.</p>
                 <p>Mit freundlichen Grüßen,<br/>Ihr HolzERP Team</p>`
              );

              console.log(`✅ Bestätigung gesendet an ${email.from.address}`);
            }

            // Mark as seen
            await this.imap.markAsSeen(email.id);
          }
        }
      } catch (error) {
        console.error('❌ Fehler:', error);
      }

      if (this.isRunning) {
        setTimeout(processLoop, this.pollInterval);
      }
    };

    processLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.imap) {
      this.imap.disconnect();
    }
    console.log('📧 E-Mail Worker gestoppt');
  }

  private isRelevantEmail(subject: string, text: string): boolean {
    const content = `${subject} ${text}`.toLowerCase();
    return this.config.filterKeywords.some(keyword => content.includes(keyword.toLowerCase()));
  }

  private extractProductRequests(text: string, products: ProductData[]): Array<{ product: ProductData; requestedLength: number; quantity: number }> {
    const textLower = text.toLowerCase();
    const results: Array<{ product: ProductData; requestedLength: number; quantity: number }> = [];

    for (const product of products) {
      if (textLower.includes(product.name.toLowerCase())) {
        results.push({
          product,
          requestedLength: this.extractLength(text) || 1000,
          quantity: this.extractNumber(text) || 1,
        });
      }
    }
    return results;
  }

  private extractNumber(text: string): number | null {
    const match = text.match(/(\d+)\s*(stück|pieces|q|quantity|x|zahl)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  private extractLength(text: string): number | null {
    const mmMatch = text.match(/(\d+)\s*mm/i);
    const cmMatch = text.match(/(\d+)\s*cm/i);
    if (mmMatch) return parseInt(mmMatch[1], 10);
    if (cmMatch) return parseInt(cmMatch[1], 10) * 10;
    return null;
  }

  private generateTicketNumber(): string {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ANGEBOT-${year}${month}-${random}`;
  }
}

export function createEmailWorker(env: Record<string, string>): EmailWorker | null {
  const config: EmailConfig = {
    imap: {
      host: env.IMAP_HOST || '',
      port: parseInt(env.IMAP_PORT || '993', 10),
      user: env.IMAP_USER || '',
      password: env.IMAP_PASSWORD || '',
      tls: env.IMAP_TLS !== 'false',
    },
    smtp: {
      host: env.SMTP_HOST || '',
      port: parseInt(env.SMTP_PORT || '587', 10),
      user: env.SMTP_USER || '',
      password: env.SMTP_PASSWORD || '',
    },
    filterKeywords: (env.EMAIL_FILTER_KEYWORDS || 'angebot,anfrage,holz,produkt').split(','),
  };

  if (!config.smtp.host || !config.smtp.user || !config.smtp.password) {
    console.log('📧 E-Mail Worker nicht konfiguriert');
    return null;
  }

  return new EmailWorker(config);
}