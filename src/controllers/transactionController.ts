import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Transaction from '../models/Transaction';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import { sendAlertEmail } from '../utils/mailer';

import Notification from '../models/Notification';
import NotificationTemplate from '../models/NotificationTemplate';
import { sendToUser } from '../utils/websocket';

// List Transactions
export const listTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const transactions = await Transaction.find({}).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message });
  }
};

// Resolve Transaction (Approve or Decline)
export const resolveTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, reason } = req.body; // 'Approved' or 'Declined'
    const tx = await Transaction.findById(req.params.id);
    if (!tx) {
       res.status(404).json({ message: 'Transaction not found' });
       return;
    }

    if (tx.status !== 'Pending') {
       res.status(400).json({ message: 'Transaction has already been resolved' });
       return;
    }

    const isDecline = status === 'Declined' || status === 'Failed' || status === 'Rejected';
    const finalStatus = isDecline ? 'Declined' : 'Approved';

    tx.status = finalStatus;
    if (isDecline && reason && typeof reason === 'string') {
      tx.declineReason = reason.trim();
    }
    await tx.save();

    const user = await User.findOne({ username: tx.username });
    if (user) {
      const userAccount = await UserAccount.findOne({ username: tx.username, currency: tx.currency });
      
      if (isDecline) {
        // 1. Refund/recredit debited amount back to client account
        if (userAccount) {
          userAccount.balance += tx.amount;
          userAccount.totalSpending = Math.max(0, (userAccount.totalSpending || 0) - tx.amount);
          await userAccount.save();
        }

        // 2. Dispatch Decline Notification to User
        let appTitle = 'Transfer Declined & Refunded';
        const formattedReason = tx.declineReason ? `Reason: ${tx.declineReason}. ` : '';
        const transferTypeLabel = tx.transactionType === 'Wire-Transfer' ? 'International Wire Transfer' : 'Local Bank Transfer';
        let appContent = `We write to notify you that your ${transferTypeLabel} of ${tx.currency} ${tx.amount.toLocaleString()} to ${tx.receiverName || 'recipient'} has been declined by administration. ${formattedReason}The debited amount of ${tx.currency} ${tx.amount.toLocaleString()} has been re-credited back to your available balance.`;

        try {
          const appTemp = await NotificationTemplate.findOne({
            $or: [{ name: 'Transfer-Declined' }, { name: 'transfer_declined' }]
          });
          if (appTemp) {
            appTitle = appTemp.title
              .replace(/\{\{transferType\}\}/g, transferTypeLabel)
              .replace(/\{\{amount\}\}/g, tx.amount.toLocaleString())
              .replace(/\{\{currency\}\}/g, tx.currency)
              .replace(/\{\{receiverName\}\}/g, tx.receiverName || 'recipient');

            appContent = appTemp.content
              .replace(/\{\{transferType\}\}/g, transferTypeLabel)
              .replace(/\{\{amount\}\}/g, tx.amount.toLocaleString())
              .replace(/\{\{currency\}\}/g, tx.currency)
              .replace(/\{\{receiverName\}\}/g, tx.receiverName || 'recipient')
              .replace(/\{\{reasonText\}\}/g, formattedReason);
          }
        } catch (e) {
          console.error('Error finding Transfer-Declined template:', e);
        }

        const decNotif = new Notification({
          username: user.username,
          title: appTitle,
          content: appContent,
          time: Math.floor(Date.now() / 1000),
          isRead: false,
          admin: false,
        });
        await decNotif.save();

        sendToUser(user.username, {
          type: 'TRANSFER_DECLINED',
          title: appTitle,
          content: appContent,
          reason: tx.declineReason,
          transaction: tx,
          notification: decNotif,
        });
      }

      // Send Alert Email (CREDIT for decline refund, DEBIT for approval)
      await sendAlertEmail(
        user.email,
        user.fullName,
        finalStatus === 'Approved' ? 'DEBIT' : 'CREDIT',
        tx.amount,
        tx.currency,
        tx.symbol,
        tx.transactionType === 'Wire-Transfer' ? 'Wire Clearance Dispatch' : 'Local Transfer Clearance',
        user.accountNumber,
        userAccount ? userAccount.balance : 0
      );
    }

    res.json({ message: `Transaction status marked as ${finalStatus} successfully.`, transaction: tx });
  } catch (error: any) {
    res.status(500).json({ message: 'Error resolving transaction', error: error.message });
  }
};

// Inject Transaction
export const injectTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      username,
      amount,
      transactionType,
      receiverName,
      receiverAccountNumber,
      receiverBank,
      status,
      senderName,
      currency,
      transactionState,
      swiftCode,
      routineNumber,
    } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
       res.status(404).json({ message: 'User not found' });
       return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
       res.status(400).json({ message: 'Invalid transaction amount' });
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

    if (transactionType === 'Credit' || transactionType === 'Deposit') {
      account.balance += parsedAmount;
      account.totalIncome = (account.totalIncome || 0) + parsedAmount;
    } else {
      account.balance -= parsedAmount;
      account.totalSpending = (account.totalSpending || 0) + parsedAmount;
    }
    account.totalTransactions = (account.totalTransactions || 0) + parsedAmount;
    await account.save();

    const newTx = new Transaction({
      username,
      amount: parsedAmount,
      transactionType,
      receiverName: receiverName || user.fullName,
      receiverAccountNumber: receiverAccountNumber || user.accountNumber,
      receiverBank: receiverBank || 'Access National Bank',
      status: status || 'Pending',
      senderName: senderName || 'System Admin',
      currency,
      symbol: account.symbol,
      logo: account.logo,
      transactionState: transactionState || `${transactionType} Ledger entry`,
      swiftCode: swiftCode || '',
      routineNumber: routineNumber || '',
      time: Math.floor(Date.now() / 1000),
    });
    await newTx.save();

    if (status === 'Approved') {
      await sendAlertEmail(
        user.email,
        user.fullName,
        transactionType === 'Credit' || transactionType === 'Deposit' ? 'CREDIT' : 'DEBIT',
        parsedAmount,
        currency,
        account.symbol,
        transactionState || `${transactionType} Ledger entry`,
        user.accountNumber,
        account.balance
      );
    }

    res.status(201).json({ message: 'Transaction created successfully', transaction: newTx });
  } catch (error: any) {
    res.status(500).json({ message: 'Error processing transaction', error: error.message });
  }
};

// Custom Deposit
export const customDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
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
};
