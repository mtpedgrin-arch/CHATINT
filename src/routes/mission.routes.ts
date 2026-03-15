import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';
import { creditPrizeAndDeposit } from '../services/prize.helper';

const router = Router();

// ============================================
// ADMIN ENDPOINTS
// ============================================

router.get('/admin/missions', (_req: Request, res: Response) => {
  const missions = dataService.getMissions();
  const enriched = missions.map(m => {
    const progress = dataService.getMissionProgress(m.id);
    return {
      ...m,
      totalParticipants: progress.length,
      totalCompleted: progress.filter(p => p.completed).length,
      totalClaimed: progress.filter(p => p.claimed).length,
    };
  });
  res.json(enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

router.get('/admin/missions/:id', (req: Request, res: Response) => {
  const m = dataService.getMissionById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Mision no encontrada' });
  const progress = dataService.getMissionProgress(m.id);
  res.json({ ...m, progress, totalParticipants: progress.length, totalCompleted: progress.filter(p => p.completed).length });
});

router.post('/admin/missions', (req: Request, res: Response) => {
  try {
    const { title, description, emoji, type, target, rewardAmount, rewardType, period, enabled } = req.body;
    if (!title || !type || !target || !rewardAmount) {
      return res.status(400).json({ error: 'Faltan campos: title, type, target, rewardAmount' });
    }
    const m = dataService.createMission({
      title, description: description || '', emoji: emoji || '🎯',
      type, target: Number(target), rewardAmount: Number(rewardAmount),
      rewardType: rewardType || 'fichas', period: period || 'daily',
      enabled: enabled !== false,
    });
    res.json(m);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/missions/:id', (req: Request, res: Response) => {
  const m = dataService.getMissionById(req.params.id);
  if (!m) return res.status(404).json({ error: 'No encontrada' });
  const updated = dataService.updateMission(req.params.id, req.body);
  res.json(updated);
});

router.delete('/admin/missions/:id', (req: Request, res: Response) => {
  const m = dataService.getMissionById(req.params.id);
  if (!m) return res.status(404).json({ error: 'No encontrada' });
  dataService.deleteMission(req.params.id);
  res.json({ ok: true });
});

// ============================================
// WIDGET ENDPOINTS
// ============================================

// Get active missions for a client
router.get('/missions/active', (req: Request, res: Response) => {
  const clientId = Number(req.query.clientId);
  const missions = dataService.getMissions().filter(m => m.enabled);
  if (!clientId) return res.json({ missions: missions.map(m => ({ ...m, progress: 0, completed: false, claimed: false })) });

  const enriched = missions.map(m => {
    const prog = dataService.getClientMissionForMission(clientId, m.id);
    return {
      id: m.id, title: m.title, description: m.description, emoji: m.emoji,
      type: m.type, target: m.target, rewardAmount: m.rewardAmount, rewardType: m.rewardType, period: m.period,
      progress: prog ? prog.progress : 0,
      completed: prog ? prog.completed : false,
      claimed: prog ? prog.claimed : false,
    };
  });
  res.json({ missions: enriched });
});

// Update mission progress (called by backend triggers or manually)
router.post('/missions/:id/progress', (req: Request, res: Response) => {
  const { clientId, clientName, increment } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  const mission = dataService.getMissionById(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mision no encontrada' });
  if (!mission.enabled) return res.status(400).json({ error: 'Mision desactivada' });

  let prog = dataService.getClientMissionForMission(Number(clientId), mission.id);
  if (!prog) {
    prog = dataService.createMissionProgress({
      missionId: mission.id, clientId: Number(clientId), clientName: clientName || '',
      progress: 0, completed: false, claimed: false,
    });
  }

  if (prog.completed) return res.json({ ...prog, alreadyCompleted: true });

  const newProgress = Math.min(prog.progress + (increment || 1), mission.target);
  const completed = newProgress >= mission.target;

  const updated = dataService.updateMissionProgress(prog.id, {
    progress: newProgress, completed, completedAt: completed ? new Date().toISOString() : null,
  });

  if (completed) {
    const io = req.app.get('io');
    if (io) {
      io.to(`client:${clientId}`).emit('mission:completed', {
        missionId: mission.id, title: mission.title, emoji: mission.emoji,
        rewardAmount: mission.rewardAmount, rewardType: mission.rewardType,
      });
    }
  }

  res.json(updated);
});

// Claim mission reward
router.post('/missions/:id/claim', async (req: Request, res: Response) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
  const mission = dataService.getMissionById(req.params.id);
  if (!mission) return res.status(404).json({ error: 'Mision no encontrada' });

  const prog = dataService.getClientMissionForMission(Number(clientId), mission.id);
  if (!prog) return res.status(400).json({ error: 'No empezaste esta mision' });
  if (!prog.completed) return res.status(400).json({ error: 'Mision no completada' });
  if (prog.claimed) return res.status(400).json({ error: 'Ya reclamaste el premio' });

  // Credit reward (with bonus adjustment + casino deposit)
  if (mission.rewardType === 'fichas') {
    const io = req.app.get('io');
    await creditPrizeAndDeposit({
      clientId: Number(clientId),
      clientName: prog.clientName || '',
      source: 'mission',
      sourceId: mission.id,
      amount: mission.rewardAmount,
      io,
    });
  }

  const updated = dataService.updateMissionProgress(prog.id, { claimed: true, claimedAt: new Date().toISOString() });

  // Activity feed
  dataService.addActivityFeedItem({
    type: 'mission_complete', clientName: prog.clientName || `Cliente #${clientId}`,
    message: `completo la mision "${mission.title}" y gano $${mission.rewardAmount}!`,
    amount: mission.rewardAmount, emoji: mission.emoji,
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`client:${clientId}`).emit('mission:claimed', {
      missionId: mission.id, rewardAmount: mission.rewardAmount, rewardType: mission.rewardType,
    });
    io.emit('activity:new', dataService.getActivityFeed(1)[0]);
  }

  res.json(updated);
});

export default router;
