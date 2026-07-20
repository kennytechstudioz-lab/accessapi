import { Router, Response } from 'express';
import { authenticateToken, requireAdmin, AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import Transaction from '../models/Transaction';
import Card from '../models/Card';
import SystemSettings from '../models/SystemSettings';
import Currency from '../models/Currency';
import Notification from '../models/Notification';
import Blog from '../models/Blog';
import Faq from '../models/Faq';
import Terms from '../models/Terms';
import EmailTemplate from '../models/EmailTemplate';
import NotificationTemplate from '../models/NotificationTemplate';
import { sendAlertEmail, sendEmail } from '../utils/mailer';

const router = Router();

// Apply auth and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get All Users
router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ deleted: false }).sort({ createdAt: -1 });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

// Get User by Username
router.get('/users/:username', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }
    const accounts = await UserAccount.find({ username: user.username });
    const cards = await Card.find({ username: user.username });
    res.json({ user, accounts, cards });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching user details', error: error.message });
  }
});

// Update User
router.put('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      country,
      address,
      pin,
      suspended,
      isVerified,
      onReview,
      swiftCode,
      routine,
      iban,
      tacCode,
      imf,
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (country !== undefined) user.country = country;
    if (address !== undefined) user.address = address;
    if (pin !== undefined) user.pin = parseInt(pin) || 0;
    if (suspended !== undefined) user.suspended = suspended;
    if (isVerified !== undefined) user.isVerified = isVerified;
    if (onReview !== undefined) user.onReview = onReview;
    if (swiftCode !== undefined) user.swiftCode = swiftCode;
    if (routine !== undefined) user.routine = routine;
    if (iban !== undefined) user.iban = iban;
    if (tacCode !== undefined) user.tacCode = tacCode;
    if (imf !== undefined) user.imf = imf;

    await user.save();
    res.json({ message: 'User details updated successfully', user });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

// Delete User (Soft Delete)
router.delete('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    user.deleted = true;
    await user.save();
    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting user', error: error.message });
  }
});

// Adjust User Balance
router.put('/users/:id/balance', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currency, amount } = req.body; // e.g. amount can be absolute balance or change. Let's make it absolute.
    const user = await User.findById(req.params.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
       res.status(400).json({ message: 'Invalid balance amount' });
       return;
    }

    let account = await UserAccount.findOne({ username: user.username, currency });
    if (!account) {
      // If doesn't exist, create it
      account = new UserAccount({
        username: user.username,
        currency,
        balance: 0,
        symbol: currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$',
        accountNumber: user.accountNumber,
        name: user.fullName,
      });
    }

    const previousBalance = account.balance;
    account.balance = parsedAmount;
    await account.save();

    // Create a ledger adjustment transaction
    const diff = parsedAmount - previousBalance;
    if (diff !== 0) {
      const type = diff > 0 ? 'Credit' : 'Debit';
      const adjTx = new Transaction({
        username: user.username,
        amount: Math.abs(diff),
        transactionType: type,
        receiverName: user.fullName,
        receiverAccountNumber: user.accountNumber,
        receiverBank: 'Access National Bank',
        status: 'Approved',
        senderName: 'System Admin',
        currency,
        symbol: account.symbol,
        logo: account.logo,
      });
      await adjTx.save();

      // Send Credit/Debit alert
      await sendAlertEmail(
        user.email,
        user.fullName,
        diff > 0 ? 'CREDIT' : 'DEBIT',
        Math.abs(diff),
        currency,
        account.symbol,
        `Account balance adjusted by Administrator`,
        user.accountNumber,
        account.balance
      );
    }

    res.json({ message: 'User account balance updated successfully', account });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating balance', error: error.message });
  }
});

// Get All Transactions
router.get('/transactions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const transactions = await Transaction.find().sort({ time: -1 });
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message });
  }
});

// Update Transaction Status (Approve/Reject)
router.put('/transactions/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body; // 'Approved' or 'Failed'
    const tx = await Transaction.findById(req.params.id);
    if (!tx) {
       res.status(404).json({ message: 'Transaction not found' });
       return;
    }

    if (tx.status !== 'Pending') {
       res.status(400).json({ message: `Transaction is already resolved as ${tx.status}` });
       return;
    }

    const user = await User.findOne({ username: tx.username });
    if (!user) {
       res.status(404).json({ message: 'User associated with transaction not found' });
       return;
    }

    const account = await UserAccount.findOne({ username: tx.username, currency: tx.currency });
    if (!account) {
       res.status(404).json({ message: 'User account not found' });
       return;
    }

    tx.status = status;
    await tx.save();

    if (status === 'Approved') {
      // It is already debited when transfer was requested, so just notify
      // Send approval mail
      await sendEmail(
        user.email,
        'Transaction Approved and Dispatched',
        `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2f855a; text-align: center;">Access National Bank</h2>
            <p>Dear ${user.fullName},</p>
            <p>Your pending transfer request of <b>${tx.symbol}${tx.amount.toLocaleString()} ${tx.currency}</b> to <b>${tx.receiverName}</b> has been successfully approved and processed by our billing department.</p>
            <p>Transaction reference ID: ${tx._id}</p>
            <p>Thank you for choosing Access National Bank.</p>
          </div>
        `
      );
    } else if (status === 'Failed' || status === 'Rejected') {
      // Refund user balance
      account.balance += tx.amount;
      account.totalSpending = Math.max(0, account.totalSpending - tx.amount);
      await account.save();

      // Save refund transaction
      const refundTx = new Transaction({
        username: user.username,
        amount: tx.amount,
        transactionType: 'Credit',
        receiverName: user.fullName,
        receiverAccountNumber: user.accountNumber,
        receiverBank: 'Access National Bank',
        status: 'Approved',
        senderName: 'System Refund',
        currency: tx.currency,
        symbol: tx.symbol,
        logo: tx.logo,
      });
      await refundTx.save();

      // Send Refund email
      await sendAlertEmail(
        user.email,
        user.fullName,
        'CREDIT',
        tx.amount,
        tx.currency,
        tx.symbol,
        `Refund for rejected transfer transaction Ref: ${tx._id}`,
        user.accountNumber,
        account.balance
      );
    }

    res.json({ message: `Transaction status updated to ${status}`, transaction: tx });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating transaction status', error: error.message });
  }
});

// Admin Custom Deposit
router.post('/deposit', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, amount, currency, description } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
       res.status(400).json({ message: 'Invalid deposit amount' });
       return;
    }

    let account = await UserAccount.findOne({ username, currency });
    if (!account) {
      account = new UserAccount({
        username,
        currency,
        balance: 0,
        symbol: currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$',
        accountNumber: user.accountNumber,
        name: user.fullName,
      });
    }

    account.balance += parsedAmount;
    account.totalIncome += parsedAmount;
    account.totalTransactions += parsedAmount;
    await account.save();

    const depositTx = new Transaction({
      username,
      amount: parsedAmount,
      transactionType: 'Deposit',
      receiverName: user.fullName,
      receiverAccountNumber: user.accountNumber,
      receiverBank: 'Access National Bank',
      status: 'Approved',
      senderName: 'Bank Deposit Desk',
      currency,
      symbol: account.symbol,
      logo: account.logo,
      transactionState: description || 'Bank Deposit Credit',
    });
    await depositTx.save();

    // Send Alert email
    await sendAlertEmail(
      user.email,
      user.fullName,
      'CREDIT',
      parsedAmount,
      currency,
      account.symbol,
      description || 'Direct Deposit Credit',
      user.accountNumber,
      account.balance
    );

    res.status(201).json({ message: 'Deposit created successfully', transaction: depositTx });
  } catch (error: any) {
    res.status(500).json({ message: 'Error processing deposit', error: error.message });
  }
});

// Approve Requested Card
router.put('/cards/:id/approve', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) {
       res.status(404).json({ message: 'Card not found' });
       return;
    }
    card.status = 'Active';
    await card.save();

    // Toggle user card requesting state if no other cards are pending
    const user = await User.findOne({ username: card.username });
    if (user) {
      const pendingCardsCount = await Card.countDocuments({ username: card.username, status: 'Pending' });
      if (pendingCardsCount === 0) {
        user.requestingCard = false;
        await user.save();
      }
    }

    res.json({ message: 'Card request approved', card });
  } catch (error: any) {
    res.status(500).json({ message: 'Error approving card', error: error.message });
  }
});

// Get System Settings
router.get('/settings', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
      await settings.save();
    }
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
});

// Update System Settings
router.put('/settings', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await SystemSettings.findOne();
    if (!settings) {
      settings = new SystemSettings();
    }

    const {
      companyName,
      companyBankName,
      companyAccountNumber,
      systemEmail,
      companyBank,
      routineNumber,
      companyAddress,
      companyPhoneNumber,
      companyDomain,
      swiftCode,
      sortCode,
      btcAddress,
      usdtAddress,
    } = req.body;

    if (companyName !== undefined) settings.companyName = companyName;
    if (companyBankName !== undefined) settings.companyBankName = companyBankName;
    if (companyAccountNumber !== undefined) settings.companyAccountNumber = companyAccountNumber;
    if (systemEmail !== undefined) settings.systemEmail = systemEmail;
    if (companyBank !== undefined) settings.companyBank = companyBank;
    if (routineNumber !== undefined) settings.routineNumber = routineNumber;
    if (companyAddress !== undefined) settings.companyAddress = companyAddress;
    if (companyPhoneNumber !== undefined) settings.companyPhoneNumber = companyPhoneNumber;
    if (companyDomain !== undefined) settings.companyDomain = companyDomain;
    if (swiftCode !== undefined) settings.swiftCode = swiftCode;
    if (sortCode !== undefined) settings.sortCode = sortCode;
    if (btcAddress !== undefined) settings.btcAddress = btcAddress;
    if (usdtAddress !== undefined) settings.usdtAddress = usdtAddress;

    await settings.save();
    res.json({ message: 'System settings updated successfully', settings });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
});

// --- CURRENCIES CRUD ---
router.get('/currencies', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currencies = await Currency.find();
    res.json(currencies);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching currencies', error: error.message });
  }
});

router.post('/currencies', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, symbol, bankName, accountName, accountNumber, logo } = req.body;
    const newCurrency = new Currency({ name, symbol, bankName, accountName, accountNumber, logo });
    await newCurrency.save();
    res.status(201).json({ message: 'Currency created successfully', currency: newCurrency });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating currency', error: error.message });
  }
});

router.put('/currencies/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currency = await Currency.findById(req.params.id);
    if (!currency) {
      res.status(404).json({ message: 'Currency not found' });
      return;
    }
    const { name, symbol, bankName, accountName, accountNumber, logo } = req.body;
    if (name !== undefined) currency.name = name;
    if (symbol !== undefined) currency.symbol = symbol;
    if (bankName !== undefined) currency.bankName = bankName;
    if (accountName !== undefined) currency.accountName = accountName;
    if (accountNumber !== undefined) currency.accountNumber = accountNumber;
    if (logo !== undefined) currency.logo = logo;
    await currency.save();
    res.json({ message: 'Currency updated successfully', currency });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating currency', error: error.message });
  }
});

router.delete('/currencies/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currency = await Currency.findByIdAndDelete(req.params.id);
    if (!currency) {
      res.status(404).json({ message: 'Currency not found' });
      return;
    }
    res.json({ message: 'Currency deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting currency', error: error.message });
  }
});

// --- CARDS ---
router.get('/cards', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cards = await Card.find().sort({ createdAt: -1 });
    res.json(cards);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching cards', error: error.message });
  }
});

router.put('/cards/:id/reject', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) {
      res.status(404).json({ message: 'Card not found' });
      return;
    }
    card.status = 'Rejected';
    await card.save();
    res.json({ message: 'Card request rejected', card });
  } catch (error: any) {
    res.status(500).json({ message: 'Error rejecting card', error: error.message });
  }
});

// --- NOTIFICATIONS ---
router.get('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await Notification.find().sort({ time: -1 });
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
});

router.post('/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, content, username, admin } = req.body;
    const newNotif = new Notification({
      title,
      content,
      username: username || 'All',
      time: Math.floor(Date.now() / 1000),
      isRead: false,
      admin: admin !== undefined ? admin : true,
    });
    await newNotif.save();
    res.status(201).json({ message: 'Notification created successfully', notification: newNotif });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating notification', error: error.message });
  }
});

router.delete('/notifications/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting notification', error: error.message });
  }
});

// --- FAQ ---
router.get('/faq', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const faqs = await Faq.find();
    res.json(faqs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching FAQs', error: error.message });
  }
});

router.post('/faq', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { category, question, answer } = req.body;
    const newFaq = new Faq({ category, question, answer });
    await newFaq.save();
    res.status(201).json({ message: 'FAQ created successfully', faq: newFaq });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating FAQ', error: error.message });
  }
});

router.put('/faq/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
      res.status(404).json({ message: 'FAQ not found' });
      return;
    }
    const { category, question, answer } = req.body;
    if (category !== undefined) faq.category = category;
    if (question !== undefined) faq.question = question;
    if (answer !== undefined) faq.answer = answer;
    await faq.save();
    res.json({ message: 'FAQ updated successfully', faq });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating FAQ', error: error.message });
  }
});

router.delete('/faq/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Faq.findByIdAndDelete(req.params.id);
    res.json({ message: 'FAQ deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting FAQ', error: error.message });
  }
});

// --- BLOGS ---
router.get('/blogs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const blogs = await Blog.find().sort({ time: -1 });
    res.json(blogs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching blogs', error: error.message });
  }
});

router.post('/blogs', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { category, title, subtitle, content, banner, author } = req.body;
    const newBlog = new Blog({
      category,
      title,
      subtitle,
      content,
      banner,
      author: author || 'Admin',
      time: Math.floor(Date.now() / 1000),
    });
    await newBlog.save();
    res.status(201).json({ message: 'Blog post created successfully', blog: newBlog });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating blog post', error: error.message });
  }
});

router.put('/blogs/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      res.status(404).json({ message: 'Blog post not found' });
      return;
    }
    const { category, title, subtitle, content, banner, author } = req.body;
    if (category !== undefined) blog.category = category;
    if (title !== undefined) blog.title = title;
    if (subtitle !== undefined) blog.subtitle = subtitle;
    if (content !== undefined) blog.content = content;
    if (banner !== undefined) blog.banner = banner;
    if (author !== undefined) blog.author = author;
    await blog.save();
    res.json({ message: 'Blog post updated successfully', blog });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating blog post', error: error.message });
  }
});

router.delete('/blogs/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Blog.findByIdAndDelete(req.params.id);
    res.json({ message: 'Blog post deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting blog post', error: error.message });
  }
});

// --- TERMS & PRIVACY ---
router.get('/terms', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let terms = await Terms.findOne();
    if (!terms) {
      terms = new Terms({ title: 'Terms and Privacy Policy', content: 'Default policy content goes here.' });
      await terms.save();
    }
    res.json(terms);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching terms', error: error.message });
  }
});

router.put('/terms', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let terms = await Terms.findOne();
    if (!terms) {
      terms = new Terms();
    }
    const { title, content } = req.body;
    if (title !== undefined) terms.title = title;
    if (content !== undefined) terms.content = content;
    terms.updatedAt = new Date();
    await terms.save();
    res.json({ message: 'Terms updated successfully', terms });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating terms', error: error.message });
  }
});

// --- EMAIL TEMPLATES ---
router.get('/emails', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await EmailTemplate.find();
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching email templates', error: error.message });
  }
});

router.put('/emails/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ message: 'Email template not found' });
      return;
    }
    const { title, content } = req.body;
    if (title !== undefined) template.title = title;
    if (content !== undefined) template.content = content;
    await template.save();
    res.json({ message: 'Email template updated successfully', template });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating email template', error: error.message });
  }
});

// --- NOTIFICATION TEMPLATES ---
router.get('/notification-templates', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await NotificationTemplate.find();
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching notification templates', error: error.message });
  }
});

router.put('/notification-templates/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const template = await NotificationTemplate.findById(req.params.id);
    if (!template) {
      res.status(404).json({ message: 'Notification template not found' });
      return;
    }
    const { title, content } = req.body;
    if (title !== undefined) template.title = title;
    if (content !== undefined) template.content = content;
    await template.save();
    res.json({ message: 'Notification template updated successfully', template });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating notification template', error: error.message });
  }
});

export default router;
