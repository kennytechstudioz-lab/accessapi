import { Schema, model, Document } from 'mongoose';

export interface IBlog extends Document {
  category: string;
  title: string;
  subtitle: string;
  time: number;
  author: string;
  content: string;
  banner: string;
}

const BlogSchema = new Schema<IBlog>({
  category: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, required: true },
  time: { type: Number, default: () => Math.floor(Date.now() / 1000) },
  author: { type: String, default: 'Admin' },
  content: { type: String, required: true },
  banner: { type: String, default: '' },
});

export default model<IBlog>('Blog', BlogSchema);
