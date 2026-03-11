import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import chatRoutes from './routes/chat.routes';
import adminRoutes from './routes/admin.routes';
import notificationRoutes from './routes/notification.routes';
import eventRoutes from './routes/event.routes';
import { dataService } from './services/data.service';
import { pushService } from './services/push.service';
import { createPushAutomation } from './services/push-automation.service';
import { createPushAutomationRouter } from './routes/push-automation.routes';
import analyticsRoutes from './routes/analytics.routes';
import { analyticsService } from './services/analytics.service';
import paltaRoutes from './routes/palta.routes';
import { paltaService } from './services/palta.service';
import { ocrService } from './services/ocr.service';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3003');
const app = express();
const server = http.createServer(app);

// ============================================
// SOCKET.IO
// ============================================
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Agent joins
  socket.on('agent:join', (agentId: string) => {
    socket.join('agents');
    socket.join(`agent:${agentId}`);
  });

  // Visitor joins conversation
  socket.on('visitor:join', (chatId: string) => {
    socket.join(`chat:${chatId}`);
  });

  // Widget identifies client (for targeted push/popups)
  socket.on('widget:identify', (data: { clientId?: number; chatId?: string }) => {
    if (data.clientId) {
      socket.join(`client:${data.clientId}`);
      // Track session start
      dataService.addActivity({
        clientId: data.clientId,
        action: 'session_start',
        metadata: { source: 'widget:identify', socketId: socket.id },
        sessionId: socket.id,
      });
    }
    if (data.chatId) socket.join(`chat:${data.chatId}`);

    // Check pending winner popup for reconnecting clients
    if (data.clientId) {
      const events = dataService.getEvents();
      const winnerEvent = events.find(e =>
        e.status === 'drawn' &&
        e.winnerClientId === data.clientId &&
        !e.winnerClaimed
      );
      if (winnerEvent) {
        socket.emit('event:winner', {
          eventId: winnerEvent.id,
          prizeAmount: winnerEvent.prizeAmount,
          prizeDescription: winnerEvent.prizeDescription,
          eventName: winnerEvent.name,
        });
      }
    }
  });

  // Agent sends message
  socket.on('agent:message', (data: { chatId: string; text: string; agentName: string }) => {
    const msg = dataService.addChatMessage({
      chatId: data.chatId,
      sender: 'agent',
      senderName: data.agentName || 'Agente',
      text: data.text,
      type: 'text',
    });
    io.to(`chat:${data.chatId}`).emit('message:new', msg);
    io.to('agents').emit('message:new', msg);
    io.to('agents').emit('chat:updated', { chatId: data.chatId, message: msg });
  });

  // Visitor sends message (via socket - not used by widget anymore, kept for compatibility)
  socket.on('visitor:message', (data: { chatId: string; text: string; visitorName: string }) => {
    // Widget now uses HTTP /widget/message for automation flow
    // This handler is kept for backward compatibility but doesn't create messages
    // to avoid duplicates with the HTTP handler
    console.log(`[Socket] visitor:message received for chat ${data.chatId} (handled via HTTP)`);
  });

  // Typing indicators
  socket.on('agent:typing', (data: { chatId: string; agentName: string }) => {
    io.to(`chat:${data.chatId}`).emit('typing:start', { sender: 'agent', name: data.agentName });
  });
  socket.on('agent:stop-typing', (data: { chatId: string }) => {
    io.to(`chat:${data.chatId}`).emit('typing:stop', { sender: 'agent' });
  });
  socket.on('visitor:typing', (data: { chatId: string }) => {
    io.to('agents').emit('typing:start', { sender: 'visitor', chatId: data.chatId });
  });

  // Chat actions
  socket.on('chat:resolve', (data: { chatId: string }) => {
    dataService.updateChat(data.chatId, { status: 'resolved' });
    io.to('agents').emit('chat:resolved', { chatId: data.chatId });
    io.to(`chat:${data.chatId}`).emit('chat:resolved', {});
  });
  socket.on('chat:assign', (data: { chatId: string; agentId: string }) => {
    dataService.updateChat(data.chatId, { assignedAgent: data.agentId, status: 'active' });
    io.to('agents').emit('chat:assigned', { chatId: data.chatId, agentId: data.agentId });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

app.set('io', io);

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Service Worker header
app.get('/sw.js', (_req, res, next) => {
  res.setHeader('Service-Worker-Allowed', '/');
  next();
});

// Static files — serve frontend build FIRST (production), then public/ (widget, images, etc.)
const frontendDistPath = path.join(__dirname, '../frontend/dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// API ROUTES
// ============================================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', eventRoutes);

// Push Automation System (disabled by default - activate from admin panel or API)
const pushAutomation = createPushAutomation(dataService, pushService);
app.set('pushAutomation', pushAutomation);
app.use('/api/push-automation', createPushAutomationRouter(pushAutomation));

// Analytics System
app.use('/api/analytics', analyticsRoutes);

// OCR Service (OpenAI Vision) — prioritize stored config, fallback to .env
const storedOpenAIKey = dataService.getApiConfig()?.openai?.apiKey;
const openaiKey = storedOpenAIKey || process.env.OPENAI_API_KEY;
console.log(`[OCR] Buscando API key: stored=${storedOpenAIKey ? '****' + storedOpenAIKey.slice(-4) : 'NO'}, env=${process.env.OPENAI_API_KEY ? '****' + process.env.OPENAI_API_KEY.slice(-4) : 'NO'}`);
if (openaiKey) {
  ocrService.configure(openaiKey);
}
// Dynamic key resolver — if key changes via admin panel or env, OCR picks it up
ocrService.setKeyResolver(() => {
  return dataService.getApiConfig()?.openai?.apiKey || process.env.OPENAI_API_KEY || '';
});
app.set('ocrService', ocrService);

// Palta Wallet Auto-Verification
paltaService.setIO(io);
app.use('/api/palta', paltaRoutes);

// ============================================
// PAGE ROUTES
// ============================================
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));

// Casino wrapper page — 463.life background + widget chat
app.get('/casino', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(__dirname, '../public/casino.html'));
});

app.get('/widget', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, '../public/widget.html'));
});

// Widget embed script (legacy — redirects to static casino-widget.js)
// New approach: use /casino-widget.js static file with CasinoWidget.init()
app.get('/widget/embed.js', (_req, res) => {
  res.redirect('/casino-widget.js');
});

// ── DEBUG: Test popup trigger ──
app.post('/api/debug/test-popup', (req, res) => {
  const { chatId, clientId, type = 'deposit', amount = 5000 } = req.body || {};
  if (!chatId) return res.status(400).json({ error: 'chatId required' });

  const payload = { chatId, clientId, type, amount };
  console.log('[DEBUG] Emitting payment:approved popup:', payload);

  if (chatId) io.to(`chat:${chatId}`).emit('payment:approved', payload);
  if (clientId) io.to(`client:${clientId}`).emit('payment:approved', payload);

  res.json({ ok: true, emitted: payload });
});

// SPA fallback — serve React build if available, otherwise dev redirect page
app.get('*', (_req, res) => {
  if (fs.existsSync(frontendIndexPath)) {
    return res.sendFile(frontendIndexPath);
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// START
// ============================================
server.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('Casino 463 Admin Panel v1.0');
  console.log('='.repeat(50));
  console.log(`Server:      http://localhost:${PORT}`);
  console.log(`Admin Panel: http://localhost:${PORT}`);
  console.log(`Login:       http://localhost:${PORT}/login`);
  console.log(`Chat Widget: http://localhost:${PORT}/widget`);
  console.log(`Health:      http://localhost:${PORT}/api/health`);
  console.log('='.repeat(50));
  console.log('WebSocket ready for real-time chat');
  console.log('Push Automation: LOADED (disabled by default)');
  console.log('  → Activar: POST /api/push-automation/start');
  console.log('  → Config:  GET /api/push-automation/config');
  console.log('  → Status:  GET /api/push-automation/status');
  console.log('All systems operational');

  // Intentar iniciar push automation (solo arranca si está habilitado en config)
  pushAutomation.start();

  // Analytics: daily cleanup scheduler (every 24h, clean logs older than 30 days)
  setInterval(() => {
    analyticsService.runDailyCleanup();
  }, 24 * 60 * 60 * 1000);
  console.log('Analytics: LOADED (tracking active)');
  console.log('  → Dashboard: GET /api/analytics/overview');
  console.log('  → Cleanup: auto (30 days retention)');
  console.log('OCR Service:', ocrService.isConfigured() ? 'CONFIGURADO (OpenAI Vision)' : 'NO CONFIGURADO (falta OPENAI_API_KEY)');
  // Fix stale Palta status (e.g., server restarted while browser was "running")
  paltaService.fixStaleStatus();

  console.log('Palta Wallet: LOADED');
  console.log('  → Status:  GET /api/palta/status');
  console.log('  → Start:   POST /api/palta/start');
  console.log('  → Test:    POST /api/palta/test');
  console.log('  → Poll:    POST /api/palta/poll');
});

export { io };
export default app;
