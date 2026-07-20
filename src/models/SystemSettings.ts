import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemSettings extends Document {
  companyName: string;
  companyBankName: string;
  companyAccountNumber: string;
  systemEmail: string;
  companyBank: string;
  routineNumber: string;
  companyAddress: string;
  companyPhoneNumber: string;
  companyDomain: string;
  swiftCode: string;
  sortCode: string;
  btcAddress: string;
  usdtAddress: string;
}

const SystemSettingsSchema: Schema = new Schema({
  companyName: { type: String, default: 'Access National Ltd' },
  companyBankName: { type: String, default: 'Adiko Group' },
  companyAccountNumber: { type: String, default: '0034588686' },
  systemEmail: { type: String, default: 'support@accessnationalltd.online' },
  companyBank: { type: String, default: 'Adiko Bank' },
  routineNumber: { type: String, default: 'DE42' },
  companyAddress: { type: String, default: '6060 ROCKSIDE WOODS BLVD, OH United States' },
  companyPhoneNumber: { type: String, default: '+1 (555) 123-4567' },
  companyDomain: { type: String, default: 'accessnationalltd.com' },
  swiftCode: { type: String, default: 'DETBDE21XXX' },
  sortCode: { type: String, default: '66215307' },
  btcAddress: { type: String, default: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' },
  usdtAddress: { type: String, default: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
}, { timestamps: true });

export default mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);
