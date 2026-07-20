import { Schema, model, Document } from 'mongoose';

export interface INotification extends Document {
  title: string;
  content: string;
  username: string;
  time: number;
  isRead: boolean;
  admin: boolean;
}

const NotificationSchema = new Schema<INotification>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  username: { type: String, required: true },
  time: { type: Number, default: () => Math.floor(Date.now() / 1000) },
  isRead: { type: Boolean, default: false },
  admin: { type: Boolean, default: false },
});

export default model<INotification>('Notification', NotificationSchema);
