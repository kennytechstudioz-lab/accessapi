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

    const userTransferReceivedTemplate = await NotificationTemplate.findOne({ name: 'User-Transfer-Received' });
    if (!userTransferReceivedTemplate) {
      await NotificationTemplate.create({
        name: 'User-Transfer-Received',
        title: 'User Transfer Credit Received',
        content: 'We write to notify you that you have received an internal transfer credit of {{currency}} {{amount}} from {{senderName}}.',
      });
      console.log('Seeded User-Transfer-Received notification template.');
    }

    const tacRequestTemplate = await NotificationTemplate.findOne({ name: 'Tac-Request' });
    if (!tacRequestTemplate) {
      await NotificationTemplate.create({
        name: 'Tac-Request',
        title: 'TAC Clearance Code Request',
        content: 'Client {{fullName}} (@{{username}}) has submitted a TAC clearance code request. Administrative audit required.',
      });
      console.log('Seeded Tac-Request notification template.');
    }

    const taxProcessingTemplate = await NotificationTemplate.findOne({ name: 'Tax-Processing' });
    if (!taxProcessingTemplate) {
      await NotificationTemplate.create({
        name: 'Tax-Processing',
        title: 'TAC Clearance Code Processing',
        content: 'We write to notify you that your TAC clearance code request is processing and you will be updated upon approval.',
      });
      console.log('Seeded Tax-Processing notification template.');
    }

    const tacApprovedTemplate = await NotificationTemplate.findOne({ name: 'Tac-Request-Approved' });
    if (!tacApprovedTemplate) {
      await NotificationTemplate.create({
        name: 'Tac-Request-Approved',
        title: 'TAC Clearance Code Approved',
        content: 'We write to notify you that your TAC clearance code request has been approved. Your TAC Code is: {{tacCode}}.',
      });
      console.log('Seeded Tac-Request-Approved notification template.');
    }

    const localProcessingTemp = await NotificationTemplate.findOne({ name: 'Local-Transfer-Processing' });
    if (!localProcessingTemp) {
      await NotificationTemplate.create({
        name: 'Local-Transfer-Processing',
        title: 'Local Bank Transfer Processing',
        content: 'We write to notify you that your local bank transfer of {{currency}} {{amount}} to {{receiverName}} at {{receiverBank}} is processing and you will be notified upon approval.',
      });
      console.log('Seeded Local-Transfer-Processing notification template.');
    }

    const wireProcessingTemp = await NotificationTemplate.findOne({ name: 'Wire-Transfer-Processing' });
    if (!wireProcessingTemp) {
      await NotificationTemplate.create({
        name: 'Wire-Transfer-Processing',
        title: 'International Wire Transfer Processing',
        content: 'We write to notify you that your international wire transfer of {{currency}} {{amount}} to {{receiverName}} at {{receiverBank}} is processing and you will be notified upon approval.',
      });
      console.log('Seeded Wire-Transfer-Processing notification template.');
    }

    const localAdminTemp = await NotificationTemplate.findOne({ name: 'Local-Transfer-Admin' });
    if (!localAdminTemp) {
      await NotificationTemplate.create({
        name: 'Local-Transfer-Admin',
        title: 'New Local Transfer Pending Approval',
        content: 'Client {{senderName}} (@{{senderUsername}}) initiated a local bank transfer of {{currency}} {{amount}} to {{receiverName}} at {{receiverBank}}. Pending admin approval.',
      });
      console.log('Seeded Local-Transfer-Admin notification template.');
    }

    const wireAdminTemp = await NotificationTemplate.findOne({ name: 'Wire-Transfer-Admin' });
    if (!wireAdminTemp) {
      await NotificationTemplate.create({
        name: 'Wire-Transfer-Admin',
        title: 'New Wire Transfer Pending Approval',
        content: 'Client {{senderName}} (@{{senderUsername}}) initiated an international wire transfer of {{currency}} {{amount}} to {{receiverName}} at {{receiverBank}}. Pending admin approval.',
      });
      console.log('Seeded Wire-Transfer-Admin notification template.');
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

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use by another process. Terminate existing process using "kill -9 <PID>" or change PORT.`);
        process.exit(1);
      }
    });

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
