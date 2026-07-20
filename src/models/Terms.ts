import { Schema, model, Document } from 'mongoose';

export interface ITerms extends Document {
  title: string;
  content: string;
  updatedAt: Date;
}

const TermsSchema = new Schema<ITerms>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

export default model<ITerms>('Terms', TermsSchema);
