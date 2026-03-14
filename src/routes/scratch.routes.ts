import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';

const router = Router();

// ============================================
// ADMIN ENDPOINTS (with auth)
// ============================================

// List all scratch cards
router.get('/admin/scratch-cards', (_req: Request, res: Response) => {
  const cards = dataService.getScratchCards();
  const enriched = cards.map(c => {
    const plays = dataService.getScratchPlays(c.id);
    return {
      ...c,
      totalPlayed: plays.length,
      totalWinners: plays.filter(p => p.won).length,
      totalPrizeGiven: plays.filter(p => p.won).reduce((sum, p) => sum + p.prizeAmount, 0),
    };
  });
  res.json(enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

// Get scratch card detail with plays
router.get('/admin/scratch-cards/:id', (req: Request, res: Response) => {
  const card = dataService.getScratchCardById(req.params.id);
  if (!card) return res.status(404).json({ error: 'Raspa y Gana no encontrado' });
  const plays = dataService.getScratchPlays(card.id);
  res.json({
    ...card,
    plays,
    totalPlayed: plays.length,
    totalWinners: plays.filter(p => p.won).length,
    totalPrizeGiven: plays.filter(p => p.won).reduce((sum, p) => sum + p.prizeAmount, 0),
  });
});

// Create scratch card (draft)
router.post('/admin/scratch-cards', (req: Request, res: Response) => {
  try {
    const { name, prizes } = req.body;
    if (!name || !prizes || !Array.isArray(prizes) || prizes.length === 0) {
      return res.status(400).json({ error: 'Faltan campos: name, prizes (array)' });
    }
    // Validate prizes
    for (const p of prizes) {
      if (!p.label || p.amount === undefined || p.probability === undefined) {
        return res.status(400).json({ error: 'Cada premio necesita: label, amount, probability' });
      }
    }
    const card = dataService.createScratchCard({
      name,
      prizes,
      status: 'draft',
      createdBy: 'admin',
    });
    res.json(card);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update scratch card (only draft)
router.put('/admin/scratch-cards/:id', (req: Request, res: Response) => {
  const card = dataService.getScratchCardById(req.params.id);
  if (!card) return res.status(404).json({ error: 'No encontrado' });
  if (card.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden editar en borrador' });
  const updated = dataService.updateScratchCard(req.params.id, req.body);
  res.json(updated);
});

// Delete scratch card
router.delete('/admin/scratch-cards/:id', (req: Request, res: Response) => {
  const card = dataService.getScratchCardById(req.params.id);
  if (!card) return res.status(404).json({ error: 'No encontrado' });
  if (card.status === 'active') return res.status(400).json({ error: 'No se puede borrar una tarjeta activa' });
  dataService.deleteScratchCard(req.params.id);
  res.json({ ok: true });
});

// Start scratch card
router.post('/admin/scratch-cards/:id/start', (req: Request, res: Response) => {
  const card = dataService.getScratchCardById(req.params.id);
  if (!card) return res.status(404).json({ error: 'No encontrado' });
  if (card.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden iniciar en borrador' });

  const active = dataService.getActiveScratchCard();
  if (active) return res.status(400).json({ error: 'Ya hay un Raspa y Gana activo. Terminalo primero.' });

  const updated = dataService.updateScratchCard(card.id, {
    status: 'active',
    startedAt: new Date().toISOString(),
  });

  const io = req.app.get('io');
  if (io) {
    io.emit('scratch:started', {
      id: updated!.id,
      name: updated!.name,
    });
  }

  res.json(updated);
});

// End scratch card
router.post('/admin/scratch-cards/:id/end', (req: Request, res: Response) => {
  const card = dataService.getScratchCardById(req.params.id);
  if (!card) return res.status(404).json({ error: 'No encontrado' });
  if (card.status !== 'active') return res.status(400).json({ error: 'No esta activo' });

  const plays = dataService.getScratchPlays(card.id);
  const updated = dataService.updateScratchCard(card.id, {
    status: 'ended',
    endedAt: new Date().toISOString(),
    totalPlayed: plays.length,
    totalWinners: plays.filter(p => p.won).length,
    totalPrizeGiven: plays.filter(p => p.won).reduce((sum, p) => sum + p.prizeAmount, 0),
  });

  const io = req.app.get('io');
  if (io) {
    io.emit('scratch:ended', { id: card.id });
  }

  res.json(updated);
});

// ============================================
// WIDGET ENDPOINTS (no auth)
// ============================================

// Get active scratch card
router.get('/scratch-cards/active', (_req: Request, res: Response) => {
  const card = dataService.getActiveScratchCard();
  if (!card) return res.json({ scratchCard: null });
  res.json({
    scratchCard: {
      id: card.id,
      name: card.name,
      prizes: card.prizes.map(p => ({ label: p.label, emoji: p.emoji })), // Don't send amounts/probabilities!
    },
  });
});

// Play scratch card
router.post('/scratch-cards/:id/play', (req: Request, res: Response) => {
  const card = dataService.getScratchCardById(req.params.id);
  if (!card) return res.status(404).json({ error: 'No encontrado' });
  if (card.status !== 'active') return res.status(400).json({ error: 'No esta activo' });

  const { clientId, clientName } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId requerido' });

  // Check if already played
  const existing = dataService.getScratchPlayByClient(card.id, Number(clientId));
  if (existing) return res.status(400).json({ error: 'Ya raspaste esta tarjeta', play: existing });

  // Determine prize based on probabilities
  const roll = Math.random() * 100;
  let cumulative = 0;
  let wonPrize = null;

  for (const prize of card.prizes) {
    cumulative += prize.probability;
    if (roll < cumulative) {
      wonPrize = prize;
      break;
    }
  }

  // If no prize hit (remaining probability = no prize)
  const won = wonPrize !== null && wonPrize.amount > 0;

  const play = dataService.createScratchPlay({
    scratchCardId: card.id,
    clientId: Number(clientId),
    clientName: clientName || '',
    won,
    prizeLabel: wonPrize ? wonPrize.label : 'Sin premio',
    prizeAmount: won && wonPrize ? wonPrize.amount : 0,
  });

  // Credit prize if won
  if (won && wonPrize) {
    const client = dataService.getClientById(Number(clientId));
    if (client) {
      dataService.updateClient(Number(clientId), {
        balance: client.balance + wonPrize.amount,
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`client:${clientId}`).emit('scratch:won', {
        scratchCardId: card.id,
        prizeAmount: wonPrize.amount,
        prizeLabel: wonPrize.label,
        prizeEmoji: wonPrize.emoji,
      });
    }
  }

  // Update card counters
  const allPlays = dataService.getScratchPlays(card.id);
  dataService.updateScratchCard(card.id, {
    totalPlayed: allPlays.length,
    totalWinners: allPlays.filter(p => p.won).length,
    totalPrizeGiven: allPlays.filter(p => p.won).reduce((sum, p) => sum + p.prizeAmount, 0),
  });

  // Notify admin
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('scratch:play', {
      scratchCardId: card.id,
      clientName: clientName || `Cliente #${clientId}`,
      won,
      prizeLabel: play.prizeLabel,
      prizeAmount: play.prizeAmount,
    });
  }

  // Return result with a grid of emojis to scratch (3x3)
  // The actual prize reveal positions are randomized
  const grid = generateScratchGrid(card.prizes, wonPrize);

  res.json({
    won,
    prizeLabel: play.prizeLabel,
    prizeAmount: play.prizeAmount,
    prizeEmoji: wonPrize ? wonPrize.emoji : '',
    grid,
  });
});

// ============================================
// HELPERS
// ============================================

function generateScratchGrid(prizes: any[], wonPrize: any): string[][] {
  // 3x3 grid of emojis
  const allEmojis = prizes.map(p => p.emoji || '🎁');
  const grid: string[][] = [];

  if (wonPrize) {
    // Place 3 winning emojis and fill rest randomly
    const winEmoji = wonPrize.emoji || '🎁';
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    // Pick 3 random positions for the winning emoji
    const winPositions: number[] = [];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(Math.random() * positions.length);
      winPositions.push(positions.splice(idx, 1)[0]);
    }

    const flat: string[] = [];
    for (let i = 0; i < 9; i++) {
      if (winPositions.includes(i)) {
        flat.push(winEmoji);
      } else {
        // Random other emoji
        const others = allEmojis.filter(e => e !== winEmoji);
        flat.push(others.length > 0 ? others[Math.floor(Math.random() * others.length)] : '❌');
      }
    }
    for (let r = 0; r < 3; r++) {
      grid.push(flat.slice(r * 3, r * 3 + 3));
    }
  } else {
    // No prize - all different emojis (no 3 of the same)
    const flat: string[] = [];
    for (let i = 0; i < 9; i++) {
      // Ensure no emoji appears 3 times
      let emoji: string;
      let attempts = 0;
      do {
        emoji = allEmojis[Math.floor(Math.random() * allEmojis.length)];
        attempts++;
      } while (flat.filter(e => e === emoji).length >= 2 && attempts < 20);
      flat.push(emoji);
    }
    for (let r = 0; r < 3; r++) {
      grid.push(flat.slice(r * 3, r * 3 + 3));
    }
  }

  return grid;
}

export default router;
