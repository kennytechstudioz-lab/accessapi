import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import Transaction from '../models/Transaction';
import Card from '../models/Card';
import { sendAlertEmail, sendEmail } from '../utils/mailer';

const router = Router();

// Get Profile
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
});

// Get Accounts/Balances
router.get('/accounts', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await UserAccount.find({ username: req.user?.username });
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching accounts', error: error.message });
  }
});

// Get Transactions
router.get('/transactions', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const transactions = await Transaction.find({ username: req.user?.username }).sort({ time: -1 });
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message });
  }
});

// Request Transfer Security Code (TAC / IMF / TAX)
router.post('/request-code', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.body; // TAC, IMF, TAX
    const user = await User.findById(req.user?.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    let codeValue = '';
    let emailSubject = '';
    let emailBody = '';

    if (type === 'TAC') {
      user.tacCodeRequest = true;
      if (!user.tacCode) {
        // Generate random 5 digit TAC code
        user.tacCode = Math.floor(10000 + Math.random() * 90000).toString();
      }
      codeValue = user.tacCode;
      emailSubject = 'Transaction Authorization Code (TAC)';
      emailBody = `<p>Your Transaction Authorization Code (TAC) for completing your transfer is: <b>${codeValue}</b></p>`;
    } else if (type === 'IMF') {
      user.imfRequest = true;
      if (!user.imf) {
        user.imf = Math.floor(10000 + Math.random() * 90000).toString();
      }
      codeValue = user.imf;
      emailSubject = 'International Monetary Fund (IMF) Code';
      emailBody = `<p>Your International Monetary Fund (IMF) Clearance Code for completing your international wire transfer is: <b>${codeValue}</b></p>`;
    } else if (type === 'TAX') {
      user.taxRequest = true;
      codeValue = 'TAX-' + Math.floor(10000 + Math.random() * 90000).toString();
      emailSubject = 'Tax Clearance Code (TAX)';
      emailBody = `<p>Your Tax Clearance Code (TAX) for completing your transfer is: <b>${codeValue}</b></p>`;
    } else {
       res.status(400).json({ message: 'Invalid code type requested' });
       return;
    }

    await user.save();

    // Send email with the code
    await sendEmail(
      user.email,
      emailSubject,
      `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #e53e3e; text-align: center;">Access National Bank</h2>
          <p>Dear ${user.fullName},</p>
          <p>You have requested a security clearance code for a pending transaction.</p>
          ${emailBody}
          <p>Please enter this code on the transfer confirmation screen to proceed.</p>
          <p>If you did not initiate this transfer, please contact our security team immediately.</p>
          <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 20px 0;" />
          <p style="font-size: 11px; color: #a0aec0; text-align: center;">&copy; Access National Bank support.</p>
        </div>
      `
    );

    res.json({ message: `A ${type} code has been generated and sent to your registered email.` });
  } catch (error: any) {
    res.status(500).json({ message: 'Error requesting security code', error: error.message });
  }
});

// Perform Transfer
router.post('/transfer', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      type, // 'internal', 'local', 'wire'
      amount,
      currency,
      receiverAccountNumber,
      receiverName,
      receiverBank,
      swiftCode,
      routineNumber,
      receiverAddress,
      codeType, // 'TAC', 'IMF', 'TAX'
      codeValue,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
       res.status(400).json({ message: 'Invalid transfer amount' });
       return;
    }

    const sender = await User.findById(req.user?.id);
    if (!sender) {
       res.status(404).json({ message: 'Sender not found' });
       return;
    }

    // Check balance
    const senderAccount = await UserAccount.findOne({ username: sender.username, currency });
    if (!senderAccount || senderAccount.balance < parsedAmount) {
       res.status(400).json({ message: 'Insufficient funds in the selected currency' });
       return;
    }

    // Check Security Code Requirements
    // Under certain conditions (e.g. large transfers or specific account setups),
    // the system simulates the requirement of a TAC, IMF, or TAX code.
    if (codeType === 'TAC') {
      if (!sender.tacCode || sender.tacCode !== codeValue) {
         res.status(400).json({ message: 'Invalid Transaction Authorization Code (TAC)', codeError: 'TAC' });
         return;
      }
    } else if (codeType === 'IMF') {
      if (!sender.imf || sender.imf !== codeValue) {
         res.status(400).json({ message: 'Invalid International Monetary Fund (IMF) Clearance Code', codeError: 'IMF' });
         return;
      }
    } else if (codeType === 'TAX') {
      // Allow custom validation or default
      if (codeValue !== 'TAX-APPROVED' && codeValue !== sender.tacCode) { // fallback
         res.status(400).json({ message: 'Invalid Tax Clearance Code (TAX)', codeError: 'TAX' });
         return;
      }
    }

    // Process Transfer
    if (type === 'internal') {
      // Find receiver within the bank
      const receiver = await User.findOne({
        $or: [{ accountNumber: receiverAccountNumber }, { username: receiverAccountNumber }],
      });

      if (!receiver) {
         res.status(404).json({ message: 'Receiver account number not found in this bank' });
         return;
      }

      if (receiver.username === sender.username) {
         res.status(400).json({ message: 'Cannot transfer to your own account' });
         return;
      }

      // Deduct from sender
      senderAccount.balance -= parsedAmount;
      senderAccount.totalSpending += parsedAmount;
      senderAccount.totalTransactions += parsedAmount;
      await senderAccount.save();

      // Credit to receiver
      let receiverAccount = await UserAccount.findOne({ username: receiver.username, currency });
      if (!receiverAccount) {
        // If receiver doesn't have this currency, create it
        receiverAccount = new UserAccount({
          username: receiver.username,
          currency,
          balance: 0,
          symbol: senderAccount.symbol,
          logo: senderAccount.logo,
          accountNumber: receiver.accountNumber,
          name: receiver.fullName,
        });
      }
      receiverAccount.balance += parsedAmount;
      receiverAccount.totalIncome += parsedAmount;
      receiverAccount.totalTransactions += parsedAmount;
      await receiverAccount.save();

      // Create Transactions
      const debitTx = new Transaction({
        username: sender.username,
        amount: parsedAmount,
        transactionType: 'Internal-Transfer',
        receiverName: receiver.fullName,
        receiverAccountNumber: receiver.accountNumber,
        receiverBank: 'Access National Bank',
        receiverUsername: receiver.username,
        status: 'Approved',
        senderName: sender.fullName,
        currency,
        symbol: senderAccount.symbol,
        logo: senderAccount.logo,
      });
      await debitTx.save();

      const creditTx = new Transaction({
        username: receiver.username,
        amount: parsedAmount,
        transactionType: 'Credit',
        receiverName: receiver.fullName,
        receiverAccountNumber: receiver.accountNumber,
        receiverBank: 'Access National Bank',
        receiverUsername: receiver.username,
        status: 'Approved',
        senderName: sender.fullName,
        currency,
        symbol: senderAccount.symbol,
        logo: senderAccount.logo,
      });
      await creditTx.save();

      // Send Email Alerts
      await sendAlertEmail(
        sender.email,
        sender.fullName,
        'DEBIT',
        parsedAmount,
        currency,
        senderAccount.symbol,
        `Internal transfer to ${receiver.fullName}`,
        sender.accountNumber,
        senderAccount.balance
      );

      await sendAlertEmail(
        receiver.email,
        receiver.fullName,
        'CREDIT',
        parsedAmount,
        currency,
        senderAccount.symbol,
        `Transfer received from ${sender.fullName}`,
        receiver.accountNumber,
        receiverAccount.balance
      );

      res.json({ message: 'Internal transfer completed successfully.', transaction: debitTx });
    } else {
      // Local Transfer or Wire Transfer: Needs Admin Approval
      senderAccount.balance -= parsedAmount;
      senderAccount.totalSpending += parsedAmount;
      senderAccount.totalTransactions += parsedAmount;
      await senderAccount.save();

      const pendingTx = new Transaction({
        username: sender.username,
        amount: parsedAmount,
        transactionType: type === 'local' ? 'Local-Transfer' : 'Wire-Transfer',
        receiverName: receiverName || 'Unknown Receiver',
        receiverAccountNumber: receiverAccountNumber,
        receiverBank: receiverBank || 'External Bank',
        status: 'Pending',
        senderName: sender.fullName,
        currency,
        symbol: senderAccount.symbol,
        logo: senderAccount.logo,
        swiftCode: swiftCode || '',
        routineNumber: routineNumber || '',
        receiverAddress: receiverAddress || '',
      });
      await pendingTx.save();

      // Send Debit Alert (but show status as Pending in details or email)
      await sendAlertEmail(
        sender.email,
        sender.fullName,
        'DEBIT',
        parsedAmount,
        currency,
        senderAccount.symbol,
        `Pending transfer request to ${receiverName || 'External Account'} (${receiverBank})`,
        sender.accountNumber,
        senderAccount.balance
      );

      res.json({
        message: 'Your transfer is processing. It has been queued for clearance.',
        transaction: pendingTx,
      });
    }
  } catch (error: any) {
    console.error('Transfer error:', error);
    res.status(500).json({ message: 'Error processing transfer', error: error.message });
  }
});

// Submit KYC
router.post('/kyc', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { passport, profilePicture } = req.body;
    const user = await User.findById(req.user?.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    if (passport) user.passport = passport;
    if (profilePicture) user.profilePicture = profilePicture;
    user.onReview = true; // Set status as on review for admin to approve
    await user.save();

    res.json({ message: 'KYC documents submitted successfully. Account is under review.', user });
  } catch (error: any) {
    res.status(500).json({ message: 'Error submitting KYC', error: error.message });
  }
});

// Get Cards
router.get('/cards', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cards = await Card.find({ username: req.user?.username });
    res.json(cards);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching cards', error: error.message });
  }
});

// Request Card
router.post('/cards/request', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cardType } = req.body;
    const user = await User.findById(req.user?.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    // Generate random card details
    const cardNumber = '4' + Math.floor(100000000000000 + Math.random() * 900000000000000).toString(); // simple credit card format
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const currentYear = new Date().getFullYear();
    const expiryDate = `12/${(currentYear + 4).toString().substring(2)}`;

    const newCard = new Card({
      username: user.username,
      cardNumber,
      cardType: cardType || 'Visa',
      cardHolder: user.fullName || user.username,
      expiryDate,
      cvv,
      status: 'Pending',
      balance: 5000, // credit limit seed
    });

    await newCard.save();

    // Toggle requestingCard flag
    user.requestingCard = true;
    await user.save();

    res.status(201).json({ message: 'Card request submitted successfully.', card: newCard });
  } catch (error: any) {
    res.status(500).json({ message: 'Error requesting card', error: error.message });
  }
});

export default router;
