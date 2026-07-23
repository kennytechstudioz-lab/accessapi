import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import Notification from '../models/Notification';
import NotificationTemplate from '../models/NotificationTemplate';
import User from '../models/User';

// List Notifications
export const listNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await Notification.find({}).sort({ createdAt: -1, time: -1, _id: -1 });
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

// Post Notification (Broadcast)
export const postNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, message, target } = req.body;
    if (!title || !message) {
       res.status(400).json({ message: 'Missing required title or message' });
       return;
    }

    if (target === 'All') {
      const users = await User.find({ status: 'User', deleted: false });
      for (const u of users) {
        const notif = new Notification({
          username: u.username,
          title,
          message,
          status: 'unread',
        });
        await notif.save();
      }
    } else {
      const notif = new Notification({
        username: target,
        title,
        message,
        status: 'unread',
      });
      await notif.save();
    }

    res.status(201).json({ message: 'Notification broadcasted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error broadcasting notification', error: error.message });
  }
};

// Delete Notification
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error deleting notification', error: error.message });
  }
};

// List Notification Templates (Paginated)
export const listNotificationTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const totalCount = await NotificationTemplate.countDocuments({});
    const templates = await NotificationTemplate.find({})
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

    res.json({
      templates,
      page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching templates', error: error.message });
  }
};

// Create Notification Template
export const createNotificationTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, title, content } = req.body;
    if (!name || !title || !content) {
       res.status(400).json({ message: 'Missing required template fields' });
       return;
    }

    const existing = await NotificationTemplate.findOne({ name });
    if (existing) {
       res.status(400).json({ message: 'A template with this trigger key already exists' });
       return;
    }

    const template = new NotificationTemplate({ name, title, content });
    await template.save();
    res.status(201).json({ message: 'Notification template created successfully', template });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating template', error: error.message });
  }
};

// Update Notification Template
export const updateNotificationTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, title, content } = req.body;
    const template = await NotificationTemplate.findById(req.params.id);
    if (!template) {
       res.status(404).json({ message: 'Template not found' });
       return;
    }

    if (name !== undefined) template.name = name;
    if (title !== undefined) template.title = title;
    if (content !== undefined) template.content = content;

    await template.save();
    res.json({ message: 'Template updated successfully', template });
  } catch (error: any) {
    res.status(500).json({ message: 'Error updating template', error: error.message });
  }
};

// Get User Notifications (for logged in client)
export const getUserNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    if (!username) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const notifications = await Notification.find({
      $or: [{ username }, { username: 'All' }, { username: 'all' }],
    }).sort({ createdAt: -1, time: -1, _id: -1 });

    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching user notifications', error: error.message });
  }
};

// Mark Single Notification as Read
export const markNotificationRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const notification = await Notification.findById(id);
    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    notification.isRead = true;
    await notification.save();

    res.json({ message: 'Notification marked as read', notification });
  } catch (error: any) {
    res.status(500).json({ message: 'Error marking notification read', error: error.message });
  }
};

// Mark All Notifications as Read
export const markAllNotificationsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const username = req.user?.username;
    if (!username) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    if (req.user?.status === 'Admin' || username.toLowerCase() === 'admin') {
      await Notification.updateMany(
        { isRead: false },
        { $set: { isRead: true } }
      );
    } else {
      await Notification.updateMany(
        { $or: [{ username }, { username: 'All' }, { username: 'all' }], isRead: false },
        { $set: { isRead: true } }
      );
    }

    res.json({ message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error marking all notifications read', error: error.message });
  }
};
