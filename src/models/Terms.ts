import { Schema, model, Document } from 'mongoose';

export interface ITerms extends Document {
  title: string;
  content: string;
  privacyTitle?: string;
  privacyContent?: string;
  updatedAt: Date;
}

const TermsSchema = new Schema<ITerms>({
  title: { type: String, required: true, default: 'Terms & Conditions' },
  content: { type: String, required: true },
  privacyTitle: { type: String, default: 'Privacy Policy' },
  privacyContent: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

export default model<ITerms>('Terms', TermsSchema);

