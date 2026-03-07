import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
// @ts-ignore - qrcode has no type declarations
import QRCode from 'qrcode';
import type { Invoice } from '../../domain/invoice/Invoice';
import type { Offer } from '../../domain/offer/Offer';
import type { Order } from '../../domain/order/Order';
import type { ICustomerRepository } from '../../application/ports/ICustomerRepository';
import type { PriceCalculationMethod } from '../../domain/product/Product';

export interface PDFGenerationResult {
  filePath: string;
  fileName: string;
}

export interface ProductInfo {
  name: string;
  calcMethod: PriceCalculationMethod;
}

export interface PDFFooterConfig {
  taxNumber?: string;
  ustId?: string;
  bankAccountHolder?: string;
  bankIban?: string;
  bankBic?: string;
}

export class PDFService {
  private outputDir: string;

  constructor(
    private customerRepo: ICustomerRepository,
    outputDir?: string
  ) {
    this.outputDir = outputDir || path.join(process.cwd(), 'data', 'pdfs');
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private drawRoundQRCode(doc: typeof PDFDocument, text: string, x: number, y: number, size: number) {
    try {
      const qrData = QRCode.create(text, { errorCorrectionLevel: 'M' });
      const moduleCount = qrData.modules.size;
      const margin = 2; // QR codes need quiet zones
      const totalModules = moduleCount + margin * 2;
      const moduleSize = size / totalModules;

      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (qrData.modules.get(row, col)) {
            // Calculate center of the module
            const cx = x + (col + margin) * moduleSize + moduleSize / 2;
            const cy = y + (row + margin) * moduleSize + moduleSize / 2;
            const radius = (moduleSize / 2) * 0.9; // Slight gap between circles

            doc.circle(cx, cy, radius).fill('black');
          }
        }
      }
    } catch (e) {
      console.error('Failed to draw round QR code:', e);
    }
  }

  async generateInvoicePDF(invoice: Invoice, taxNumber?: string, deliveryNote?: string, documentLinkUrl?: string, logoPath?: string, productNames?: Map<string, ProductInfo>, footerConfig?: PDFFooterConfig): Promise<PDFGenerationResult> {
    const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Logo (top-left)
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 490, 20, { height: 80 });
      } catch (e) {
        console.error('Failed to load logo:', e);
      }
    }

    // Header
    doc.fontSize(20).text('RECHNUNG', 50, 50);
    doc.fontSize(12).text(`Rechnungsnummer: ${invoice.invoiceNumber}`, 50, 80);
    doc.text(`Datum: ${this.formatDateDE(invoice.date)}`, 50, 95);
    doc.text(`Fällig bis: ${invoice.dueDate ? this.formatDateDE(invoice.dueDate) : 'Sofort'}`, 50, 110);

    // Customer info
    doc.fontSize(10).text('Kunde:', 50, 140);
    doc.fontSize(10).text(invoice.customerAddress, 50, 155);

    // Seller info
    doc.fontSize(10).text('Verkäufer:', 290, 140);
    doc.fontSize(10).text(invoice.sellerAddress, 290, 155);

    // Line items table
    doc.fontSize(12).text('Rechnungspositionen', 50, 220);

    let y = 245;
    doc.fontSize(9);
    doc.text('Pos', 50, y);
    doc.text('Beschreibung', 80, y);
    doc.text('Menge', 300, y);
    doc.text('Einheit', 350, y);
    doc.text('Einzelpreis', 400, y);
    doc.text('Gesamt', 480, y);

    y += 15;
    invoice.lineItems.forEach((item, index) => {
      // Use product name if available
      let description = item.description;
      if (item.productId && productNames?.has(item.productId)) {
        const info = productNames.get(item.productId)!;
        description = info.name;
      }
      const unitLabel = item.productId && productNames?.has(item.productId)
        ? this.getUnitLabel(productNames.get(item.productId)!.calcMethod)
        : '';
      doc.text(`${index + 1}`, 50, y);
      doc.text(description, 80, y, { width: 200 });
      doc.text(item.quantity.toString(), 300, y);
      doc.text(item.unit, 350, y);
      doc.text(`${this.formatCurrency(item.unitPrice)}${unitLabel}`, 400, y);
      doc.text(this.formatCurrency(item.totalPrice), 480, y);
      y += 20;
    });

    // Totals
    y += 20;
    doc.fontSize(10);
    doc.text(`Nettobetrag: ${this.formatCurrency(invoice.totalNet)}`, 350, y);
    doc.text(`MwSt (${invoice.vatPercent}%): ${this.formatCurrency(invoice.vatAmount)}`, 350, y + 15);
    doc.fontSize(12).text(`Gesamtbetrag: ${this.formatCurrency(invoice.totalGross)}`, 350, y + 35);

    // Footer
    this.drawFooter(doc, {
      legalText: 'Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig.',
      deliveryNote,
      footer: footerConfig ?? { taxNumber },
    });

    if (documentLinkUrl) {
      this.drawRoundQRCode(doc as any, documentLinkUrl, 490, 119, 70);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ filePath, fileName });
      });
      stream.on('error', reject);
    });
  }

  async generateOfferPDF(offer: Offer, taxNumber?: string, deliveryNote?: string, documentLinkUrl?: string, logoPath?: string, productNames?: Map<string, ProductInfo>, footerConfig?: PDFFooterConfig): Promise<PDFGenerationResult> {
    const fileName = `offer-${offer.offerNumber}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Logo (top-left)
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 490, 20, { height: 80 });
      } catch (e) {
        console.error('Failed to load logo:', e);
      }
    }

    // Header
    doc.fontSize(20).text('ANGEBOT', 50, 50);
    doc.fontSize(12).text(`Angebotsnummer: ${offer.offerNumber}`, 50, 80);
    doc.text(`Datum: ${this.formatDateDE(offer.date)}`, 50, 95);
    let headerY = 110;
    if (offer.validUntil) {
      doc.text(`Gültig bis: ${this.formatDateDE(offer.validUntil)}`, 50, headerY);
      headerY += 15;
    }
    if (offer.desiredCompletionDate) {
      doc.text(`Gewünschte Fertigstellung: ${this.formatDateDE(offer.desiredCompletionDate)}`, 50, headerY);
      headerY += 15;
    }

    // Customer info
    doc.fontSize(10).text('Kunde:', 50, 150);
    doc.fontSize(10).text(offer.customerAddress, 50, 165);

    // Seller info
    doc.fontSize(10).text('Verkäufer:', 290, 150);
    doc.fontSize(10).text(offer.sellerAddress, 290, 165);

    // Line items table
    doc.fontSize(12).text('Angebotspositionen', 50, 220);

    let y = 245;
    doc.fontSize(9);
    doc.text('Pos', 50, y);
    doc.text('Artikel', 80, y);
    doc.text('Menge', 250, y);
    doc.text('Einzelpreis', 320, y);
    doc.text('Gesamt', 420, y);

    y += 15;
    offer.items.forEach((item, index) => {
      const productInfo = productNames?.get(item.productId);
      const itemName = productInfo ? productInfo.name : 'Holzprodukt';
      const unitLabel = this.getUnitLabel(productInfo?.calcMethod);
      doc.text(`${index + 1}`, 50, y);
      doc.text(`${itemName}, ${this.formatLengthM(item.lengthMm)}`, 80, y, { width: 160 });
      doc.text(`${item.quantity} Stk`, 250, y);
      doc.text(`${this.formatCurrency(item.pricePerM2)}${unitLabel}`, 320, y);
      doc.text(this.formatCurrency(item.netTotal), 420, y);
      y += 20;
    });

    // Totals
    y += 20;
    doc.fontSize(10);
    doc.text(`Nettobetrag: ${this.formatCurrency(offer.netSum)}`, 320, y);
    doc.text(`MwSt (${offer.vatPercent}%): ${this.formatCurrency(offer.vatAmount)}`, 320, y + 15);
    doc.fontSize(12).text(`Gesamtbetrag: ${this.formatCurrency(offer.grossSum)}`, 320, y + 35);

    // Footer
    this.drawFooter(doc, {
      legalText: 'Dieses Angebot ist freibleibend. Wir freuen uns auf Ihren Auftrag.',
      deliveryNote,
      footer: footerConfig ?? { taxNumber },
    });

    if (documentLinkUrl) {
      // QR code top right beside the title - links to offer portal (view + accept/reject)
      this.drawRoundQRCode(doc as any, documentLinkUrl, 490, 129, 70);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ filePath, fileName });
      });
      stream.on('error', reject);
    });
  }

  async generateOrderPDF(order: Order, sellerAddress: string, taxNumber?: string, deliveryNote?: string, documentLinkUrl?: string, logoPath?: string, productNames?: Map<string, ProductInfo>, footerConfig?: PDFFooterConfig): Promise<PDFGenerationResult> {
    const customer = await this.customerRepo.findById(order.customerId);
    const fileName = `order-${order.orderNumber}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Logo (top-left)
    if (logoPath && fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, 490, 20, { height: 80 });
      } catch (e) {
        console.error('Failed to load logo:', e);
      }
    }

    // Header
    doc.fontSize(20).text('AUFTRAGSBESTÄTIGUNG', 50, 50);
    doc.fontSize(12).text(`Auftragsnummer: ${order.orderNumber}`, 50, 80);
    doc.text(`Datum: ${this.formatDateDE(order.createdAt)}`, 50, 95);
    if (order.desiredCompletionDate) {
      doc.text(`Gewünschte Fertigstellung: ${this.formatDateDE(order.desiredCompletionDate)}`, 50, 110);
    }

    // Customer info
    doc.fontSize(10).text('Kunde:', 50, 140);
    doc.fontSize(10).text(customer ? customer.name : 'Unbekannter Kunde', 50, 155);

    // Seller info
    doc.fontSize(10).text('Verkäufer:', 290, 140);
    doc.fontSize(10).text(sellerAddress, 290, 155);

    // Line items table
    doc.fontSize(12).text('Auftragspositionen', 50, 220);

    let y = 245;
    doc.fontSize(9);
    doc.text('Pos', 50, y);
    doc.text('Artikel', 80, y);
    doc.text('Menge', 250, y);
    doc.text('Einzelpreis', 320, y);
    doc.text('Gesamt', 420, y);

    y += 15;
    order.items.forEach((item, index) => {
      const productInfo = productNames?.get(item.productId);
      const itemName = productInfo ? productInfo.name : 'Holzprodukt';
      const unitLabel = this.getUnitLabel(productInfo?.calcMethod);
      doc.text(`${index + 1}`, 50, y);
      doc.text(`${itemName}, ${this.formatLengthM(item.lengthMm)}`, 80, y, { width: 160 });
      doc.text(`${item.quantity} Stk`, 250, y);
      doc.text(`${this.formatCurrency(item.pricePerM2)}${unitLabel}`, 320, y);
      doc.text(this.formatCurrency(item.netTotal), 420, y);
      y += 20;
    });

    // Totals
    y += 20;
    doc.fontSize(10);
    doc.text(`Nettobetrag: ${this.formatCurrency(order.netSum)}`, 320, y);
    doc.text(`MwSt (${order.vatPercent}%): ${this.formatCurrency(order.vatAmount)}`, 320, y + 15);
    doc.fontSize(12).text(`Gesamtbetrag: ${this.formatCurrency(order.grossSum)}`, 320, y + 35);

    // Footer
    this.drawFooter(doc, {
      legalText: 'Wir danken für Ihren Auftrag!',
      deliveryNote,
      footer: footerConfig ?? { taxNumber },
    });

    if (documentLinkUrl) {
      this.drawRoundQRCode(doc as any, documentLinkUrl, 490, 119, 70);
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ filePath, fileName });
      });
      stream.on('error', reject);
    });
  }

  /**
   * Draw a standardized footer with delivery note, legal text, tax info, and bank details.
   */
  private drawFooter(doc: PDFKit.PDFDocument, options: {
    legalText: string;
    deliveryNote?: string;
    footer?: PDFFooterConfig;
  }): void {
    const { legalText, deliveryNote, footer } = options;
    let footerY = 680;

    if (deliveryNote) {
      doc.fontSize(8).text(`Lieferhinweis: ${deliveryNote}`, 50, footerY, { width: 400 });
      footerY += 25;
    }

    doc.fontSize(8).text(legalText, 50, footerY, { width: 350 });

    // Right column: Tax + Bank info
    let rightY = footerY;
    if (footer?.taxNumber) {
      doc.fontSize(8).text(`Steuernummer: ${footer.taxNumber}`, 380, rightY, { width: 180 });
      rightY += 12;
    }
    if (footer?.ustId) {
      doc.fontSize(8).text(`USt-IdNr.: ${footer.ustId}`, 380, rightY, { width: 180 });
      rightY += 12;
    }

    // Bank details below tax info (or at same level if no tax info)
    if (footer?.bankIban || footer?.bankAccountHolder) {
      rightY += 4; // small gap
      if (footer.bankAccountHolder) {
        doc.fontSize(7).text(`Kto.-Inhaber: ${footer.bankAccountHolder}`, 380, rightY, { width: 180 });
        rightY += 10;
      }
      if (footer.bankIban) {
        doc.fontSize(7).text(`IBAN: ${footer.bankIban}`, 380, rightY, { width: 180 });
        rightY += 10;
      }
      if (footer.bankBic) {
        doc.fontSize(7).text(`BIC: ${footer.bankBic}`, 380, rightY, { width: 180 });
      }
    }
  }

  private formatCurrency(amount: number): string {
    return `€ ${(amount).toFixed(2)}`;
  }

  /** Convert ISO date (YYYY-MM-DD or full ISO) to DD.MM.YYYY */
  private formatDateDE(isoDate: string): string {
    const datePart = isoDate.split('T')[0]; // handle full ISO datetime
    const [year, month, day] = datePart.split('-');
    if (!year || !month || !day) return isoDate;
    return `${day}.${month}.${year}`;
  }

  /** Convert mm to meters string, e.g. 4500 → "4,500 m" */
  private formatLengthM(mm: number): string {
    return `${(mm / 1000).toFixed(3).replace('.', ',')} m`;
  }

  /** Get unit label for a calc method */
  private getUnitLabel(calcMethod?: PriceCalculationMethod): string {
    switch (calcMethod) {
      case 'm2_unsorted':
      case 'm2_sorted':
        return '/m²';
      case 'volume_divided':
        return '/lfm';
      default:
        return '/m²';
    }
  }

  getFullPath(fileName: string): string {
    return path.join(this.outputDir, fileName);
  }
}
