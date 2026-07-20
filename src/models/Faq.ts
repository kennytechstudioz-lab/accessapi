import { Schema, model, Document } from 'mongoose';

export interface IFaq extends Document {
  category: string;
  question: string;
  answer: string;
}

const FaqSchema = new Schema<IFaq>({
  category: { type: String, required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

export default model<IFaq>('Faq', FaqSchema);
