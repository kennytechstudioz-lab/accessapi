import { Schema, model, Document } from 'mongoose';

export interface INotificationTemplate extends Document {
  name: string;
  title: string;
  content: string;
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>({
  name: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
});

export default model<INotificationTemplate>('NotificationTemplate', NotificationTemplateSchema);
