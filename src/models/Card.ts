import mongoose, { Schema, Document } from 'mongoose';

export interface ICard extends Document {
  username: string;
  cardNumber: string;
  cardType: string; // Visa, MasterCard, Amex
  cardHolder: string;
  expiryDate: string;
  cvv: string;
  status: string; // Pending, Active, Blocked
  balance: number;
}

const CardSchema: Schema = new Schema({
  username: { type: String, required: true },
  cardNumber: { type: String, required: true, unique: true },
  cardType: { type: String, default: 'Visa' },
  cardHolder: { type: String, required: true },
  expiryDate: { type: String, required: true },
  cvv: { type: String, required: true },
  status: { type: String, default: 'Pending' }, // Pending, Active, Blocked
  balance: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<ICard>('Card', CardSchema);
