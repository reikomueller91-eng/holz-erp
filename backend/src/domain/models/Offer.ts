import { AggregateRoot } from '../core/AggregateRoot';

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';

export interface OfferItem {
  id: string;
  productId: string;
  heightMm: number;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  quality: string;
  pricePerM2: number;
  netTotal: number;
}

export interface OfferVersion {
  version: number;
  data: OfferData;
  createdAt: Date;
  createdBy?: string;
  changes: string[];
}

export interface OfferData {
  id: string;
  offerNumber: string;
  version: number;
  status: OfferStatus;
  date: Date;
  validUntil?: Date;
  inquirySource: string;
  inquiryContact?: string;
  customerId: string;
  sellerAddress: string;
  customerAddress: string;
  items: OfferItem[];
  netSum: number;
  vatPercent: number;
  vatAmount: number;
  grossSum: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export class Offer extends AggregateRoot {
  private props: OfferData;
  private versions: OfferVersion[] = [];

  constructor(props: OfferData, versions: OfferVersion[] = []) {
    super();
    this.props = { ...props };
    this.versions = [...versions];
    this.validate();
  }

  private validate(): void {
    if (!this.props.offerNumber) throw new Error('Offer number is required');
    if (!this.props.customerId) throw new Error('Customer ID is required');
    if (!this.props.items || this.props.items.length === 0) {
      throw new Error('Offer must have at least one item');
    }
    if (this.props.netSum < 0) throw new Error('Net sum cannot be negative');
  }

  // Getters
  getId(): string { return this.props.id; }
  getOfferNumber(): string { return this.props.offerNumber; }
  getVersion(): number { return this.props.version; }
  getStatus(): OfferStatus { return this.props.status; }
  getDate(): Date { return this.props.date; }
  getValidUntil(): Date | undefined { return this.props.validUntil; }
  getInquirySource(): string { return this.props.inquirySource; }
  getInquiryContact(): string | undefined { return this.props.inquiryContact; }
  getCustomerId(): string { return this.props.customerId; }
  getSellerAddress(): string { return this.props.sellerAddress; }
  getCustomerAddress(): string { return this.props.customerAddress; }
  getItems(): OfferItem[] { return [...this.props.items]; }
  getNetSum(): number { return this.props.netSum; }
  getVatPercent(): number { return this.props.vatPercent; }
  getVatAmount(): number { return this.props.vatAmount; }
  getGrossSum(): number { return this.props.grossSum; }
  getNotes(): string | undefined { return this.props.notes; }
  getCreatedAt(): Date { return this.props.createdAt; }
  getUpdatedAt(): Date { return this.props.updatedAt; }
  getCreatedBy(): string | undefined { return this.props.createdBy; }
  getUpdatedBy(): string | undefined { return this.props.updatedBy; }
  getVersions(): OfferVersion[] { return [...this.versions]; }

  // Domain operations
  update(
    changes: Partial<Omit<OfferData, 'id' | 'offerNumber' | 'version' | 'createdAt'>>,
    changeDescription: string[],
    userId?: string
  ): void {
    // Save current version to history
    this.versions.push({
      version: this.props.version,
      data: { ...this.props },
      createdAt: new Date(),
      createdBy: userId,
      changes: changeDescription
    });

    // Apply changes
    Object.assign(this.props, changes);
    this.props.version += 1;
    this.props.updatedAt = new Date();
    this.props.updatedBy = userId;

    this.validate();

    this.addDomainEvent({
      type: 'OFFER_UPDATED',
      payload: {
        offerId: this.props.id,
        newVersion: this.props.version,
        previousVersion: this.props.version - 1,
        changes: changeDescription
      }
    });
  }

  markAsSent(userId?: string): void {
    if (this.props.status !== 'draft') {
      throw new Error('Only draft offers can be sent');
    }
    this.props.status = 'sent';
    this.props.updatedAt = new Date();
    this.props.updatedBy = userId;

    this.addDomainEvent({
      type: 'OFFER_SENT',
      payload: { offerId: this.props.id }
    });
  }

  markAsAccepted(userId?: string): void {
    if (this.props.status !== 'sent') {
      throw new Error('Only sent offers can be accepted');
    }
    this.props.status = 'accepted';
    this.props.updatedAt = new Date();
    this.props.updatedBy = userId;

    this.addDomainEvent({
      type: 'OFFER_ACCEPTED',
      payload: { offerId: this.props.id }
    });
  }

  markAsRejected(userId?: string): void {
    if (this.props.status !== 'sent') {
      throw new Error('Only sent offers can be rejected');
    }
    this.props.status = 'rejected';
    this.props.updatedAt = new Date();
    this.props.updatedBy = userId;

    this.addDomainEvent({
      type: 'OFFER_REJECTED',
      payload: { offerId: this.props.id }
    });
  }

  markAsConverted(orderId: string, userId?: string): void {
    if (this.props.status !== 'accepted') {
      throw new Error('Only accepted offers can be converted');
    }
    this.props.status = 'converted';
    this.props.updatedAt = new Date();
    this.props.updatedBy = userId;

    this.addDomainEvent({
      type: 'OFFER_CONVERTED',
      payload: { offerId: this.props.id, orderId }
    });
  }

  isEditable(): boolean {
    return ['draft', 'sent'].includes(this.props.status);
  }

  isFinalized(): boolean {
    return ['accepted', 'rejected', 'converted'].includes(this.props.status);
  }

  getVersionHistory(): OfferVersion[] {
    return [...this.versions].sort((a, b) => b.version - a.version);
  }

  getVersionByNumber(version: number): OfferVersion | undefined {
    return this.versions.find(v => v.version === version);
  }

  // Factory method
  static create(
    props: Omit<OfferData, 'id' | 'version' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Offer {
    return new Offer({
      ...props,
      id: props.id || crypto.randomUUID(),
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  toJSON(): OfferData {
    return { ...this.props };
  }
}
