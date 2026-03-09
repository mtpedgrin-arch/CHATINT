import { Router, Request, Response } from 'express';
import { analyticsService } from '../services/analytics.service';

const router = Router();

// Helper: get date range from query params (defaults to last 30 days)
function getDateRange(req: Request): { from: string; to: string; period: 'day' | 'week' | 'month' } {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const from = (req.query.from as string) || thirtyDaysAgo.toISOString().split('T')[0];
  const to = (req.query.to as string) || now.toISOString().split('T')[0];
  const period = (req.query.period as 'day' | 'week' | 'month') || 'day';

  return { from, to, period };
}

// ── OVERVIEW ─────────────────────────────────
// GET /api/analytics/overview
// KPIs: DAU, revenue hoy, sesiones activas, nuevos hoy
router.get('/overview', (_req: Request, res: Response) => {
  try {
    const data = analyticsService.getOverview();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ACTIVE USERS ─────────────────────────────
// GET /api/analytics/active-users?from=&to=&period=day|week|month
router.get('/active-users', (req: Request, res: Response) => {
  try {
    const { from, to, period } = getDateRange(req);
    const data = analyticsService.getActiveUsers(from, to, period);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── TOP USERS ────────────────────────────────
// GET /api/analytics/users?limit=10&metric=activity|deposits&from=&to=
router.get('/users', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const metric = (req.query.metric as 'activity' | 'deposits') || 'activity';
    const { from, to } = getDateRange(req);
    const data = analyticsService.getTopUsers(limit, metric, from, to);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── USER DETAIL ──────────────────────────────
// GET /api/analytics/users/:clientId
router.get('/users/:clientId', (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const data = analyticsService.getUserDetail(clientId);
    if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── FINANCIAL ────────────────────────────────
// GET /api/analytics/financial?from=&to=&period=day|week|month
router.get('/financial', (req: Request, res: Response) => {
  try {
    const { from, to, period } = getDateRange(req);
    const data = analyticsService.getFinancial(from, to, period);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── RETENTION ────────────────────────────────
// GET /api/analytics/retention
router.get('/retention', (_req: Request, res: Response) => {
  try {
    const data = analyticsService.getRetention();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── FUNNEL ───────────────────────────────────
// GET /api/analytics/funnel
router.get('/funnel', (_req: Request, res: Response) => {
  try {
    const data = analyticsService.getFunnel();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── SEGMENTS ─────────────────────────────────
// GET /api/analytics/segments
router.get('/segments', (_req: Request, res: Response) => {
  try {
    const data = analyticsService.getSegments();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PEAK HOURS ───────────────────────────────
// GET /api/analytics/peak-hours?from=&to=
router.get('/peak-hours', (req: Request, res: Response) => {
  try {
    const { from, to } = getDateRange(req);
    const data = analyticsService.getPeakHours(from, to);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── ENGAGEMENT ───────────────────────────────
// GET /api/analytics/engagement?from=&to=
router.get('/engagement', (req: Request, res: Response) => {
  try {
    const { from, to } = getDateRange(req);
    const data = analyticsService.getEngagement(from, to);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── SESSIONS ─────────────────────────────────
// GET /api/analytics/sessions?from=&to=
router.get('/sessions', (req: Request, res: Response) => {
  try {
    const { from, to } = getDateRange(req);
    const data = analyticsService.getSessions(from, to);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
