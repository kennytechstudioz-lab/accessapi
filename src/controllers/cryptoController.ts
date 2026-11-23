import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import CryptoCurrency from '../models/CryptoCurrency';
import Transaction from '../models/Transaction';
import User from '../models/User';
import UserAccount from '../models/UserAccount';
import Notification from '../models/Notification';
import { sendToUser } from '../utils/websocket';

// List all Crypto Currencies (Admin)
export const listCryptoCurrencies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cryptos = await CryptoCurrency.find({}).sort({ createdAt: -1 });
    res.json(cryptos);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching crypto currencies', error: error.message });
  }
};

// Get Active Crypto Currencies (Client / Public for Deposits)
export const getActiveCryptoCurrencies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cryptos = await CryptoCurrency.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(cryptos);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching active crypto currencies', error: error.message });
  }
};

// Create Crypto Currency (Admin)
export const createCryptoCurrency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, symbol, network, walletAddress, qrCode, logo, memo, minimumDeposit, instructions, isActive } = req.body;
    if (!name || !symbol || !walletAddress) {
      res.status(400).json({ message: 'Name, symbol, and wallet address are required.' });
      return;
    }

    const newCrypto = new CryptoCurrency({
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      network: network ? network.trim() : '',
      walletAddress: walletAddress.trim(),
      qrCode: qrCode || '',
      logo: logo || '',
      memo: memo ? memo.trim() : '',
      minimumDeposit: minimumDeposit ? parseFloat(minimumDeposit) : 0,
      instructions: instructions || '',
      isActive: isActive !== undefined ? isActive : true,
    });

    await newCrypto.save();
    res.status(201).json({ message: 'Crypto currency created successfully', crypto: newCrypto });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating crypto currency', error: error.message });
  }
};

// Update Crypto Currency (Admin)
export const updateCryptoCurrency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, symbol, network, walletAddress, qrCode, logo, memo, minimumDeposit, instructions, isActive } = req.body;
    const crypto = await CryptoCurrency.findById(req.params.id);
    if (!crypto) {
      res.status(404).json({ message: 'Crypto currency not found' });
      return;
    }

    if (name !== undefined) crypto.name = name.trim();
    if (symbol !== undefined) crypto.symbol = symbol.trim().toUpperCase();
    if (network !== undefined) crypto.network = network.trim();
    if (walletAddress !== undefined) crypto.walletAddress = walletAddress.trim();
    if (qrCode !== undefined) crypto.qrCode = qrCode;
    if (logo !== undefined) crypto.logo = logo;
    if (memo !== undefined) crypto.memo = memo.trim();
    if (minimumDeposit !== undefined) crypto.minimumDeposit = parseFloat(minimumDeposit) || 0;
    if (instructions !== undefined) crypto.instructions = instructions;
    if (isActive !== undefined) crypto.isActive = Boolean(isActive);

    await crypto.save();
    res.json({ message: 'Crypto currency updated successfully', crypto });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating crypto currency', error: error.message });
  }
};

// Delete Crypto Currency (Admin)
export const deleteCryptoCurrency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crypto = await CryptoCurrency.findByIdAndDelete(req.params.id);
    if (!crypto) {
      res.status(404).json({ message: 'Crypto currency not found' });
      return;
    }
    res.json({ message: 'Crypto currency deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting crypto currency', error: error.message });
  }
};

// Submit Crypto Deposit (Client)
export const submitCryptoDeposit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    if (!username) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const { cryptoId, amount, currency, txHash, proofImage, notes } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const crypto = await CryptoCurrency.findById(cryptoId);
    if (!crypto) {
      res.status(404).json({ message: 'Selected crypto currency not found' });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ message: 'Please enter a valid deposit amount.' });
      return;
    }

    if (crypto.minimumDeposit && parsedAmount < crypto.minimumDeposit) {
      res.status(400).json({
        message: `Minimum deposit for ${crypto.name} is ${crypto.minimumDeposit} ${currency || crypto.symbol}.`,
      });
      return;
    }

    // Find destination account to get symbol
    const targetCurrency = currency || 'USD';
    let account = await UserAccount.findOne({ username, currency: targetCurrency });
    if (!account) {
      account = new UserAccount({
        username,
        currency: targetCurrency,
        balance: 0,
        symbol: targetCurrency === 'EUR' ? '€' : targetCurrency === 'GBP' ? '£' : '$',
        accountNumber: user.accountNumber,
        name: user.fullName,
      });
      await account.save();
    }

    const senderLabel = `${crypto.name} (${crypto.symbol}${crypto.network ? ` - ${crypto.network}` : ''})`;
    const stateLabel = txHash ? `Hash: ${txHash}` : 'Pending Crypto Clearance';

    // Create a Pending Deposit Transaction
    const depositTx = new Transaction({
      username,
      amount: parsedAmount,
      transactionType: 'Deposit',
      receiverName: user.fullName,
      receiverAccountNumber: user.accountNumber,
      receiverBank: 'Access National Vault',
      status: 'Pending',
      senderName: senderLabel,
      currency: targetCurrency,
      symbol: account.symbol,
      logo: crypto.logo || account.logo,
      transactionState: stateLabel,
      time: Math.floor(Date.now() / 1000),
    });

    await depositTx.save();

    // Create in-app Notification for the user
    const userNotif = new Notification({
      username,
      title: 'Crypto Deposit Submitted',
      content: `Your deposit of ${account.symbol}${parsedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} via ${senderLabel} has been submitted and is currently pending clearance. Funds will be credited once confirmed on the blockchain network.`,
      time: Math.floor(Date.now() / 1000),
      isRead: false,
      admin: false,
    });
    await userNotif.save();

    sendToUser(username, {
      type: 'DEPOSIT_SUBMITTED',
      title: 'Crypto Deposit Submitted',
      transaction: depositTx,
    });

    res.status(201).json({
      message: 'Deposit notification submitted successfully. Your ledger will credit upon network clearance.',
      transaction: depositTx,
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error submitting crypto deposit', error: error.message });
  }
};
