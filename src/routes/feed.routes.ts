import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';

const router = Router();

// Admin: get full feed
router.get('/admin/activity-feed', (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 50;
  res.json(dataService.getActivityFeed(limit));
});

// Widget: get recent feed (public, no sensitive data)
router.get('/activity-feed', (req: Request, res: Response) => {
  const limit = Number(req.query.limit) || 20;
  const feed = dataService.getActivityFeed(limit);
  // Only return public info
  res.json({
    feed: feed.map(f => ({
      id: f.id,
      type: f.type,
      clientName: anonymizeName(f.clientName),
      message: f.message,
      emoji: f.emoji,
      timestamp: f.timestamp,
    })),
  });
});

// Helper: anonymize name "Juan Perez" -> "Ju***ez"
function anonymizeName(name: string): string {
  if (!name || name.length <= 3) return name;
  if (name.length <= 6) return name.substring(0, 2) + '***';
  return name.substring(0, 2) + '***' + name.substring(name.length - 2);
}

export default router;
