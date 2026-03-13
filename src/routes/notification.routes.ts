import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';
import { pushService } from '../services/push.service';

const router = Router();

// ── WIDGET ENDPOINTS (no auth) ────────────────

// Get VAPID public key
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: pushService.getPublicKey() });
});

// Register push subscription
router.post('/subscribe', (req: Request, res: Response) => {
  try {
    const { subscription, clientId, chatId } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Subscription data required' });
    }

    // Check if already exists
    const existing = dataService.getPushSubscriptions().find(
      (s: any) => s.endpoint === subscription.endpoint
    );
    if (existing) {
      // Update existing
      dataService.updatePushSubscription(existing.id, {
        clientId: clientId || existing.clientId,
        chatId: chatId || existing.chatId,
        keys: subscription.keys,
        userAgent: req.headers['user-agent'] || '',
      });
      return res.json({ ok: true, updated: true });
    }

    const sub = dataService.createPushSubscription({
      clientId: clientId || null,
      chatId: chatId || null,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: req.headers['user-agent'] || '',
    });
    res.json({ ok: true, id: sub.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Unsubscribe
router.post('/unsubscribe', (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'Endpoint required' });
    
    const subs = dataService.getPushSubscriptions();
    const sub = subs.find((s: any) => s.endpoint === endpoint);
    if (sub) {
      dataService.deletePushSubscription(sub.id);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// Track push/PWA events (no auth — called from widget)
router.post('/track', (req: Request, res: Response) => {
  try {
    const { event, clientId, chatId } = req.body;
    const validEvents = ['banner_shown', 'accepted', 'declined', 'dismissed', 'denied_by_browser', 'pwa_installed', 'pwa_dismissed'];
    if (!event || !validEvents.includes(event)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }
    dataService.createPushTrackingEvent({
      event,
      clientId: clientId ? parseInt(clientId) : null,
      chatId: chatId || null,
      userAgent: req.headers['user-agent'] || '',
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get push tracking stats (admin)
router.get('/tracking-stats', (_req: Request, res: Response) => {
  try {
    const stats = dataService.getPushTrackingStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADMIN ENDPOINTS ──────────────────────────

// Get subscription stats
router.get('/subscriptions', (_req: Request, res: Response) => {
  const subs = dataService.getPushSubscriptions();
  res.json({
    total: subs.length,
    subscriptions: subs.map((s: any) => ({
      id: s.id,
      clientId: s.clientId,
      chatId: s.chatId,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
    })),
  });
});

// Send push notification
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { title, body, type, target, targetValue, url } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    let subscriptions = dataService.getPushSubscriptions();

    // Filter by target
    if (target === 'client' && targetValue) {
      subscriptions = subscriptions.filter((s: any) => s.clientId === parseInt(targetValue));
    } else if (target === 'chat' && targetValue) {
      subscriptions = subscriptions.filter((s: any) => s.chatId === targetValue);
    }
    // target === 'all' → send to everyone

    if (subscriptions.length === 0) {
      return res.status(400).json({ error: 'No subscriptions found for target' });
    }

    const webPushSubs = subscriptions.map((s: any) => ({
      endpoint: s.endpoint,
      keys: s.keys,
    }));

    const payload = {
      title,
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: url || '/widget',
      vibrate: [200, 100, 200],
    };

    const result = await pushService.sendToMultiple(webPushSubs, payload);

    // Clean up expired subscriptions
    if (result.expiredEndpoints.length > 0) {
      for (const endpoint of result.expiredEndpoints) {
        const sub = dataService.getPushSubscriptions().find((s: any) => s.endpoint === endpoint);
        if (sub) dataService.deletePushSubscription(sub.id);
      }
    }

    // Save notification record
    const notification = dataService.createSentNotification({
      title,
      body,
      type: type || 'general',
      target: target || 'all',
      targetValue: targetValue || '',
      sentBy: 'admin',
      deliveredCount: result.delivered,
      failedCount: result.failed,
    });

    res.json({ ok: true, notification, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get notification history
router.get('/history', (_req: Request, res: Response) => {
  const notifications = dataService.getSentNotifications();
  res.json(notifications);
});

// ── POPUP TEMPLATES ──────────────────────────

router.get('/popups/templates', (_req: Request, res: Response) => {
  res.json(dataService.getPopupTemplates());
});

router.post('/popups/templates', (req: Request, res: Response) => {
  try {
    const { name, title, body, imageUrl, buttonText, buttonAction, buttonUrl } = req.body;
    if (!name || !title) return res.status(400).json({ error: 'Name and title required' });
    const tpl = dataService.createPopupTemplate({
      name, title, body: body || '', imageUrl: imageUrl || '',
      buttonText: buttonText || '', buttonAction: buttonAction || 'open_chat',
      buttonUrl: buttonUrl || '',
    });
    res.json(tpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/popups/templates/:id', (req: Request, res: Response) => {
  const tpl = dataService.updatePopupTemplate(req.params.id, req.body);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  res.json(tpl);
});

router.delete('/popups/templates/:id', (req: Request, res: Response) => {
  const ok = dataService.deletePopupTemplate(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Template not found' });
  res.json({ ok: true });
});

// Send popup via Socket.IO
router.post('/popups/send', (req: Request, res: Response) => {
  try {
    const { title, body, imageUrl, buttonText, buttonUrl, buttonAction, target, targetValue } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

    const io = req.app.get('io');

    const popupData = { title, body, imageUrl, buttonText, buttonUrl, buttonAction };

    // Emit to clients
    if (target === 'client' && targetValue && io) {
      io.to(`client:${targetValue}`).emit('popup:show', popupData);
    } else if (target === 'chat' && targetValue && io) {
      io.to(`chat:${targetValue}`).emit('popup:show', popupData);
    } else if (io) {
      // Send to all widget connections
      io.emit('popup:show', popupData);
    }

    // Save popup record
    const popup = dataService.createPopupMessage({
      title,
      body,
      imageUrl: imageUrl || '',
      buttonText: buttonText || '',
      buttonUrl: buttonUrl || '',
      target: target || 'all',
      targetValue: targetValue || '',
      sentBy: 'admin',
    });

    res.json({ ok: true, popup });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get popup history
router.get('/popups', (_req: Request, res: Response) => {
  const popups = dataService.getPopupMessages();
  res.json(popups);
});

export default router;
