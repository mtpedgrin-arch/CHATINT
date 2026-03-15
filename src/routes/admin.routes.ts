import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { dataService } from '../services/data.service';
import { casinoService } from '../services/casino.service';
import { pushService } from '../services/push.service';
import { ocrService } from '../services/ocr.service';

const router = Router();

// ── USERS ────────────────────────────────────
router.get('/users', (_req: Request, res: Response) => {
  const users = dataService.getUsers().map(u => ({
    ...u,
    password: undefined,
  }));
  res.json(users);
});

router.get('/users/:id', (req: Request, res: Response) => {
  const user = dataService.getUserById(parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { password, ...safe } = user;
  res.json(safe);
});

router.post('/users', async (req: Request, res: Response) => {
  try {
    const { nombre, apellido, usuario, email, password, rol, estatus, inicio, fin, restriccion } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const existing = dataService.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email ya registrado' });

    const hashed = await bcrypt.hash(password, 10);
    const user = dataService.createUser({
      nombre: nombre || '',
      apellido: apellido || '',
      usuario: usuario || email.split('@')[0],
      email,
      password: hashed,
      rol: rol || 'operador',
      estatus: estatus || 'active',
      inicio: inicio || null,
      fin: fin || null,
      restriccion: restriccion || 'Acceso libre',
    });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (err) {
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

router.put('/users/:id', async (req: Request, res: Response) => {
  const data = { ...req.body };
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 10);
  }
  const user = dataService.updateUser(parseInt(req.params.id), data);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { password, ...safe } = user;
  res.json(safe);
});

router.delete('/users/:id', (req: Request, res: Response) => {
  const ok = dataService.deleteUser(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ ok: true });
});

// ── CLIENTS ──────────────────────────────────
router.get('/clients', (_req: Request, res: Response) => {
  res.json(dataService.getClients());
});

router.get('/clients/:id', (req: Request, res: Response) => {
  const client = dataService.getClientById(parseInt(req.params.id));
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(client);
});

router.post('/clients', (req: Request, res: Response) => {
  try {
    const client = dataService.createClient(req.body);
    res.json(client);
  } catch (err) {
    res.status(500).json({ error: 'Error creando cliente' });
  }
});

router.put('/clients/:id', (req: Request, res: Response) => {
  const client = dataService.updateClient(parseInt(req.params.id), req.body);
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(client);
});

router.delete('/clients/:id', (req: Request, res: Response) => {
  const ok = dataService.deleteClient(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json({ ok: true });
});

// ── COMMANDS ─────────────────────────────────
router.get('/commands', (_req: Request, res: Response) => {
  res.json(dataService.getCommands());
});

router.post('/commands', (req: Request, res: Response) => {
  const cmd = dataService.createCommand(req.body);
  res.json(cmd);
});

router.put('/commands/:id', (req: Request, res: Response) => {
  const cmd = dataService.updateCommand(parseInt(req.params.id), req.body);
  if (!cmd) return res.status(404).json({ error: 'Comando no encontrado' });
  res.json(cmd);
});

router.delete('/commands/:id', (req: Request, res: Response) => {
  const ok = dataService.deleteCommand(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Comando no encontrado' });
  res.json({ ok: true });
});

// ── AUTO MESSAGES ────────────────────────────
router.get('/auto-messages', (_req: Request, res: Response) => {
  res.json(dataService.getAutoMessages());
});

router.post('/auto-messages', (req: Request, res: Response) => {
  const msg = dataService.createAutoMessage(req.body);
  res.json(msg);
});

router.put('/auto-messages/:id', (req: Request, res: Response) => {
  const msg = dataService.updateAutoMessage(parseInt(req.params.id), req.body);
  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
  res.json(msg);
});

router.delete('/auto-messages/:id', (req: Request, res: Response) => {
  const ok = dataService.deleteAutoMessage(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Mensaje no encontrado' });
  res.json({ ok: true });
});

// ── API CONFIG ───────────────────────────────
router.get('/api-config', (_req: Request, res: Response) => {
  const config = dataService.getApiConfig();
  // Helper to mask sensitive values
  const mask = (val: string, showLast = 4) => val ? '••••••' + (showLast > 0 ? val.slice(-showLast) : '') : '';

  const masked = {
    casino: {
      url: config.casino.url || '',
      user: config.casino.user || '',              // Not sensitive — show full value
      password: mask(config.casino.password, 0),    // Fully masked
      token: mask(config.casino.token, 6),
      cajaId: config.casino.cajaId || '',           // Not sensitive — show full value
    },
    aws: {
      accessKey: mask(config.aws.accessKey, 4),
      secretKey: mask(config.aws.secretKey, 0),
      region: config.aws.region || '',
    },
    openrouter: {
      apiKey: mask(config.openrouter.apiKey, 4),
      model: config.openrouter.model || '',
    },
    openai: {
      apiKey: mask(config.openai?.apiKey, 4),
      model: config.openai?.model || 'gpt-4o-mini',
    },
  };
  res.json(masked);
});

router.put('/api-config/:section', (req: Request, res: Response) => {
  const section = req.params.section as 'casino' | 'aws' | 'openrouter' | 'openai';
  if (!['casino', 'aws', 'openrouter', 'openai'].includes(section)) {
    return res.status(400).json({ error: 'Sección inválida' });
  }

  // Filter out masked values (starting with ••••••) to prevent overwriting real keys
  const cleanData: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (typeof value === 'string' && value.startsWith('••••••')) {
      // Skip masked values — keep the existing value in store
      continue;
    }
    cleanData[key] = value as string;
  }

  const config = dataService.updateApiConfig(section, cleanData);

  // If OpenAI key was updated (with a real value, not masked), reconfigure the OCR service
  if (section === 'openai' && cleanData.apiKey && !cleanData.apiKey.startsWith('••')) {
    ocrService.configure(cleanData.apiKey);
    console.log('[API-CONFIG] OpenAI key updated, OCR service reconfigured');
  }

  // If casino config was updated, reconfigure the casino service
  if (section === 'casino') {
    casinoService.configureFromStore();
    console.log('[API-CONFIG] Casino config updated, service reconfigured');
  }

  res.json({ ok: true });
});

// ── ACCOUNTS (TelePagos) ─────────────────────
router.get('/accounts', (_req: Request, res: Response) => {
  res.json(dataService.getAccounts());
});

router.post('/accounts', (req: Request, res: Response) => {
  const account = dataService.createAccount(req.body);
  res.json(account);
});

router.put('/accounts/:id', (req: Request, res: Response) => {
  const account = dataService.updateAccount(parseInt(req.params.id), req.body);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json(account);
});

router.delete('/accounts/:id', (req: Request, res: Response) => {
  const ok = dataService.deleteAccount(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json({ ok: true });
});

// ── SETTINGS ─────────────────────────────────
router.get('/settings', (_req: Request, res: Response) => {
  res.json(dataService.getSettings());
});

router.put('/settings', (req: Request, res: Response) => {
  const settings = dataService.updateSettings(req.body);
  res.json(settings);
});

// ── PLATFORM TOKEN / PROCESSING MODE ─────────
router.get('/platform-token/processing-mode', (_req: Request, res: Response) => {
  const settings = dataService.getSettings();
  res.json({ mode: settings.accountMode || 'auto' });
});

router.put('/platform-token/processing-mode', (req: Request, res: Response) => {
  const { mode } = req.body;
  dataService.updateSettings({ accountMode: mode === 'auto' ? 'auto' : 'manual' });
  res.json({ mode });
});

// ── DASHBOARD STATS ──────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  res.json(dataService.getStats());
});


// ── PAYMENTS ────────────────────────────────
router.get('/payments', (_req: Request, res: Response) => {
  res.json(dataService.getPayments());
});

router.get('/payments/pending', (_req: Request, res: Response) => {
  res.json(dataService.getPendingPayments());
});

router.get('/payments/stats', (_req: Request, res: Response) => {
  res.json(dataService.getPaymentStats());
});

router.get('/payments/chat/:chatId', (req: Request, res: Response) => {
  res.json(dataService.getPaymentsByChat(req.params.chatId));
});

router.get('/payments/client/:clientId', (req: Request, res: Response) => {
  res.json(dataService.getPaymentsByClient(parseInt(req.params.clientId)));
});

router.get('/payments/:id', (req: Request, res: Response) => {
  const payment = dataService.getPaymentById(parseInt(req.params.id));
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  res.json(payment);
});

router.post('/payments', (req: Request, res: Response) => {
  try {
    const payment = dataService.createPayment(req.body);
    const io = req.app.get('io');
    if (io) {
      io.to('agents').emit('payment:new', payment);
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Error creando pago' });
  }
});

router.put('/payments/:id', (req: Request, res: Response) => {
  const payment = dataService.updatePayment(parseInt(req.params.id), req.body);
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('payment:updated', payment);
  }
  res.json(payment);
});

// Approve a payment (admin action)
router.post('/payments/:id/approve', async (req: Request, res: Response) => {
  const { adminId, adminName } = req.body;
  const payment = dataService.updatePayment(parseInt(req.params.id), {
    status: 'approved',
    processedBy: adminName || adminId || 'admin',
    processedAt: new Date().toISOString(),
  });
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

  // Track payment approved activity
  if (payment.clientId) {
    const action = payment.type === 'deposit' ? 'deposit' as const : 'withdrawal' as const;
    dataService.addActivity({
      clientId: payment.clientId,
      action,
      metadata: { paymentId: payment.id, amount: payment.amount, type: payment.type, approvedBy: adminName || adminId },
      sessionId: '',
    });
    dataService.addActivity({
      clientId: payment.clientId,
      action: 'payment_approved',
      metadata: { paymentId: payment.id, amount: payment.amount, type: payment.type },
      sessionId: '',
    });
  }

  // Update client balance if deposit
  if (payment.clientId && payment.type === 'deposit') {
    const client = dataService.getClientById(payment.clientId);
    if (client) {
      dataService.updateClient(payment.clientId, {
        balance: client.balance + payment.amount,
        totalDepositos: client.totalDepositos + payment.amount,
        vip: (client.totalDepositos + payment.amount) >= 10000,
      });

      // ── DEPOSIT CREDITS IN CASINO 463.life ──
      const casinoUsername = client.usuario;
      // Always refresh config from store BEFORE checking configured
      casinoService.configureFromStore();
      if (casinoUsername && casinoService.configured) {
        try {
          const depositResult = await casinoService.depositCredits(casinoUsername, payment.amount);
          if (depositResult.success) {
            console.log(`[Admin→Casino] ✅ Fichas depositadas en 463.life: ${casinoUsername} +$${payment.amount} (newBalance: ${depositResult.newBalance})`);
          } else {
            console.error(`[Admin→Casino] ❌ Error depositando fichas: ${depositResult.error}`);
          }
        } catch (casinoErr: any) {
          console.error(`[Admin→Casino] ❌ Exception: ${casinoErr.message}`);
        }
      } else {
        console.log(`[Admin→Casino] ⚠️ Casino deposit skipped: username=${casinoUsername || 'N/A'}, configured=${casinoService.configured}`);
      }
    }
  }

  // Update chat pending payments count & reset state to options
  if (payment.chatId) {
    const chat = dataService.getChatById(payment.chatId);
    if (chat) {
      dataService.updateChat(payment.chatId, {
        pendingPayments: Math.max(0, chat.pendingPayments - 1),
        state: 'options',
      });
    }
  }

  const io = req.app.get('io');

  // Send confirmation message to client and reset menu
  if (payment.chatId) {
    const msgText = payment.type === 'withdrawal'
      ? `💸 ¡Retiro procesado! Se enviaron $${payment.amount.toLocaleString()} a tu cuenta bancaria.\n\nRevisá tu banco, la transferencia puede demorar unos minutos. ¿Necesitás algo más?`
      : `✅ ¡Fichas cargadas con éxito! Se acreditaron $${payment.amount.toLocaleString()} en tu cuenta.\n\n¿En qué más podemos ayudarte?`;
    const confirmMsg = dataService.addChatMessage({
      chatId: payment.chatId,
      sender: 'bot',
      senderName: 'Casino 463',
      text: msgText,
      type: 'text',
    });
    if (io) {
      io.to(`chat:${payment.chatId}`).emit('message:new', confirmMsg);
      io.to('agents').emit('message:new', confirmMsg);
    }
  }

  // Auto-push notification to client
  if (payment.chatId) {
    const subs = dataService.getPushSubscriptionsByChat(payment.chatId);
    if (subs.length > 0) {
      pushService.sendToMultiple(
        subs.map(s => ({ endpoint: s.endpoint, keys: s.keys })),
        {
          title: '✅ ¡Fichas cargadas!',
          body: `Se acreditaron $${payment.amount.toLocaleString()} en tu cuenta.`,
          icon: '/icons/icon-192.png',
          url: '/widget',
        }
      ).catch(() => {});
    }
  }

  // Auto-qualify / auto-enroll event entry if applicable
  const activeEvent = dataService.getActiveEvent();
  if (activeEvent && payment.clientId && payment.type === 'deposit' && payment.amount >= activeEvent.minDeposit) {
    let entry = dataService.getEventEntryByClient(activeEvent.id, payment.clientId);

    // Auto-enroll: if client didn't click PARTICIPAR but deposited enough during event
    if (!entry) {
      const clientForEntry = dataService.getClientById(payment.clientId);
      entry = dataService.createEventEntry({
        eventId: activeEvent.id,
        clientId: payment.clientId,
        clientName: clientForEntry?.nombre || clientForEntry?.usuario || '',
        chatId: payment.chatId || '',
      });
      if (io) {
        io.to('agents').emit('event:entry', entry);
      }
    }

    // Qualify the entry
    if (entry && !entry.qualified) {
      dataService.qualifyEventEntry(entry.id, payment.id, payment.amount);

      // Add EVENTO label only when qualified (not on join)
      const allLabels = dataService.getLabels();
      let eventoLabel = allLabels.find((l: any) => l.nombre.toUpperCase() === 'EVENTO');
      if (!eventoLabel) {
        eventoLabel = dataService.createLabel({ nombre: 'EVENTO', color: '#FFD700' });
      }
      const cl = dataService.getClientById(payment.clientId);
      if (cl && !cl.labels.includes(eventoLabel.id)) {
        dataService.updateClient(payment.clientId, {
          labels: [...cl.labels, eventoLabel.id],
        });
      }

      if (io) {
        io.to('agents').emit('event:qualified', {
          eventId: activeEvent.id,
          entryId: entry.id,
          clientId: payment.clientId,
          amount: payment.amount,
        });
        // Notify client they qualified (auto-enrolled or manual)
        if (payment.chatId) {
          const eventMsg = dataService.addChatMessage({
            chatId: payment.chatId,
            sender: 'bot',
            senderName: 'Casino 463',
            text: `🎰 ¡Quedaste clasificado para el evento "${activeEvent.name}"! Tu depósito de $${payment.amount.toLocaleString()} te pone en el sorteo por ${activeEvent.prizeDescription}. ¡Mucha suerte!`,
            type: 'text',
          });
          io.to(`chat:${payment.chatId}`).emit('message:new', eventMsg);
          io.to('agents').emit('message:new', eventMsg);
        }
      }
    }
  }

  if (io) {
    io.to('agents').emit('payment:approved', payment);
    if (payment.chatId) {
      // Emit specific event based on type so widget shows the right popup
      // Emit to BOTH chat room and client room for reliability
      const eventName = payment.type === 'withdrawal' ? 'withdrawal:approved' : 'payment:approved';
      io.to(`chat:${payment.chatId}`).emit(eventName, payment);
      if (payment.clientId) {
        io.to(`client:${payment.clientId}`).emit(eventName, payment);
      }
      io.to(`chat:${payment.chatId}`).emit('chat:state-changed', { chatId: payment.chatId, state: 'options' });
      io.to('agents').emit('chat:updated', { chatId: payment.chatId });
    }
  }
  res.json(payment);
});

// Reject a payment (admin action)
router.post('/payments/:id/reject', (req: Request, res: Response) => {
  const { adminId, adminName, reason } = req.body;
  const payment = dataService.updatePayment(parseInt(req.params.id), {
    status: 'rejected',
    processedBy: adminName || adminId || 'admin',
    rejectionReason: reason || 'Rechazado por administrador',
    processedAt: new Date().toISOString(),
  });
  if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

  // Track payment rejected activity
  if (payment.clientId) {
    dataService.addActivity({
      clientId: payment.clientId,
      action: 'payment_rejected',
      metadata: { paymentId: payment.id, amount: payment.amount, type: payment.type, reason },
      sessionId: '',
    });
  }

  // Update chat pending payments count & reset state to options
  if (payment.chatId) {
    const chat = dataService.getChatById(payment.chatId);
    if (chat) {
      dataService.updateChat(payment.chatId, {
        pendingPayments: Math.max(0, chat.pendingPayments - 1),
        state: 'options',
      });
    }
  }

  const io = req.app.get('io');

  // Send rejection message to client and reset menu
  if (payment.chatId) {
    const rejectMsg = dataService.addChatMessage({
      chatId: payment.chatId,
      sender: 'bot',
      senderName: 'Casino 463',
      text: `❌ Tu comprobante no pudo ser verificado.\nMotivo: ${reason || 'No se pudo confirmar la transferencia.'}\n\nPodés intentar nuevamente desde el menú.`,
      type: 'text',
    });
    if (io) {
      io.to(`chat:${payment.chatId}`).emit('message:new', rejectMsg);
      io.to('agents').emit('message:new', rejectMsg);
    }
  }

  // Auto-push notification to client
  if (payment.chatId) {
    const subs = dataService.getPushSubscriptionsByChat(payment.chatId);
    if (subs.length > 0) {
      pushService.sendToMultiple(
        subs.map(s => ({ endpoint: s.endpoint, keys: s.keys })),
        {
          title: '❌ Comprobante rechazado',
          body: reason || 'No se pudo confirmar la transferencia. Intentá nuevamente.',
          icon: '/icons/icon-192.png',
          url: '/widget',
        }
      ).catch(() => {});
    }
  }

  if (io) {
    io.to('agents').emit('payment:rejected', payment);
    if (payment.chatId) {
      io.to(`chat:${payment.chatId}`).emit('payment:rejected', payment);
      io.to(`chat:${payment.chatId}`).emit('chat:state-changed', { chatId: payment.chatId, state: 'options' });
      io.to('agents').emit('chat:updated', { chatId: payment.chatId });
    }
  }
  res.json(payment);
});

// Check for duplicate comprobante by image hash
router.post('/payments/check-duplicate', (req: Request, res: Response) => {
  const { imageHash } = req.body;
  if (!imageHash) return res.status(400).json({ error: 'imageHash requerido' });
  const existing = dataService.getPaymentByImageHash(imageHash);
  res.json({ duplicate: !!existing, existingPayment: existing || null });
});

// ── MODAL CONFIG ────────────────────────────
router.get('/modal', (_req: Request, res: Response) => {
  res.json(dataService.getModalConfig());
});

router.put('/modal', (req: Request, res: Response) => {
  const config = dataService.updateModalConfig(req.body);
  res.json(config);
});

// ── BUTTON OPTIONS ──────────────────────────
router.get('/options', (_req: Request, res: Response) => {
  res.json(dataService.getButtonOptions());
});

router.put('/options', (req: Request, res: Response) => {
  const options = dataService.updateButtonOptions(req.body);
  res.json(options);
});

// ── AMOUNTS (min retiro/deposito) ───────────
router.get('/amounts', (_req: Request, res: Response) => {
  const settings = dataService.getSettings();
  res.json({ minRetiro: settings.minRetiro, minDeposito: settings.minDeposito });
});

router.put('/amounts', (req: Request, res: Response) => {
  const { minRetiro, minDeposito } = req.body;
  const settings = dataService.updateSettings({ minRetiro, minDeposito });
  res.json({ minRetiro: settings.minRetiro, minDeposito: settings.minDeposito });
});

// ── LABELS ──────────────────────────────────
router.get('/labels', (_req: Request, res: Response) => {
  res.json(dataService.getLabels());
});

router.post('/labels', (req: Request, res: Response) => {
  const label = dataService.createLabel(req.body);
  res.json(label);
});

router.put('/labels/:id', (req: Request, res: Response) => {
  const label = dataService.updateLabel(parseInt(req.params.id), req.body);
  if (!label) return res.status(404).json({ error: 'Label no encontrado' });
  res.json(label);
});

router.delete('/labels/:id', (req: Request, res: Response) => {
  const ok = dataService.deleteLabel(parseInt(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Label no encontrado' });
  res.json({ ok: true });
});

// ── CASINO 463.life API ─────────────────────
// Test connection
router.post('/casino/test-connection', async (req: Request, res: Response) => {
  try {
    const { url, user, password, cajaId } = req.body;

    // Si vienen credenciales en el body, configurar temporalmente
    if (url && user && password) {
      casinoService.configure({ url, apiKey: '', user, password, cajaId: cajaId || '' });
    } else {
      // Usar credenciales del store
      casinoService.configureFromStore();
    }

    const result = await casinoService.testConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Login to casino
router.post('/casino/login', async (_req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const result = await casinoService.login();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create player in casino
router.post('/casino/create-user', async (req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const { nombre, telefono } = req.body;
    if (!nombre) return res.status(400).json({ success: false, error: 'Nombre requerido' });
    const result = await casinoService.createUser(nombre, telefono || '');

    // If casino user created successfully, also save as client in our DB
    if (result.success && result.user) {
      // Check if client already exists
      const existing = dataService.getClientByCasinoUsername(result.user.username);
      if (!existing) {
        dataService.createClient({
          nombre: nombre,
          telefono: telefono || '',
          usuario: result.user.username,
          clave: result.user.password,
          cuit: '',
          balance: 0,
          wager: 0,
          saldoCobrable: 0,
          estado: 'activo',
          vip: false,
          totalDepositos: 0,
          totalRetiros: 0,
          labels: [],
        });
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deposit credits to player
router.post('/casino/deposit', async (req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const { username, amount } = req.body;
    if (!username || !amount) return res.status(400).json({ success: false, error: 'username y amount requeridos' });
    const result = await casinoService.depositCredits(username, amount);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Withdraw credits from player
router.post('/casino/withdraw', async (req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const { username, amount } = req.body;
    if (!username || !amount) return res.status(400).json({ success: false, error: 'username y amount requeridos' });
    const result = await casinoService.withdrawCredits(username, amount);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get player balance
router.get('/casino/balance/:username', async (req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const result = await casinoService.getBalance(req.params.username);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all players from caja
router.get('/casino/players', async (_req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const result = await casinoService.getPlayers();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check if user exists
router.get('/casino/user-exists/:username', async (req: Request, res: Response) => {
  try {
    casinoService.configureFromStore();
    const exists = await casinoService.userExists(req.params.username);
    res.json({ exists });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── BONUS CONFIG ──────────────────────────────
router.get('/bonus', (_req: Request, res: Response) => {
  const bonus = dataService.getActiveBonus();
  console.log(`[Bonus] GET → enabled=${bonus.enabled}, pct=${bonus.percentage}, name="${bonus.name}"`);
  res.json(bonus);
});

router.put('/bonus', (req: Request, res: Response) => {
  const { enabled, percentage, name } = req.body;
  // Only include fields that were actually sent (avoid undefined overwrite)
  const update: any = {};
  if (enabled !== undefined) update.enabled = enabled;
  if (percentage !== undefined) update.percentage = Number(percentage);
  if (name !== undefined) update.name = name;
  console.log(`[Bonus] PUT received: body=${JSON.stringify(req.body)} → update=${JSON.stringify(update)}`);
  const bonus = dataService.updateActiveBonus(update);

  // Notify admin panel
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('bonus:updated', bonus);
  }

  console.log(`[Bonus] Updated: ${bonus.enabled ? bonus.name + ' (' + bonus.percentage + '%)' : 'DESACTIVADO'}`);
  res.json(bonus);
});

// ── PRIZE TRANSACTIONS ──────────────────────────
router.get('/prize-transactions', (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const clientId = req.query.clientId ? Number(req.query.clientId) : null;

  if (clientId) {
    res.json(dataService.getPrizeTransactionsByClient(clientId));
  } else {
    res.json(dataService.getPrizeTransactions(limit));
  }
});

export default router;
