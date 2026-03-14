import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';

const router = Router();

// ============================================
// ADMIN ENDPOINTS
// ============================================

router.get('/admin/roulettes', (_req: Request, res: Response) => {
  const roulettes = dataService.getRoulettes();
  const enriched = roulettes.map(r => {
    const spins = dataService.getRouletteSpins(r.id);
    return { ...r, totalSpins: spins.length, totalPrizeGiven: spins.filter(s => s.won).reduce((sum, s) => sum + s.prizeAmount, 0) };
  });
  res.json(enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

router.get('/admin/roulettes/:id', (req: Request, res: Response) => {
  const r = dataService.getRouletteById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Ruleta no encontrada' });
  const spins = dataService.getRouletteSpins(r.id);
  res.json({ ...r, spins, totalSpins: spins.length, totalPrizeGiven: spins.filter(s => s.won).reduce((sum, s) => sum + s.prizeAmount, 0) });
});

router.post('/admin/roulettes', (req: Request, res: Response) => {
  try {
    const { name, segments, mode, minDeposit } = req.body;
    if (!name || !segments || !Array.isArray(segments) || segments.length < 2) {
      return res.status(400).json({ error: 'Faltan campos: name, segments (min 2)' });
    }
    const r = dataService.createRoulette({ name, segments, mode: mode || 'manual', minDeposit: minDeposit || 0, status: 'draft' });
    res.json(r);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/roulettes/:id', (req: Request, res: Response) => {
  const r = dataService.getRouletteById(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.status !== 'draft') return res.status(400).json({ error: 'Solo se puede editar en borrador' });
  const updated = dataService.updateRoulette(req.params.id, req.body);
  res.json(updated);
});

router.delete('/admin/roulettes/:id', (req: Request, res: Response) => {
  const r = dataService.getRouletteById(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.status === 'active') return res.status(400).json({ error: 'No se puede borrar una ruleta activa' });
  dataService.deleteRoulette(req.params.id);
  res.json({ ok: true });
});

router.post('/admin/roulettes/:id/start', (req: Request, res: Response) => {
  const r = dataService.getRouletteById(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.status !== 'draft') return res.status(400).json({ error: 'Solo se puede activar desde borrador' });
  const active = dataService.getActiveRoulette();
  if (active) return res.status(400).json({ error: 'Ya hay una ruleta activa. Terminala primero.' });
  const updated = dataService.updateRoulette(r.id, { status: 'active', startedAt: new Date().toISOString() });
  const io = req.app.get('io');
  if (io) io.emit('roulette:started', {
    id: updated!.id,
    name: updated!.name,
    segments: updated!.segments.map(s => ({ label: s.label, color: s.color, emoji: s.emoji })),
  });
  res.json(updated);
});

router.post('/admin/roulettes/:id/end', (req: Request, res: Response) => {
  const r = dataService.getRouletteById(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.status !== 'active') return res.status(400).json({ error: 'No esta activa' });
  const spins = dataService.getRouletteSpins(r.id);
  const updated = dataService.updateRoulette(r.id, {
    status: 'ended', endedAt: new Date().toISOString(),
    totalSpins: spins.length,
    totalPrizeGiven: spins.filter(s => s.won).reduce((sum, s) => sum + s.prizeAmount, 0),
  });
  const io = req.app.get('io');
  if (io) io.emit('roulette:ended', { id: r.id });
  res.json(updated);
});

// ============================================
// WIDGET ENDPOINTS
// ============================================

router.get('/roulettes/active', (_req: Request, res: Response) => {
  const r = dataService.getActiveRoulette();
  if (!r) return res.json({ roulette: null });
  res.json({
    roulette: {
      id: r.id, name: r.name, mode: r.mode,
      segments: r.segments.map(s => ({ label: s.label, color: s.color, emoji: s.emoji })),
    },
  });
});

router.post('/roulettes/:id/spin', (req: Request, res: Response) => {
  const r = dataService.getRouletteById(req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrada' });
  if (r.status !== 'active') return res.status(400).json({ error: 'No esta activa' });

  const { clientId, clientName } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  // Check if already spun (for mode manual, 1 spin per roulette)
  const existing = dataService.getRouletteSpinByClient(r.id, Number(clientId));
  if (existing) return res.status(400).json({ error: 'Ya giraste esta ruleta', spin: existing });

  // Determine prize
  const roll = Math.random() * 100;
  let cumulative = 0;
  let winSegment = null;
  let winIndex = 0;
  for (let i = 0; i < r.segments.length; i++) {
    cumulative += r.segments[i].probability;
    if (roll < cumulative) { winSegment = r.segments[i]; winIndex = i; break; }
  }
  if (!winSegment) { winSegment = r.segments[r.segments.length - 1]; winIndex = r.segments.length - 1; }

  const won = winSegment.amount > 0;

  const spin = dataService.createRouletteSpin({
    rouletteId: r.id, clientId: Number(clientId), clientName: clientName || '',
    won, prizeLabel: winSegment.label, prizeAmount: won ? winSegment.amount : 0, segmentIndex: winIndex,
  });

  if (won) {
    const client = dataService.getClientById(Number(clientId));
    if (client) dataService.updateClient(Number(clientId), { balance: client.balance + winSegment.amount });

    // Activity feed
    dataService.addActivityFeedItem({
      type: 'roulette_win', clientName: clientName || `Cliente #${clientId}`,
      message: `gano ${winSegment.emoji} ${winSegment.label} ($${winSegment.amount}) en la Ruleta!`,
      amount: winSegment.amount, emoji: winSegment.emoji,
    });
  }

  // Update counters
  const allSpins = dataService.getRouletteSpins(r.id);
  dataService.updateRoulette(r.id, { totalSpins: allSpins.length, totalPrizeGiven: allSpins.filter(s => s.won).reduce((sum, s) => sum + s.prizeAmount, 0) });

  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('roulette:spin', {
      rouletteId: r.id, clientName: clientName || `Cliente #${clientId}`,
      won, prizeLabel: spin.prizeLabel, prizeAmount: spin.prizeAmount,
    });
    if (won) {
      io.to(`client:${clientId}`).emit('roulette:won', {
        prizeAmount: winSegment.amount, prizeLabel: winSegment.label, prizeEmoji: winSegment.emoji,
      });
    }
  }

  // Return the winning segment index + rotation angle for animation
  const degreesPerSegment = 360 / r.segments.length;
  const targetAngle = 360 - (winIndex * degreesPerSegment + degreesPerSegment / 2);
  const totalRotation = 360 * 5 + targetAngle; // 5 full spins + target

  res.json({ won, prizeLabel: spin.prizeLabel, prizeAmount: spin.prizeAmount, prizeEmoji: winSegment.emoji, segmentIndex: winIndex, rotation: totalRotation });
});

export default router;
