import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Card from '../models/Card';
import User from '../models/User';
import Notification from '../models/Notification';
import { sendTemplateEmail } from '../utils/mailer';
import { sendToUser } from '../utils/websocket';

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

    // Fetch user for email & notification
    const user = await User.findOne({ username: card.username });
    if (user) {
      const fullName = user.fullName || user.username;
      const maskedCard = card.cardNumber
        ? `${card.cardNumber.substring(0, 4)} **** **** ${card.cardNumber.slice(-4)}`
        : 'your new card';

      // Send Card_Approval email template
      sendTemplateEmail(user.email, 'Card_Approval', {
        fullName,
        username: user.username,
        cardHolder: card.cardHolder || fullName,
        cardNumber: maskedCard,
        cardType: card.cardType || 'Debit',
        expiryDate: card.expiryDate || '',
      }).catch((err) => console.error('Card approval email error:', err));

      // In-app notification
      const notif = new Notification({
        username: user.username,
        title: 'Debit Card Request Approved',
        content: `Congratulations ${fullName}! Your ${card.cardType || 'debit'} card request has been approved. Your card (${maskedCard}) is now active and ready for use.`,
        time: Math.floor(Date.now() / 1000),
        isRead: false,
        admin: false,
      });
      await notif.save();

      sendToUser(user.username, {
        type: 'CARD_APPROVED',
        title: notif.title,
        content: notif.content,
        notification: notif,
      });

      // Clear card request flag on user
      user.requestingCard = false;
      await user.save();
    }

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
