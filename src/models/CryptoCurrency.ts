import { Schema, model, Document } from 'mongoose';

export interface ICryptoCurrency extends Document {
  name: string;
  symbol: string;
  network?: string;
  walletAddress: string;
  qrCode?: string;
  logo?: string;
  memo?: string;
  minimumDeposit?: number;
  instructions?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CryptoCurrencySchema = new Schema<ICryptoCurrency>(
  {
    name: { type: String, required: true },
    symbol: { type: String, required: true, uppercase: true },
    network: { type: String, default: '' },
    walletAddress: { type: String, required: true },
    qrCode: { type: String, default: '' },
    logo: { type: String, default: '' },
    memo: { type: String, default: '' },
    minimumDeposit: { type: Number, default: 0 },
    instructions: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model<ICryptoCurrency>('CryptoCurrency', CryptoCurrencySchema);
