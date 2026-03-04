import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import type { Invoice } from '../../domain/invoice/Invoice';
import type { Offer } from '../../domain/offer/Offer';
import type { ICustomerRepository } from '../../application/ports/ICustomerRepository';

export interface PDFGenerationResult {
  filePath: string;
  fileName: string;
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

  async generateInvoicePDF(invoice: Invoice): Promise<PDFGenerationResult> {
    const customer = await this.customerRepo.findById(invoice.customerId);
    const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text('RECHNUNG', 50, 50);
    doc.fontSize(12).text(`Rechnungsnummer: ${invoice.invoiceNumber}`, 50, 80);
    doc.text(`Datum: ${invoice.date}`, 50, 95);
    doc.text(`Fällig bis: ${invoice.dueDate || 'Sofort'}`, 50, 110);

    // Seller info
    doc.fontSize(10).text('Verkäufer:', 50, 140);
    doc.fontSize(10).text(invoice.sellerAddress, 50, 155);

    // Customer info
    doc.fontSize(10).text('Kunde:', 350, 140);
    doc.fontSize(10).text(invoice.customerAddress, 350, 155);
    if (customer) {
      doc.text(`${customer.name}`, 350, 170);
    }

    // Line items table
    doc.fontSize(12).text('Rechnungspositionen', 50, 220);

    let y = 245;
    doc.fontSize(9);
    doc.text('Pos', 50, y);
    doc.text('Beschreibung', 80, y);
    doc.text('Menge', 300, y);
    doc.text('Einheit', 350, y);
    doc.text('Preis', 400, y);
    doc.text('Gesamt', 480, y);

    y += 15;
    invoice.lineItems.forEach((item, index) => {
      doc.text(`${index + 1}`, 50, y);
      doc.text(item.description, 80, y, { width: 200 });
      doc.text(item.quantity.toString(), 300, y);
      doc.text(item.unit, 350, y);
      doc.text(this.formatCurrency(item.unitPrice), 400, y);
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
    doc.fontSize(8).text('Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig.', 50, 700);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ filePath, fileName });
      });
      stream.on('error', reject);
    });
  }

  async generateOfferPDF(offer: Offer): Promise<PDFGenerationResult> {
    const customer = await this.customerRepo.findById(offer.customerId);
    const fileName = `offer-${offer.offerNumber}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text('ANGEBOT', 50, 50);
    doc.fontSize(12).text(`Angebotsnummer: ${offer.offerNumber}`, 50, 80);
    doc.text(`Datum: ${offer.date}`, 50, 95);
    if (offer.validUntil) {
      doc.text(`Gültig bis: ${offer.validUntil}`, 50, 110);
    }

    // Seller info
    doc.fontSize(10).text('Verkäufer:', 50, 140);
    doc.fontSize(10).text(offer.sellerAddress, 50, 155);

    // Customer info
    doc.fontSize(10).text('Kunde:', 350, 140);
    doc.fontSize(10).text(offer.customerAddress, 350, 155);
    if (customer) {
      doc.text(`${customer.name}`, 350, 170);
    }

    // Line items table
    doc.fontSize(12).text('Angebotspositionen', 50, 220);

    let y = 245;
    doc.fontSize(9);
    doc.text('Pos', 50, y);
    doc.text('Artikel', 80, y);
    doc.text('Menge', 250, y);
    doc.text('Preis/m²', 320, y);
    doc.text('Gesamt', 420, y);

    y += 15;
    offer.items.forEach((item, index) => {
      doc.text(`${index + 1}`, 50, y);
      doc.text(`Holzprodukt ${item.lengthMm}mm`, 80, y, { width: 160 });
      doc.text(`${item.quantity} Stk`, 250, y);
      doc.text(this.formatCurrency(item.pricePerM2), 320, y);
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
    doc.fontSize(8).text('Dieses Angebot ist freibleibend. Wir freuen uns auf Ihren Auftrag.', 50, 700);

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        resolve({ filePath, fileName });
      });
      stream.on('error', reject);
    });
  }

  private formatCurrency(amount: number): string {
    return `€ ${(amount).toFixed(2)}`;
  }

  getFullPath(fileName: string): string {
    return path.join(this.outputDir, fileName);
  }
}
