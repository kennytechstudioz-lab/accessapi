import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Faq from '../models/Faq';

// List FAQs
export const listFaqs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const faqs = await Faq.find({}).sort({ createdAt: -1 });
    res.json(faqs);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching FAQs', error: error.message });
  }
};

// Create FAQ
export const createFaq = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
       res.status(400).json({ message: 'Missing question or answer' });
       return;
    }

    const faq = new Faq({ question, answer });
    await faq.save();
    res.status(201).json({ message: 'FAQ created successfully', faq });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating FAQ', error: error.message });
  }
};

// Update FAQ
export const updateFaq = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { question, answer } = req.body;
    const faq = await Faq.findById(req.params.id);
    if (!faq) {
       res.status(404).json({ message: 'FAQ not found' });
       return;
    }

    if (question !== undefined) faq.question = question;
    if (answer !== undefined) faq.answer = answer;

    await faq.save();
    res.json({ message: 'FAQ updated successfully', faq });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating FAQ', error: error.message });
  }
};

// Delete FAQ
export const deleteFaq = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Faq.findByIdAndDelete(req.params.id);
    res.json({ message: 'FAQ deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting FAQ', error: error.message });
  }
};
