/** One stored notification, as read by the app user it belongs to. */
export interface NotificationView {
  id: string;
  title: string;
  body: string;
  /** Same-origin path opened when the notification is clicked, or null. */
  link: string | null;
  /** Epoch ms when the app user read it, or null while unread. */
  readAt: number | null;
  /** Epoch ms. */
  createdAt: number;
}
