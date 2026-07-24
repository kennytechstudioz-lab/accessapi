import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
  username: string;
  amount: number;
  transactionType: string; // Deposit, Local-Transfer, Internal-Transfer, Credit, Debit, etc.
  receiverName: string;
  receiverAccountName: string;
  receiverAccountNumber: string;
  receiverBank: string;
  receiverUsername: string;
  status: string; // Pending, Approved, Failed
  time: number;
  senderName: string;
  email: string;
  dateCreated: string;
  currency: string;
  symbol: string;
  logo: string;
  swiftCode: string;
  routineNumber: string;
  receiverAddress: string;
  transactionState: string;
  declineReason: string;
}

const TransactionSchema: Schema = new Schema({
  username: { type: String, required: true },
  amount: { type: Number, required: true },
  transactionType: { type: String, required: true },
  receiverName: { type: String, default: '' },
  receiverAccountName: { type: String, default: '' },
  receiverAccountNumber: { type: String, default: '' },
  receiverBank: { type: String, default: '' },
  receiverUsername: { type: String, default: '' },
  status: { type: String, default: 'Pending' }, // Pending, Approved, Failed, Declined
  time: { type: Number, default: () => Date.now() },
  senderName: { type: String, default: '' },
  email: { type: String, default: '' },
  dateCreated: { type: String, default: () => new Date().toISOString() },
  currency: { type: String, default: 'USD' },
  symbol: { type: String, default: '$' },
  logo: { type: String, default: '' },
  swiftCode: { type: String, default: '' },
  routineNumber: { type: String, default: '' },
  receiverAddress: { type: String, default: '' },
  transactionState: { type: String, default: '' },
  declineReason: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model<ITransaction>('Transaction', TransactionSchema);
