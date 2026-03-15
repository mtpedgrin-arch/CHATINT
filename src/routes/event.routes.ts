import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';
import { creditPrizeAndDeposit } from '../services/prize.helper';

const router = Router();

// Store active event timers
const eventTimers: Record<string, NodeJS.Timeout> = {};

// ============================================
// ADMIN ENDPOINTS (with auth)
// ============================================

// List all events
router.get('/admin/events', (_req: Request, res: Response) => {
  const events = dataService.getEvents();
  // Attach entry counts
  const enriched = events.map(e => ({
    ...e,
    totalEntries: dataService.getEventEntries(e.id).length,
    qualifiedEntries: dataService.getEventEntries(e.id).filter(en => en.qualified).length,
  }));
  res.json(enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

// Get event detail with entries
router.get('/admin/events/:id', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  const entries = dataService.getEventEntries(event.id);
  res.json({ ...event, entries });
});

// Create event (draft)
router.post('/admin/events', (req: Request, res: Response) => {
  try {
    const { name, description, imageUrl, minDeposit, prizeAmount, prizeDescription, durationMinutes, createdBy } = req.body;
    if (!name || !minDeposit || !prizeAmount || !durationMinutes) {
      return res.status(400).json({ error: 'Faltan campos requeridos: name, minDeposit, prizeAmount, durationMinutes' });
    }
    const event = dataService.createEvent({
      name,
      description: description || '',
      imageUrl: imageUrl || '',
      minDeposit: Number(minDeposit),
      prizeAmount: Number(prizeAmount),
      prizeDescription: prizeDescription || `$${Number(prizeAmount).toLocaleString()} en fichas`,
      status: 'draft',
      durationMinutes: Number(durationMinutes),
      createdBy: createdBy || 'admin',
    });
    res.json(event);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update event
router.put('/admin/events/:id', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden editar eventos en borrador' });
  const updated = dataService.updateEvent(req.params.id, req.body);
  res.json(updated);
});

// Delete event
router.delete('/admin/events/:id', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status === 'active') return res.status(400).json({ error: 'No se puede borrar un evento activo' });
  dataService.deleteEvent(req.params.id);
  res.json({ ok: true });
});

// Start event
router.post('/admin/events/:id/start', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'draft') return res.status(400).json({ error: 'Solo se pueden iniciar eventos en borrador' });

  // Check no other active event
  const active = dataService.getActiveEvent();
  if (active) return res.status(400).json({ error: 'Ya hay un evento activo. Terminalo primero.' });

  const now = new Date();
  const endsAt = new Date(now.getTime() + event.durationMinutes * 60 * 1000);
  const updated = dataService.updateEvent(event.id, {
    status: 'active',
    startedAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
  });

  const io = req.app.get('io');

  // Broadcast to all widgets
  if (io) {
    io.emit('event:started', {
      id: updated!.id,
      name: updated!.name,
      description: updated!.description,
      imageUrl: updated!.imageUrl,
      minDeposit: updated!.minDeposit,
      prizeAmount: updated!.prizeAmount,
      prizeDescription: updated!.prizeDescription,
      endsAt: updated!.endsAt,
    });
  }

  // Push automation: notify event start
  try {
    const pushAuto = req.app.get('pushAutomation');
    if (pushAuto) {
      pushAuto.sendEventPush('onEventStart', {
        eventName: updated!.name,
        prizeAmount: updated!.prizeAmount,
        prizeDescription: updated!.prizeDescription || '',
        minDeposit: updated!.minDeposit,
      });
    }
  } catch (e) { /* push automation not critical */ }

  // Auto-end timer
  const timeoutMs = event.durationMinutes * 60 * 1000;
  eventTimers[event.id] = setTimeout(() => {
    const ev = dataService.getEventById(event.id);
    if (ev && ev.status === 'active') {
      dataService.updateEvent(event.id, { status: 'ended' });
      // Remove EVENTO labels from participants
      removeEventLabels(event.id);
      if (io) {
        io.emit('event:ended', { eventId: event.id });
        io.to('agents').emit('event:auto-ended', { eventId: event.id });
      }
    }
    delete eventTimers[event.id];
  }, timeoutMs);

  res.json(updated);
});

// End event manually
router.post('/admin/events/:id/end', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'active') return res.status(400).json({ error: 'El evento no está activo' });

  dataService.updateEvent(event.id, { status: 'ended' });

  // Clear auto-end timer
  if (eventTimers[event.id]) {
    clearTimeout(eventTimers[event.id]);
    delete eventTimers[event.id];
  }

  // Remove EVENTO labels
  removeEventLabels(event.id);

  const io = req.app.get('io');
  if (io) {
    io.emit('event:ended', { eventId: event.id });
  }

  // Push automation: notify event ended
  try {
    const pushAuto = req.app.get('pushAutomation');
    if (pushAuto) {
      pushAuto.sendEventPush('onEventEnded', {
        eventName: event.name,
        prizeAmount: event.prizeAmount,
        prizeDescription: event.prizeDescription || '',
      });
    }
  } catch (e) { /* push automation not critical */ }

  res.json({ ok: true });
});

// Draw winner
router.post('/admin/events/:id/draw', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'ended') return res.status(400).json({ error: 'El evento debe estar terminado para sortear' });

  const result = dataService.drawEventWinner(event.id);
  if (!result) return res.status(400).json({ error: 'No hay participantes calificados para sortear' });

  const io = req.app.get('io');
  if (io) {
    // Send winner popup to the winner's client room
    io.to(`client:${result.winner.clientId}`).emit('event:winner', {
      eventId: result.event.id,
      prizeAmount: result.event.prizeAmount,
      prizeDescription: result.event.prizeDescription,
      eventName: result.event.name,
    });
    // Notify agents
    io.to('agents').emit('event:drawn', {
      eventId: result.event.id,
      winner: result.winner,
    });
    // End event for all remaining widgets
    io.emit('event:ended', { eventId: event.id });
  }

  // Push automation: notify raffle result
  try {
    const pushAuto = req.app.get('pushAutomation');
    if (pushAuto) {
      pushAuto.sendEventPush('onRaffleResult', {
        eventName: result.event.name,
        prizeAmount: result.event.prizeAmount,
        prizeDescription: result.event.prizeDescription || '',
        winnerName: result.winner.clientName || '',
      });
    }
  } catch (e) { /* push automation not critical */ }

  res.json({ event: result.event, winner: result.winner });
});

// Claim prize (can be called by admin or widget)
router.post('/admin/events/:id/claim', async (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'drawn') return res.status(400).json({ error: 'El evento no tiene un ganador sorteado' });
  if (event.winnerClaimed) return res.status(400).json({ error: 'El premio ya fue reclamado' });

  // Credit prize to winner (with bonus adjustment + casino deposit)
  const io = req.app.get('io');
  let creditTx: any = null;
  if (event.winnerClientId) {
    const winnerEntry = dataService.getEventEntries(event.id).find(e => e.clientId === event.winnerClientId);
    const result = await creditPrizeAndDeposit({
      clientId: event.winnerClientId,
      clientName: winnerEntry?.clientName || '',
      source: 'event',
      sourceId: event.id,
      amount: event.prizeAmount,
      io,
    });
    creditTx = result.tx;
  }

  dataService.updateEvent(event.id, {
    winnerClaimed: true,
    status: 'claimed',
  });
  if (io) {
    io.to('agents').emit('event:claimed', { eventId: event.id });
    // Notify winner
    if (event.winnerClientId) {
      io.to(`client:${event.winnerClientId}`).emit('event:prize-claimed', {
        eventId: event.id,
        prizeAmount: event.prizeAmount,
        creditedAmount: creditTx ? creditTx.creditedAmount : event.prizeAmount,
        bonusActive: creditTx ? creditTx.bonusActive : false,
      });
    }
  }

  res.json({ ok: true, prizeAmount: event.prizeAmount, creditedAmount: creditTx ? creditTx.creditedAmount : event.prizeAmount, clientId: event.winnerClientId });
});

// ============================================
// WIDGET ENDPOINTS (no auth)
// ============================================

// Get active event
router.get('/events/active', (req: Request, res: Response) => {
  const event = dataService.getActiveEvent();
  if (!event) return res.json({ event: null });

  const clientId = req.query.clientId ? Number(req.query.clientId) : null;
  let alreadyJoined = false;
  if (clientId) {
    const entry = dataService.getEventEntryByClient(event.id, clientId);
    alreadyJoined = !!entry;
  }

  res.json({
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      imageUrl: event.imageUrl,
      minDeposit: event.minDeposit,
      prizeAmount: event.prizeAmount,
      prizeDescription: event.prizeDescription,
      endsAt: event.endsAt,
    },
    alreadyJoined,
  });
});

// Join event
router.post('/events/:id/join', (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'active') return res.status(400).json({ error: 'El evento no está activo' });

  const { clientId, clientName, chatId } = req.body;
  if (!clientId || !chatId) return res.status(400).json({ error: 'clientId y chatId son requeridos' });

  // Check if already joined
  const existing = dataService.getEventEntryByClient(event.id, Number(clientId));
  if (existing) return res.status(400).json({ error: 'Ya estás participando en este evento', entry: existing });

  const entry = dataService.createEventEntry({
    eventId: event.id,
    clientId: Number(clientId),
    clientName: clientName || '',
    chatId,
  });

  // Track event join activity
  dataService.addActivity({
    clientId: Number(clientId),
    action: 'event_join',
    metadata: { eventId: event.id, eventName: event.name },
    sessionId: '',
  });

  // Label EVENTO se agrega solo cuando califica (depósito aprobado), no al inscribirse

  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('event:entry', entry);
  }

  res.json(entry);
});

// Widget claim prize endpoint (no auth, uses clientId)
router.post('/events/:id/claim-prize', async (req: Request, res: Response) => {
  const event = dataService.getEventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
  if (event.status !== 'drawn') return res.status(400).json({ error: 'No hay premio para reclamar' });
  if (event.winnerClaimed) return res.status(400).json({ error: 'El premio ya fue reclamado' });

  const { clientId } = req.body;
  if (!clientId || Number(clientId) !== event.winnerClientId) {
    return res.status(403).json({ error: 'No sos el ganador de este evento' });
  }

  // Credit prize (with bonus adjustment + casino deposit)
  const winnerEntry = dataService.getEventEntries(event.id).find(e => e.clientId === event.winnerClientId);
  const io = req.app.get('io');
  const { tx: creditTx2 } = await creditPrizeAndDeposit({
    clientId: event.winnerClientId!,
    clientName: winnerEntry?.clientName || '',
    source: 'event',
    sourceId: event.id,
    amount: event.prizeAmount,
    io,
  });

  dataService.updateEvent(event.id, {
    winnerClaimed: true,
    status: 'claimed',
  });

  if (io) {
    io.to('agents').emit('event:claimed', { eventId: event.id });
  }

  res.json({ ok: true, prizeAmount: event.prizeAmount, creditedAmount: creditTx2 ? creditTx2.creditedAmount : event.prizeAmount });
});

// ============================================
// HELPERS
// ============================================

function addEventLabel(clientId: number) {
  const labels = dataService.getLabels();
  let eventoLabel = labels.find(l => l.nombre.toUpperCase() === 'EVENTO');
  if (!eventoLabel) {
    eventoLabel = dataService.createLabel({ nombre: 'EVENTO', color: '#FFD700' });
  }
  const client = dataService.getClientById(clientId);
  if (client && !client.labels.includes(eventoLabel.id)) {
    dataService.updateClient(clientId, {
      labels: [...client.labels, eventoLabel.id],
    });
  }
}

function removeEventLabels(eventId: string) {
  const entries = dataService.getEventEntries(eventId);
  const labels = dataService.getLabels();
  const eventoLabel = labels.find(l => l.nombre.toUpperCase() === 'EVENTO');
  if (!eventoLabel) return;

  entries.forEach(entry => {
    const client = dataService.getClientById(entry.clientId);
    if (client && client.labels.includes(eventoLabel!.id)) {
      dataService.updateClient(entry.clientId, {
        labels: client.labels.filter(l => l !== eventoLabel!.id),
      });
    }
  });
}

export default router;
