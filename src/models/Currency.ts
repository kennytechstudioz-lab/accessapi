import { Schema, model, Document } from 'mongoose';

export interface ICurrency extends Document {
  name: string;
  symbol: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  logo?: string;
  balance?: number;
  totalDeposit?: number;
  totalWithdrawal?: number;
  totalTransaction?: number;
}

const CurrencySchema = new Schema<ICurrency>({
  name: { type: String, required: true },
  symbol: { type: String, default: '' },
  bankName: { type: String, default: '' },
  accountName: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  logo: { type: String, default: '' },
  balance: { type: Number, default: 0 },
  totalDeposit: { type: Number, default: 0 },
  totalWithdrawal: { type: Number, default: 0 },
  totalTransaction: { type: Number, default: 0 },
});

export default model<ICurrency>('Currency', CurrencySchema);
