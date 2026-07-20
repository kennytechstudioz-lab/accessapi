import { Schema, model, Document } from 'mongoose';

export interface IEmailTemplate extends Document {
  name: string;
  title: string;
  content: string;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>({
  name: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
});

export default model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);
