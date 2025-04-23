// routes/notificationRoutes.js
import express from 'express';
import Notification from '../models/notificationModel.js';
import verifyToken from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get all unread + 7 recent read notifications 
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const unreadNotifications = await Notification.find({
      $or: [{ hirerId: userId }, { freelancerId: userId }],
      isRead: false,
    }).sort({ timestamp: -1 });
    const readNotifications = await Notification.find({
      $or: [{ hirerId: userId }, { freelancerId: userId }],
      isRead: true,
    })
      .sort({ timestamp: -1 })
      .limit(7);

    const notifications = [...unreadNotifications, ...readNotifications];
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

//  Mark a Notification as Read
router.put('/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default router;
