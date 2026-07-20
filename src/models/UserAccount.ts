import mongoose, { Schema, Document } from 'mongoose';

export interface IUserAccount extends Document {
  username: string;
  currency: string;
  balance: number;
  symbol: string;
  logo: string;
  accountNumber: string;
  name: string;
  totalTransactions: number;
  totalIncome: number;
  totalSpending: number;
}

const UserAccountSchema: Schema = new Schema({
  username: { type: String, required: true },
  currency: { type: String, required: true },
  balance: { type: Number, default: 0 },
  symbol: { type: String, default: '' },
  logo: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  name: { type: String, default: '' },
  totalTransactions: { type: Number, default: 0 },
  totalIncome: { type: Number, default: 0 },
  totalSpending: { type: Number, default: 0 },
}, { timestamps: true });

// Ensure unique combination of username + currency
UserAccountSchema.index({ username: 1, currency: 1 }, { unique: true });

export default mongoose.model<IUserAccount>('UserAccount', UserAccountSchema);
