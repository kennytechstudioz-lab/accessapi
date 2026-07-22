import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Currency from '../models/Currency';

// List Currencies
export const listCurrencies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currencies = await Currency.find({}).sort({ createdAt: -1 });
    res.json(currencies);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching currencies', error: error.message });
  }
};

// Create Currency
export const createCurrency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { country, name, symbol, logo, bankName, accountName, accountNumber } = req.body;
    if (!name || !symbol) {
       res.status(400).json({ message: 'Missing required currency details' });
       return;
    }

    const newCurrency = new Currency({
      country: country || '',
      name,
      symbol,
      logo: logo || '',
      bankName: bankName || '',
      accountName: accountName || '',
      accountNumber: accountNumber || '',
    });

    await newCurrency.save();
    res.status(201).json({ message: 'Currency created successfully', currency: newCurrency });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating currency', error: error.message });
  }
};

// Update Currency
export const updateCurrency = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { country, name, symbol, logo, bankName, accountName, accountNumber } = req.body;
    const currency = await Currency.findById(req.params.id);
    if (!currency) {
       res.status(404).json({ message: 'Currency not found' });
       return;
    }

    if (country !== undefined) currency.country = country;
    if (name !== undefined) currency.name = name;
    if (symbol !== undefined) currency.symbol = symbol;
    if (logo !== undefined) currency.logo = logo;
    if (bankName !== undefined) currency.bankName = bankName;
    if (accountName !== undefined) currency.accountName = accountName;
    if (accountNumber !== undefined) currency.accountNumber = accountNumber;

    await currency.save();
    res.json({ message: 'Currency updated successfully', currency });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating currency', error: error.message });
  }
};

// Delete Currency
export const deleteCurrency = async (req: AuthRequest, res: Response): Promise<void> => {
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
};
