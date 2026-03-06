import type { UUID, ISODateTime } from '../../shared/types';

export type NotificationType = 'offer_accepted' | 'offer_rejected';

export interface Notification {
  id: UUID;
  type: NotificationType;
  title: string;
  message: string;
  referenceType?: 'offer' | 'order' | 'invoice';
  referenceId?: UUID;
  isRead: boolean;
  createdAt: ISODateTime;
}
