import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';
import { paltaService } from '../services/palta.service';
import { ocrService } from '../services/ocr.service';

const router = Router();

// Get Palta service status
router.get('/status', (_req: Request, res: Response) => {
  res.json(paltaService.getStatus());
});

// Get Palta config
router.get('/config', (_req: Request, res: Response) => {
  const config = dataService.getPaltaConfig();
  // Mask password
  res.json({
    ...config,
    password: config.password ? '••••••••' : '',
  });
});

// Update Palta config
router.put('/config', (req: Request, res: Response) => {
  const { email, password, pollIntervalSeconds, autoApprove, headless } = req.body;
  const update: Record<string, any> = {};
  if (email !== undefined) update.email = email;
  if (password !== undefined && password !== '••••••••') update.password = password;
  if (pollIntervalSeconds !== undefined) update.pollIntervalSeconds = Math.max(30, Math.min(300, pollIntervalSeconds));
  if (autoApprove !== undefined) update.autoApprove = autoApprove;
  if (headless !== undefined) update.headless = headless;

  const config = dataService.updatePaltaConfig(update);
  res.json({
    ...config,
    password: config.password ? '••••••••' : '',
  });
});

// Start Palta scraper (opens browser)
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const result = await paltaService.init();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stop Palta scraper
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    await paltaService.stop();
    res.json({ success: true, message: 'Palta Wallet detenido' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Enable/disable polling
router.post('/polling/start', (_req: Request, res: Response) => {
  paltaService.startPolling();
  res.json({ success: true, message: 'Polling activado' });
});

router.post('/polling/stop', (_req: Request, res: Response) => {
  paltaService.stopPolling();
  res.json({ success: true, message: 'Polling desactivado' });
});

// Trigger manual poll
router.post('/poll', async (_req: Request, res: Response) => {
  try {
    const result = await paltaService.poll();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Palta transactions
router.get('/transactions', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const transactions = dataService.getPaltaTransactions(limit);
  res.json(transactions);
});

// Get unmatched transactions
router.get('/transactions/unmatched', (_req: Request, res: Response) => {
  const transactions = dataService.getUnmatchedPaltaTransactions();
  res.json(transactions);
});

// Manually match a transaction to a payment
router.post('/transactions/:id/match', async (req: Request, res: Response) => {
  const { paymentId, autoApprove } = req.body;
  const txId = req.params.id;

  const transactions = dataService.getPaltaTransactions(1000);
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return res.status(404).json({ error: 'Transacción no encontrada' });

  const payment = dataService.getPaymentById(paymentId);
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

  // Mark as matched
  dataService.updatePaltaTransaction(txId, {
    matched: true,
    matchedPaymentId: paymentId,
  });

  // Auto-approve if requested
  if (autoApprove) {
    const approved = await paltaService.autoApprovePayment(paymentId, tx.paltaId);
    if (approved) {
      dataService.updatePaltaTransaction(txId, { autoApproved: true });
    }
    return res.json({ success: true, autoApproved: approved });
  }

  res.json({ success: true, autoApproved: false });
});

// Get matching suggestions for pending payments
router.get('/suggestions', (_req: Request, res: Response) => {
  const unmatched = dataService.getUnmatchedPaltaTransactions();
  const matches = paltaService.findMatches(unmatched);
  res.json(matches.map(m => ({
    transactionId: m.transaction.id,
    paymentId: m.payment.id,
    paymentAmount: m.payment.amount,
    transactionAmount: m.transaction.amount,
    paltaName: m.transaction.counterpartyName,
    clientName: m.payment.clientId ? dataService.getClientById(m.payment.clientId)?.nombre : null,
    confidence: m.confidence,
    nameMatchType: m.nameMatchType,
  })));
});

// Stats
router.get('/stats', (_req: Request, res: Response) => {
  const transactions = dataService.getPaltaTransactions(10000);
  const today = new Date().toISOString().split('T')[0];
  const todayTxs = transactions.filter(t => t.createdAt.startsWith(today));

  res.json({
    totalTransactions: transactions.length,
    todayTransactions: todayTxs.length,
    totalMatched: transactions.filter(t => t.matched).length,
    totalAutoApproved: transactions.filter(t => t.autoApproved).length,
    totalUnmatched: transactions.filter(t => !t.matched).length,
    todayVolume: todayTxs.reduce((sum, t) => sum + t.amount, 0),
    totalVolume: transactions.reduce((sum, t) => sum + t.amount, 0),
  });
});

// ── OCR TEST ──────────────────────────
// Test OCR on an existing image
router.post('/ocr-test', async (req: Request, res: Response) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl requerido' });

    if (!ocrService.isConfigured()) {
      return res.status(400).json({ error: 'OCR no configurado (falta OPENAI_API_KEY)' });
    }

    const result = await ocrService.analyzeComprobante(imageUrl);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// OCR status
router.get('/ocr-status', (_req: Request, res: Response) => {
  res.json({
    configured: ocrService.isConfigured(),
    model: 'gpt-4o-mini',
  });
});

// ── TEST CONNECTION: Real health check ──
router.post('/test', async (_req: Request, res: Response) => {
  try {
    const result = await paltaService.healthCheck();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      message: `Error en health check: ${err.message}`,
      browserOpen: false,
      loggedIn: false,
      canFetchData: false,
    });
  }
});

// ── DEBUG: Show all connected socket rooms ──
router.get('/debug-sockets', (_req: Request, res: Response) => {
  const io = _req.app.get('io');
  if (!io) return res.status(500).json({ error: 'Socket.IO no disponible' });

  const rooms = io.sockets.adapter.rooms;
  const sids = io.sockets.adapter.sids;
  const roomList: Record<string, number> = {};

  rooms.forEach((sockets: Set<string>, room: string) => {
    // Skip socket ID rooms (they're auto-created per socket)
    if (!sids.has(room)) {
      roomList[room] = sockets.size;
    }
  });

  res.json({
    totalConnected: io.engine.clientsCount,
    rooms: roomList,
  });
});

// ── TEST: Trigger popup on widget (for testing only) ──
router.post('/test-popup', (req: Request, res: Response) => {
  const { chatId, clientId, type, amount } = req.body;
  if (!chatId && !clientId) return res.status(400).json({ error: 'chatId o clientId requerido' });

  const io = req.app.get('io');
  if (!io) return res.status(500).json({ error: 'Socket.IO no disponible' });

  const popupType = type || 'deposit';
  const popupAmount = amount || 50000;
  const eventName = popupType === 'withdrawal' ? 'withdrawal:approved' : 'payment:approved';
  const payload = { chatId, clientId, type: popupType, amount: popupAmount };

  // Emit to ALL possible rooms for maximum reach
  if (chatId) {
    io.to(`chat:${chatId}`).emit(eventName, payload);
  }
  if (clientId) {
    io.to(`client:${clientId}`).emit(eventName, payload);
  }

  // Debug: log connected sockets in rooms
  const chatRoom = chatId ? io.sockets.adapter.rooms.get(`chat:${chatId}`) : null;
  const clientRoom = clientId ? io.sockets.adapter.rooms.get(`client:${clientId}`) : null;
  console.log(`[TEST-POPUP] Event: ${eventName}, Amount: ${popupAmount}`);
  console.log(`[TEST-POPUP] chat:${chatId} room has ${chatRoom ? chatRoom.size : 0} sockets`);
  console.log(`[TEST-POPUP] client:${clientId} room has ${clientRoom ? clientRoom.size : 0} sockets`);

  res.json({
    success: true,
    message: `Popup ${popupType} enviado`,
    amount: popupAmount,
    debug: {
      chatRoomSockets: chatRoom ? chatRoom.size : 0,
      clientRoomSockets: clientRoom ? clientRoom.size : 0,
    }
  });
});

// ── AUTH TOKEN: Export/Import for Railway (API mode without browser) ──
// Export token (get from local after manual login)
router.get('/token', (_req: Request, res: Response) => {
  try {
    const tokenPath = require('path').join(__dirname, '../../data/palta-session/auth-token.json');
    const fs = require('fs');
    if (!fs.existsSync(tokenPath)) {
      return res.status(404).json({ error: 'No hay token guardado. Logueate primero localmente para capturar el token.' });
    }
    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Import token (upload to Railway so it can use API mode)
router.post('/token', (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Enviar { token: "..." }' });
    }
    const tokenPath = require('path').join(__dirname, '../../data/palta-session/auth-token.json');
    const fs = require('fs');
    const dir = require('path').dirname(tokenPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tokenPath, JSON.stringify({ token, savedAt: new Date().toISOString() }));
    res.json({ success: true, message: 'Token importado. Ahora podés iniciar Palta en API mode.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
