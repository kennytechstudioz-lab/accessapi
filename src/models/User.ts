import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  profilePicture: string;
  status: string; // Admin, User
  accountNumber: string;
  suspended: boolean;
  pin: number;
  phoneNumber: string;
  zipCode: string;
  time: string;
  token: string;
  swiftCode: string;
  fullName: string;
  routine: string; // Routing Number
  country: string;
  address: string;
  passport: string;
  dob: number;
  onReview: boolean;
  iban: string;
  imf: string;
  taxRequest: boolean;
  imfRequest: boolean;
  swiftCodeRequest: boolean;
  tacCodeRequest: boolean;
  tacCode: string;
  requestingCard: boolean;
  isVerified: boolean;
  idType: string;
  gender: string;
  occupation: string;
  city: string;
  state: string;
  twoFactorEnabled: boolean;
  deleted: boolean;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  profilePicture: { type: String, default: '' },
  status: { type: String, default: 'User' },
  accountNumber: { type: String, required: true, unique: true },
  suspended: { type: Boolean, default: false },
  pin: { type: Number, default: 0 },
  phoneNumber: { type: String, default: '' },
  zipCode: { type: String, default: '' },
  time: { type: String, default: () => Date.now().toString() },
  token: { type: String, default: '' },
  swiftCode: { type: String, default: '' },
  fullName: { type: String, default: '' },
  routine: { type: String, default: '' },
  country: { type: String, default: '' },
  address: { type: String, default: '' },
  passport: { type: String, default: '' },
  dob: { type: Number, default: 0 },
  onReview: { type: Boolean, default: false },
  iban: { type: String, default: '' },
  imf: { type: String, default: '' },
  taxRequest: { type: Boolean, default: false },
  imfRequest: { type: Boolean, default: false },
  swiftCodeRequest: { type: Boolean, default: false },
  tacCodeRequest: { type: Boolean, default: false },
  tacCode: { type: String, default: '' },
  requestingCard: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  idType: { type: String, default: 'Passport' },
  gender: { type: String, default: '' },
  occupation: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  twoFactorEnabled: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
