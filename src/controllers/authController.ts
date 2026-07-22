import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import { sendTemplateEmail } from '../utils/mailer';

// Generate Random Account Number
const generateAccountNumber = (): string => {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString(); // 10 digit number
};

// Generate IBAN
const generateIban = (accountNumber: string): string => {
  return `DE4266215307${accountNumber}`;
};

// Register User
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, fullName, phoneNumber, country, address, dob, pin, baseCurrency } = req.body;

    if (!username || !email || !password || !fullName) {
       res.status(400).json({ message: 'Missing required fields' });
       return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
       res.status(400).json({ message: 'Username or Email already registered' });
       return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const accountNumber = generateAccountNumber();
    const iban = generateIban(accountNumber);
    const routine = Math.floor(100000000 + Math.random() * 900000000).toString(); // 9-digit routing
    const swiftCode = 'DETBDE21XXX';

    // Create User
    const newUser = new User({
      username,
      email,
      passwordHash,
      fullName,
      phoneNumber: phoneNumber || '',
      country: country || '',
      address: address || '',
      dob: dob ? new Date(dob).getTime() : 0,
      pin: pin ? (parseInt(pin) || 1234) : Math.floor(1000 + Math.random() * 9000),
      accountNumber,
      iban,
      routine,
      swiftCode,
      status: 'User',
    });

    await newUser.save();

    // Create default Multi-currency Accounts
    const defaultCurrencies = [
      { code: 'USD', symbol: '$', logo: 'https://flagcdn.com/w320/us.png' },
      { code: 'EUR', symbol: '€', logo: 'https://flagcdn.com/w320/eu.png' },
      { code: 'GBP', symbol: '£', logo: 'https://flagcdn.com/w320/gb.png' },
      { code: 'CAD', symbol: '$', logo: 'https://flagcdn.com/w320/ca.png' },
    ];

    const selectedBaseCurrency = baseCurrency || 'USD';
    for (const curr of defaultCurrencies) {
      const isBase = curr.code === selectedBaseCurrency;
      const initialBalance = isBase ? 1000 : 0; // Seeding 1000 in base currency

      
      const newAcc = new UserAccount({
        username,
        currency: curr.code,
        balance: initialBalance,
        symbol: curr.symbol,
        logo: curr.logo,
        accountNumber,
        name: fullName,
        totalIncome: initialBalance,
        totalTransactions: initialBalance,
      });
      await newAcc.save();
    }

    // Send Registration Email using template "Registration-Successful"
    sendTemplateEmail(newUser.email, 'Registration-Successful', {
      fullName: newUser.fullName,
      username: newUser.username,
      email: newUser.email,
      accountNumber: newUser.accountNumber,
    }).catch((err) => console.error('Error sending registration email:', err));

    // Generate JWT
    const token = jwt.sign(
      { id: newUser._id, username: newUser.username, email: newUser.email, status: newUser.status },
      process.env.JWT_SECRET || 'supersecretjwtkeyforaccessnational12345',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        fullName: newUser.fullName,
        accountNumber: newUser.accountNumber,
        status: newUser.status,
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error during registration', error: error.message });
  }
};

// Login User
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
       res.status(400).json({ message: 'Username/Email and Password are required' });
       return;
    }

    // Find User by username or email
    const user = await User.findOne({
      $or: [{ username }, { email: username }],
    });

    if (!user || user.deleted) {
       res.status(400).json({ message: 'Invalid credentials' });
       return;
    }

    if (user.suspended) {
       res.status(403).json({ message: 'Your account has been suspended. Please contact customer support.' });
       return;
    }

    // Verify Password (supports standard bcrypt, legacy $2y$ PHP hashes, and plain-text fallback)
    let isMatch = false;
    const formattedHash = user.passwordHash ? user.passwordHash.replace(/^\$2y\$/, '$2a$') : '';

    if (formattedHash && (formattedHash.startsWith('$2a$') || formattedHash.startsWith('$2b$'))) {
      isMatch = await bcrypt.compare(password, formattedHash).catch(() => false);
    }

    if (!isMatch) {
      const rawPass = (user as any).pass;
      if (password === user.passwordHash || (rawPass && password === rawPass)) {
        isMatch = true;
        // Automatically upgrade password to modern bcrypt hash
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(password, salt);
        await user.save();
      }
    }

    if (!isMatch) {
       res.status(400).json({ message: 'Invalid credentials' });
       return;
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email, status: user.status },
      process.env.JWT_SECRET || 'supersecretjwtkeyforaccessnational12345',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        accountNumber: user.accountNumber,
        status: user.status,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error during login', error: error.message });
  }
};
