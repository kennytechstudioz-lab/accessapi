import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Card from '../models/Card';

// List Cards
export const listCards = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cards = await Card.find({}).sort({ createdAt: -1 });
    res.json(cards);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching cards', error: error.message });
  }
};

// Approve Card
export const approveCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) {
       res.status(404).json({ message: 'Card not found' });
       return;
    }
    card.status = 'Approved';
    await card.save();
    res.json({ message: 'Card approved successfully', card });
  } catch (error: any) {
    res.status(500).json({ message: 'Error approving card', error: error.message });
  }
};

// Reject Card
export const rejectCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) {
       res.status(404).json({ message: 'Card not found' });
       return;
    }
    card.status = 'Rejected';
    await card.save();
    res.json({ message: 'Card rejected successfully', card });
  } catch (error: any) {
    res.status(500).json({ message: 'Error rejecting card', error: error.message });
  }
};
