import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';
import User from './models/User';
import SystemSettings from './models/SystemSettings';
import NotificationTemplate from './models/NotificationTemplate';
import { initWebSocketServer } from './utils/websocket';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

const server = http.createServer(app);
initWebSocketServer(server);

// Middlewares
app.use(cors({
  origin: '*', // Allow all origins for dev/testing ease
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Request logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);

// Base route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Access National Bank API is active.' });
});

// Seed Admin Account, Notification Templates & Default Settings
const seedDatabase = async () => {
  try {
    // Seed Settings
    const settingsCount = await SystemSettings.countDocuments();
    if (settingsCount === 0) {
      const defaultSettings = new SystemSettings();
      await defaultSettings.save();
      console.log('Seeded default system settings.');
    }

    // Seed Notification Templates for KYC Verification
    const kycProcessingTemplate = await NotificationTemplate.findOne({ name: 'kyc_processing' });
    if (!kycProcessingTemplate) {
      await NotificationTemplate.create({
        name: 'kyc_processing',
        title: 'Identity Verification Under Review',
        content: 'Your uploaded identity clearance document ({idType}) has been received and is currently under review by our compliance desk. Reviews usually complete within 1-2 hours.',
      });
      console.log('Seeded kyc_processing notification template.');
    }

    const kycPendingAdminTemplate = await NotificationTemplate.findOne({ name: 'kyc_pending_admin' });
    if (!kycPendingAdminTemplate) {
      await NotificationTemplate.create({
        name: 'kyc_pending_admin',
        title: 'New Identity Verification Pending',
        content: 'Client {fullName} (@{username}) has submitted an identity clearance document ({idType}) for KYC verification. Administrative audit required.',
      });
      console.log('Seeded kyc_pending_admin notification template.');
    }

    // Seed Admin
    const adminUsername = 'Admin';
    const adminEmail = 'admin@accessnational.com';
    const existingAdmin = await User.findOne({ username: adminUsername });

    if (!existingAdmin) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('AdminPassword123!', salt);
      const adminUser = new User({
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        fullName: 'Access National Administrator',
        status: 'Admin',
        accountNumber: '0000000000',
        iban: 'DE42662153070000000000',
        routine: '000000000',
        swiftCode: 'DETBDE21XXX',
        isVerified: true,
      });

      await adminUser.save();
      console.log('--- Database Seeding Complete ---');
      console.log('Admin account created:');
      console.log(`Username: ${adminUsername}`);
      console.log('Password: AdminPassword123!');
      console.log('---------------------------------');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

// Database Connection
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/access-national';
console.log('Connecting to MongoDB at:', mongoUri);

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('MongoDB Connected successfully.');
    await seedDatabase();
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
