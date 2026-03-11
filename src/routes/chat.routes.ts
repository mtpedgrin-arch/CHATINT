import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';
import { ocrService } from '../services/ocr.service';
import { paltaService } from '../services/palta.service';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── CHATS ────────────────────────────────────
router.get('/chats', (req: Request, res: Response) => {
  const { search, unread, tagColor, includeArchived } = req.query;
  const chats = dataService.getChats({
    search: search as string,
    unread: unread === 'true',
    tagColor: tagColor as string,
    archived: includeArchived === 'true' ? undefined : false,
  });
  res.json(chats);
});

router.get('/chats/:id', (req: Request, res: Response) => {
  const chat = dataService.getChatById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  res.json(chat);
});

router.post('/chats', (req: Request, res: Response) => {
  try {
    const chat = dataService.createChat(req.body);
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: 'Error creando chat' });
  }
});

router.put('/chats/:id', (req: Request, res: Response) => {
  const chat = dataService.updateChat(req.params.id, req.body);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  res.json(chat);
});

router.post('/chats/:id/resolve', (req: Request, res: Response) => {
  const chat = dataService.updateChat(req.params.id, { status: 'resolved' });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  const io = req.app.get('io');
  if (io) {
    io.to('agents').emit('chat:resolved', { chatId: req.params.id });
    io.to(`chat:${req.params.id}`).emit('chat:resolved', {});
  }
  res.json(chat);
});

router.post('/chats/:id/assign', (req: Request, res: Response) => {
  const { agentId } = req.body;
  const chat = dataService.updateChat(req.params.id, { assignedAgent: agentId, status: 'active' });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  res.json(chat);
});

router.post('/chats/:id/read', (req: Request, res: Response) => {
  dataService.markChatRead(req.params.id);
  res.json({ ok: true });
});

router.post('/chats/:id/archive', (req: Request, res: Response) => {
  const chat = dataService.updateChat(req.params.id, { archived: true });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  res.json(chat);
});

router.post('/chats/:id/label', (req: Request, res: Response) => {
  const chat = dataService.getChatById(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  const { labelId, action } = req.body;
  let labels = [...chat.labels];
  if (action === 'add' && !labels.includes(labelId)) labels.push(labelId);
  if (action === 'remove') labels = labels.filter(l => l !== labelId);
  const updated = dataService.updateChat(req.params.id, { labels });
  res.json(updated);
});

// ── MESSAGES ─────────────────────────────────
router.get('/chats/:id/messages', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const before = req.query.before as string;
  const messages = dataService.getChatMessages(req.params.id, limit, before);
  res.json(messages);
});

router.post('/chats/:id/messages', (req: Request, res: Response) => {
  try {
    const { text, sender, senderName } = req.body;
    const msg = dataService.addChatMessage({
      chatId: req.params.id,
      sender: sender || 'agent',
      senderName: senderName || 'Agente',
      text,
      type: 'text',
    });
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${req.params.id}`).emit('message:new', msg);
      io.to('agents').emit('message:new', msg);
    }
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: 'Error enviando mensaje' });
  }
});

// ── WIDGET LOGIN ─────────────────────────────
router.post('/widget/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }

    // Check against clients table
    let client = dataService.getClientByCasinoUsername(username);

    // If client doesn't exist, auto-create from widget login
    if (!client) {
      console.log(`[WIDGET-LOGIN] Client "${username}" not found, auto-creating...`);
      client = dataService.createClient({
        nombre: username,
        telefono: '',
        usuario: username,
        clave: password,
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
      console.log(`[WIDGET-LOGIN] Client "${username}" created with id: ${client.id}`);
    } else if (client.clave && client.clave !== password) {
      // Only check password if client already has one set
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // Update clave if client had no password before
    if (!client.clave && password) {
      dataService.updateClient(client.id, { clave: password });
    }

    if (client.estado === 'bloqueado') {
      return res.status(403).json({ success: false, error: 'Usuario bloqueado' });
    }

    // Find existing chat for this client (ALWAYS reuse same chat - search by clientId AND casinoUsername)
    const allChats = dataService.getChats({ archived: undefined });
    const clientChats = allChats
      .filter(c => c.clientId === client.id || c.casinoUsername?.toLowerCase() === username.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Always use the FIRST (most recent) chat - never create duplicates
    let chat = clientChats[0] || null;

    const io = req.app.get('io');

    if (chat) {
      // Reopen if resolved or archived
      if (chat.status === 'resolved' || chat.archived) {
        chat = dataService.updateChat(chat.id, {
          status: 'bot',
          state: 'options',
          archived: false,
        }) || chat;

        // Send welcome back message
        const welcomeBack = `¡Hola de nuevo ${client.nombre}! 👋 ¿En qué podemos ayudarte?`;
        dataService.addChatMessage({
          chatId: chat.id,
          sender: 'bot',
          senderName: 'Casino 463',
          text: welcomeBack,
          type: 'text',
        });

        if (io) {
          io.to('agents').emit('chat:updated', { chatId: chat.id });
        }
      }

      // Ensure clientId and casinoUsername are up to date
      if (chat.clientId !== client.id || chat.casinoUsername !== client.usuario) {
        chat = dataService.updateChat(chat.id, {
          clientId: client.id,
          casinoUsername: client.usuario,
          visitorName: client.nombre,
        }) || chat;
      }
    } else {
      // No chat exists at all - create first one
      chat = dataService.createChat({
        clientId: client.id,
        visitorName: client.nombre,
        visitorPhone: client.telefono,
        visitorEmail: '',
        casinoUsername: client.usuario,
        channel: 'web',
        status: 'bot',
        assignedAgent: null,
        labels: [],
      });
      chat = dataService.updateChat(chat.id, { state: 'options' }) || chat;

      const welcomeText = `¡Hola ${client.nombre}! 👋 Bienvenido a Casino 463. Elegí la opción que necesites:`;
      dataService.addChatMessage({
        chatId: chat.id,
        sender: 'bot',
        senderName: 'Casino 463',
        text: welcomeText,
        type: 'text',
      });

      if (io) {
        io.to('agents').emit('chat:updated', { chatId: chat.id });
      }
    }

    // Update client last activity
    dataService.updateClient(client.id, { lastActivity: new Date().toISOString() });

    // Track login activity
    const sessionId = require('uuid').v4();
    dataService.addActivity({ clientId: client.id, action: 'login', metadata: { source: 'widget', username }, sessionId });
    dataService.addActivity({ clientId: client.id, action: 'session_start', metadata: { source: 'widget' }, sessionId });

    res.json({
      success: true,
      chat: {
        id: chat.id,
        visitorName: chat.visitorName,
        casinoUsername: chat.casinoUsername,
        status: chat.status,
        state: chat.state || 'options',
      },
      client: {
        id: client.id,
        nombre: client.nombre,
        usuario: client.usuario,
        telefono: client.telefono,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error en el login' });
  }
});

// Auto-login: login by username only (used when 463.life iframe sends postMessage on login)
router.post('/widget/auto-login', (req: Request, res: Response) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, error: 'Usuario requerido' });
    }

    let client = dataService.getClientByCasinoUsername(username);

    // If client doesn't exist yet, auto-create from 463.life login
    // This happens when users are from a different caja or were created directly in 463.life
    if (!client) {
      console.log(`[AUTO-LOGIN] Client "${username}" not found in store, auto-creating...`);
      client = dataService.createClient({
        nombre: username,       // Use username as name until updated
        telefono: '',
        usuario: username,
        clave: '',              // No password needed for auto-login
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
      console.log(`[AUTO-LOGIN] Client "${username}" created with id: ${client.id}`);
    }

    if (client.estado === 'bloqueado') {
      return res.status(403).json({ success: false, error: 'Usuario bloqueado' });
    }

    // Find or create chat (same logic as normal login)
    const allChats = dataService.getChats({ archived: undefined });
    const clientChats = allChats
      .filter(c => c.clientId === client.id || c.casinoUsername?.toLowerCase() === username.toLowerCase())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let chat = clientChats[0] || null;
    const io = req.app.get('io');

    if (chat) {
      if (chat.status === 'resolved' || chat.archived) {
        chat = dataService.updateChat(chat.id, {
          status: 'bot',
          state: 'options',
          archived: false,
        }) || chat;

        const welcomeBack = `¡Hola de nuevo ${client.nombre}! 👋 ¿En qué podemos ayudarte?`;
        dataService.addChatMessage({
          chatId: chat.id,
          sender: 'bot',
          senderName: 'Casino 463',
          text: welcomeBack,
          type: 'text',
        });

        if (io) {
          io.to('agents').emit('chat:updated', { chatId: chat.id });
        }
      }

      if (chat.clientId !== client.id || chat.casinoUsername !== client.usuario) {
        chat = dataService.updateChat(chat.id, {
          clientId: client.id,
          casinoUsername: client.usuario,
          visitorName: client.nombre,
        }) || chat;
      }
    } else {
      chat = dataService.createChat({
        clientId: client.id,
        visitorName: client.nombre,
        visitorPhone: client.telefono,
        visitorEmail: '',
        casinoUsername: client.usuario,
        channel: 'web',
        status: 'bot',
        assignedAgent: null,
        labels: [],
      });
      chat = dataService.updateChat(chat.id, { state: 'options' }) || chat;

      const welcomeText = `¡Hola ${client.nombre}! 👋 Bienvenido a Casino 463. Elegí la opción que necesites:`;
      dataService.addChatMessage({
        chatId: chat.id,
        sender: 'bot',
        senderName: 'Casino 463',
        text: welcomeText,
        type: 'text',
      });

      if (io) {
        io.to('agents').emit('chat:updated', { chatId: chat.id });
      }
    }

    dataService.updateClient(client.id, { lastActivity: new Date().toISOString() });

    // Track auto-login activity
    const sessionId = require('uuid').v4();
    dataService.addActivity({ clientId: client.id, action: 'login', metadata: { source: 'auto-login', username }, sessionId });
    dataService.addActivity({ clientId: client.id, action: 'session_start', metadata: { source: 'auto-login' }, sessionId });

    res.json({
      success: true,
      chat: {
        id: chat.id,
        visitorName: chat.visitorName,
        casinoUsername: chat.casinoUsername,
        status: chat.status,
        state: chat.state || 'options',
      },
      client: {
        id: client.id,
        nombre: client.nombre,
        usuario: client.usuario,
        telefono: client.telefono,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error en auto-login' });
  }
});

// ── WIDGET ───────────────────────────────────

// Helper: send a bot message and emit via socket
function sendBotMessage(chatId: string, text: string, io: any): any {
  const msg = dataService.addChatMessage({
    chatId,
    sender: 'bot',
    senderName: 'Casino 463',
    text,
    type: 'text',
  });
  if (io) {
    io.to(`chat:${chatId}`).emit('message:new', msg);
    io.to('agents').emit('message:new', msg);
  }
  return msg;
}

// Helper: get auto-message text with variable replacement
function getAutoText(tipo: string, variables?: Record<string, string>): string | null {
  const autoMsgs = dataService.getAutoMessages();
  const template = autoMsgs.find(m => m.tipo === tipo);
  if (!template) return null;
  let text = template.mensaje;
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });
  }
  return text;
}

// Process automated flow based on chat state and visitor message
function processAutomation(chatId: string, text: string, io: any, messageType: string = 'text'): { botMessages: any[]; buttons: any[]; showOptions: boolean } {
  const chat = dataService.getChatById(chatId);
  if (!chat) return { botMessages: [], buttons: [], showOptions: false };

  const normalized = text.trim().toLowerCase();
  const botMessages: any[] = [];
  let newState = chat.state || 'options';
  let buttons: any[] = [];
  let showOptions = false;

  // If chat has an assigned agent (human), don't auto-respond
  if (chat.assignedAgent && chat.status === 'active') {
    return { botMessages: [], buttons: [], showOptions: false };
  }

  const accounts = dataService.getAccounts();
  const settings = dataService.getSettings();
  // Use Palta account data if mode is 'auto' (default) and connected, otherwise manual accounts
  const accountMode = settings.accountMode || 'auto';
  const paltaAccount = accountMode === 'auto' ? paltaService.getAccountInfo() : null;
  const primaryAccount = paltaAccount
    ? { cbu: paltaAccount.cvu, alias: paltaAccount.alias, titular: paltaAccount.titular, cuit: paltaAccount.cuit }
    : accounts.find(a => a.estatus === 'active') || accounts[0];

  // ── GLOBAL: "Volver" from any state resets to main menu ──
  const isBack = normalized === 'volver' || normalized === 'menu' || normalized === 'inicio' || normalized === 'cancelar' || normalized === '__volver__';
  if (isBack && chat.state && chat.state !== 'options' && chat.state !== 'welcome' && chat.state !== 'idle') {
    newState = 'options';
    botMessages.push(sendBotMessage(chatId, '↩️ Volviste al menú principal. ¿En qué te podemos ayudar?', io));
    showOptions = true;

    // Update state immediately
    dataService.updateChat(chatId, { state: 'options' });
    if (io) {
      io.to('agents').emit('chat:state-changed', { chatId, state: 'options' });
      io.to(`chat:${chatId}`).emit('chat:state-changed', { chatId, state: 'options' });
      io.to(`chat:${chatId}`).emit('chat:show-buttons', { chatId, buttons: [], showOptions: true });
    }
    return { botMessages, buttons: [], showOptions: true };
  }

  // ── STATE MACHINE ──
  if (!chat.state || chat.state === 'options' || chat.state === 'welcome' || chat.state === 'idle') {
    // Main menu selection
    if (normalized === 'depositar' || normalized === 'cargar' || normalized === 'carga') {
      newState = 'carga_cuenta';
      const autoText = getAutoText('cuenta');
      if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
      buttons = [
        { text: '📋 CBU', value: 'CBU' },
        { text: '📋 ALIAS', value: 'ALIAS' },
      ];

    } else if (normalized === 'retirar' || normalized === 'retiro' || normalized === 'cobrar') {
      newState = 'retiro_datos';
      // Show available balance message
      const autoText = getAutoText('retiro', { min_amount: String(settings.minRetiro || 3000) });
      if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));

    } else if (normalized === 'soporte' || normalized === 'ayuda' || normalized === 'problema') {
      newState = 'soporte';
      const autoText = getAutoText('soporte');
      if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));

    } else if (normalized === 'bonos' || normalized === 'cuponera' || normalized === 'cupon' || normalized === 'cupones') {
      newState = 'cuponera';
      const autoText = getAutoText('cuponera');
      if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));

    } else {
      // Unknown option - show options again
      const autoText = getAutoText('opciones');
      if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
      showOptions = true;
    }

  } else if (chat.state === 'carga_cuenta') {
    // Waiting for CBU or ALIAS selection
    if (normalized === 'cbu') {
      newState = 'carga_comprobante';
      if (primaryAccount && primaryAccount.cbu) {
        const autoText = getAutoText('cbu_selected', {
          cbu: primaryAccount.cbu,
          titular: primaryAccount.titular || '',
          cuit: (primaryAccount as any).cuit || '',
        });
        if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
        else botMessages.push(sendBotMessage(chatId, `📋 CBU: ${primaryAccount.cbu}\nTitular: ${primaryAccount.titular || '---'}\n\nEnviá el comprobante con todos los datos visibles 🧾`, io));
      } else {
        botMessages.push(sendBotMessage(chatId, '⚠️ No hay cuenta configurada. Contactá a soporte.', io));
      }

    } else if (normalized === 'alias') {
      newState = 'carga_comprobante';
      if (primaryAccount && primaryAccount.alias) {
        const autoText = getAutoText('alias_selected', {
          alias: primaryAccount.alias,
          titular: primaryAccount.titular || '',
        });
        if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
        else botMessages.push(sendBotMessage(chatId, `📋 ALIAS: ${primaryAccount.alias}\nTitular: ${primaryAccount.titular || '---'}\n\nEnviá el comprobante con todos los datos visibles 🧾`, io));
      } else {
        botMessages.push(sendBotMessage(chatId, '⚠️ No hay cuenta configurada. Contactá a soporte.', io));
      }

    } else {
      // Didn't understand - ask again
      botMessages.push(sendBotMessage(chatId, 'Por favor elegí una opción: CBU o ALIAS', io));
      buttons = [
        { text: '📋 CBU', value: 'CBU' },
        { text: '📋 ALIAS', value: 'ALIAS' },
      ];
    }

  } else if (chat.state === 'carga_comprobante') {
    // Only accept images as comprobante
    if (messageType !== 'image') {
      // Text message - ask for image
      botMessages.push(sendBotMessage(chatId, '📸 Por favor enviá una **foto del comprobante** de transferencia.\n\nUsá el botón 📎 para adjuntar la imagen.', io));
      // Don't change state - stay in carga_comprobante
    } else {
      // Image received - accept comprobante
      newState = 'carga_verificando';
      const autoText = getAutoText('after_image_deposit');
      if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
    }

  } else if (chat.state === 'carga_verificando') {
    // Still waiting for verification - tell them to wait
    botMessages.push(sendBotMessage(chatId, 'Tu comprobante está siendo revisado. Por favor aguardá un momento. 🙏', io));

  } else if (chat.state === 'retiro_datos') {
    // User is sending withdrawal details - acknowledge and wait for admin
    newState = 'retiro_procesando';
    botMessages.push(sendBotMessage(chatId, 'Recibimos tus datos de retiro ✅\n\nUn administrador procesará tu solicitud en breve.', io));

  } else if (chat.state === 'retiro_procesando') {
    botMessages.push(sendBotMessage(chatId, 'Tu retiro está siendo procesado. Por favor aguardá. 🙏', io));

  } else if (chat.state === 'soporte') {
    // In support mode - don't auto-respond, let agents handle
    // Just notify agents
    return { botMessages: [], buttons: [], showOptions: false };

  } else if (chat.state === 'cuponera') {
    // Coupon flow - acknowledge
    botMessages.push(sendBotMessage(chatId, 'Consultando cupones disponibles... Un agente te asistirá en breve. 🎁', io));

  } else {
    // Unknown state - don't respond
    return { botMessages: [], buttons: [], showOptions: false };
  }

  // Update chat state
  if (newState !== (chat.state || 'options')) {
    dataService.updateChat(chatId, { state: newState });
    if (io) {
      io.to('agents').emit('chat:state-changed', { chatId, state: newState });
      io.to(`chat:${chatId}`).emit('chat:state-changed', { chatId, state: newState });
    }
  }

  // Emit button display event to widget
  if (io) {
    io.to(`chat:${chatId}`).emit('chat:show-buttons', { chatId, buttons, showOptions });
  }

  return { botMessages, buttons, showOptions };
}

router.post('/widget/message', (req: Request, res: Response) => {
  try {
    const { chatId, text, visitorName } = req.body;

    // Create visitor message
    const visitorMsg = dataService.addChatMessage({
      chatId,
      sender: 'visitor',
      senderName: visitorName || 'Visitante',
      text,
      type: 'text',
    });

    // Track chat message activity
    const chat = dataService.getChatById(chatId);
    if (chat?.clientId) {
      dataService.addActivity({ clientId: chat.clientId, action: 'chat_message', metadata: { chatId, textLength: text.length }, sessionId: '' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to('agents').emit('message:new', visitorMsg);
      io.to('agents').emit('chat:updated', { chatId, message: visitorMsg });
    }

    // Process automation flow (text message)
    const automation = processAutomation(chatId, text, io, 'text');

    res.json({
      visitorMessage: visitorMsg,
      botMessages: automation.botMessages,
      buttons: automation.buttons,
      showOptions: automation.showOptions,
    });
  } catch (err) {
    res.status(500).json({ error: 'Error procesando mensaje' });
  }
});

// ── WIDGET IMAGE UPLOAD ──────────────────────────
router.post('/widget/upload', (req: Request, res: Response) => {
  try {
    const { chatId, image, visitorName } = req.body;

    if (!chatId || !image) {
      return res.status(400).json({ error: 'chatId e imagen requeridos' });
    }

    // Validate base64 image
    const matches = image.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Formato de imagen inválido' });
    }

    const ext = matches[1] === 'jpg' ? 'jpeg' : matches[1];
    const imgMimeType = `image/${ext}`;
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Check file size (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagen demasiado grande (máx 5MB)' });
    }

    // ── DUPLICATE COMPROBANTE DETECTION ──
    // Level 1: Exact image hash (catches identical re-uploads)
    const imageHash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
    const allPayments = dataService.getPayments() || [];
    const hashDuplicate = allPayments.find(
      p => p.imageHash === imageHash && p.imageHash !== '' && !p.imageHash.startsWith('ocr-')
        && (p.status === 'pending' || p.status === 'approved')
    );

    // Level 2: Same chat + recent upload (within 10 minutes) — catches re-uploads with slight re-compression
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentDuplicate = !hashDuplicate ? allPayments.find(
      p => p.chatId === chatId
        && (p.status === 'pending' || p.status === 'approved')
        && p.type === 'deposit'
        && p.createdAt > tenMinutesAgo
    ) : null;

    const existingPayment = hashDuplicate || recentDuplicate;
    if (existingPayment) {
      const reason = hashDuplicate ? 'hash match' : 'same chat within 10min';
      console.log(`[UPLOAD] ⚠️ Comprobante duplicado detectado (${reason}): payment #${existingPayment.id} (${existingPayment.status})`);
      const io = req.app.get('io');
      const dupMsg = dataService.addChatMessage({
        chatId,
        sender: 'bot',
        senderName: 'Casino 463',
        text: existingPayment.status === 'approved'
          ? '⚠️ Este comprobante ya fue procesado anteriormente. Si necesitás hacer otra carga, enviá un comprobante nuevo.\n\n¿En qué más podemos ayudarte?'
          : '⚠️ Este comprobante ya está siendo procesado. Por favor esperá a que se verifique.\n\n¿En qué más podemos ayudarte?',
        type: 'text',
      });
      // Reset chat state to options so user can navigate again
      dataService.updateChat(chatId, { state: 'options' });
      if (io) {
        io.to(`chat:${chatId}`).emit('message:new', dupMsg);
        io.to('agents').emit('message:new', dupMsg);
        io.to(`chat:${chatId}`).emit('chat:state-changed', { chatId, state: 'options' });
        io.to(`chat:${chatId}`).emit('chat:show-buttons', { chatId, buttons: [], showOptions: true });
        io.to('agents').emit('chat:state-changed', { chatId, state: 'options' });
      }
      return res.json({ visitorMessage: null, botMessages: [dupMsg], imageUrl: null, duplicate: true });
    }

    // Save file
    const filename = `comp-${chatId.substring(0, 8)}-${Date.now()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);

    const imageUrl = `/uploads/${filename}`;

    // Create image message
    const visitorMsg = dataService.addChatMessage({
      chatId,
      sender: 'visitor',
      senderName: visitorName || 'Visitante',
      text: imageUrl,
      type: 'image',
    });

    const io = req.app.get('io');
    if (io) {
      io.to('agents').emit('message:new', visitorMsg);
      io.to('agents').emit('chat:updated', { chatId, message: visitorMsg });
    }

    // Process automation (image type)
    const automation = processAutomation(chatId, imageUrl, io, 'image');

    res.json({
      visitorMessage: visitorMsg,
      botMessages: automation.botMessages,
      imageUrl,
    });

    // ── ASYNC: OCR + PALTA AUTO-VERIFY ──
    // Run after responding to the client (non-blocking)
    const chat = dataService.getChatById(chatId);
    console.log(`[OCR+Palta] Post-upload check: chatId=${chatId}, state=${chat?.state}, ocrConfigured=${ocrService.isConfigured()}`);
    if (chat && (chat.state === 'carga_verificando' || chat.state === 'carga_comprobante') && !ocrService.isConfigured()) {
      // OCR not configured — notify user and agents
      console.log(`[OCR+Palta] OCR no configurado (falta API key de OpenAI). Comprobante queda para revisión manual.`);
      const manualMsg = dataService.addChatMessage({
        chatId,
        sender: 'bot',
        senderName: 'Casino 463',
        text: '📋 Comprobante recibido. Un asistente lo revisará en breve.',
        type: 'text',
      });
      if (io) {
        io.to(`chat:${chatId}`).emit('message:new', manualMsg);
        io.to('agents').emit('message:new', manualMsg);
      }
    }
    if (chat && (chat.state === 'carga_verificando' || chat.state === 'carga_comprobante') && ocrService.isConfigured()) {
      (async () => {
        try {
          console.log(`[OCR+Palta] Iniciando análisis de comprobante para chat ${chatId}, imagen: ${imageUrl}`);

          // Step 1: OCR - extract data from comprobante (pass base64 directly to avoid file path issues)
          const ocrResult = await ocrService.analyzeComprobante(imageUrl, base64Data, imgMimeType);
          console.log(`[OCR+Palta] Resultado OCR: success=${ocrResult.success}, amount=${ocrResult.amount}, sender="${ocrResult.senderName}", error="${ocrResult.error || ''}"`);

          if (!ocrResult.success || !ocrResult.amount || !ocrResult.senderName) {
            console.log(`[OCR+Palta] OCR no pudo extraer datos suficientes: ${ocrResult.error || 'nombre o monto faltante'}`);

            // Notify user that manual review is needed
            const ocrFailMsg = dataService.addChatMessage({
              chatId,
              sender: 'bot',
              senderName: 'Casino 463',
              text: '📋 Recibimos tu comprobante. No pudimos leerlo automáticamente, un asistente lo revisará en breve.',
              type: 'text',
            });
            if (io) {
              io.to(`chat:${chatId}`).emit('message:new', ocrFailMsg);
              io.to('agents').emit('message:new', ocrFailMsg);
            }

            // Notify agents about OCR result
            if (io) {
              io.to('agents').emit('ocr:result', {
                chatId,
                success: false,
                error: ocrResult.error || 'No se pudo extraer nombre o monto',
                partial: ocrResult,
              });
            }
            return;
          }

          // Notify agents about successful OCR
          if (io) {
            io.to('agents').emit('ocr:result', {
              chatId,
              success: true,
              data: {
                senderName: ocrResult.senderName,
                amount: ocrResult.amount,
                date: ocrResult.date,
                cuit: ocrResult.cuit,
                bankName: ocrResult.bankName,
                confidence: ocrResult.confidence,
              },
            });
          }

          // Step 1.5: POST-OCR DUPLICATE CHECK — same sender + same amount + same transactionId = duplicate
          // If OCR extracted a transactionId (ID COELSA), use it to differentiate real transfers
          const existingPayments = dataService.getPayments() || [];
          const ocrDuplicate = existingPayments.find(
            p => p.chatId === chatId
              && p.type === 'deposit'
              && (p.status === 'pending' || p.status === 'approved')
              && Math.abs(p.amount - ocrResult.amount) < 0.01
              && p.comprobante?.extractedData?.senderName
              && p.comprobante.extractedData.senderName.toLowerCase() === ocrResult.senderName.toLowerCase()
              // If BOTH have a transactionId, they must match to be a duplicate
              // If either is missing transactionId, fall back to date comparison
              && (
                (ocrResult.transactionId && p.comprobante.extractedData.transactionId)
                  ? p.comprobante.extractedData.transactionId === ocrResult.transactionId
                  : (ocrResult.date && p.comprobante.extractedData.date)
                    ? p.comprobante.extractedData.date === ocrResult.date
                    : true // No distinguishing data — assume duplicate for safety
              )
          );
          if (ocrDuplicate) {
            console.log(`[OCR+Palta] ⚠️ Duplicado OCR detectado: mismo sender "${ocrResult.senderName}" + monto $${ocrResult.amount} ya existe en pago #${ocrDuplicate.id} (${ocrDuplicate.status})`);
            const dupMsg = dataService.addChatMessage({
              chatId,
              sender: 'bot',
              senderName: 'Casino 463',
              text: ocrDuplicate.status === 'approved'
                ? '⚠️ Este comprobante ya fue procesado anteriormente. Si necesitás hacer otra carga, enviá un comprobante diferente.\n\n¿En qué más podemos ayudarte?'
                : '⚠️ Este comprobante ya está siendo procesado. Por favor esperá a que se verifique.\n\n¿En qué más podemos ayudarte?',
              type: 'text',
            });
            // Reset chat state to options so user can navigate
            dataService.updateChat(chatId, { state: 'options' });
            if (io) {
              io.to(`chat:${chatId}`).emit('message:new', dupMsg);
              io.to('agents').emit('message:new', dupMsg);
              io.to(`chat:${chatId}`).emit('chat:state-changed', { chatId, state: 'options' });
              io.to(`chat:${chatId}`).emit('chat:show-buttons', { chatId, buttons: [], showOptions: true });
              io.to('agents').emit('chat:state-changed', { chatId, state: 'options' });
            }
            return; // Don't create duplicate payment
          }

          // Step 1.7: CVU DESTINATION CHECK — verify comprobante shows transfer TO our account
          let cvuWarning = '';
          if (ocrResult.receiverCbu) {
            const paltaAccount = paltaService.getAccountInfo();
            if (paltaAccount && paltaAccount.cvu) {
              const ocrCvu = ocrResult.receiverCbu.replace(/[\s\-\.]/g, '');
              const paltaCvu = paltaAccount.cvu.replace(/[\s\-\.]/g, '');
              if (ocrCvu !== paltaCvu) {
                cvuWarning = `⚠️ CVU destino del comprobante (${ocrCvu.substring(0, 8)}...) NO coincide con nuestra cuenta Palta (${paltaCvu.substring(0, 8)}...)`;
                console.log(`[OCR+Palta] 🚨 CVU MISMATCH: comprobante=${ocrCvu} vs palta=${paltaCvu}`);
              } else {
                console.log(`[OCR+Palta] ✅ CVU destino coincide con nuestra cuenta Palta`);
              }
            }
          }

          // Step 2: Create payment record with extracted data
          const clientId = chat.clientId || null;
          const payment = dataService.createPayment({
            chatId,
            clientId,
            type: 'deposit',
            amount: ocrResult.amount,
            currency: 'ARS',
            status: 'pending',
            comprobante: {
              imageUrl,
              extractedData: {
                transactionId: ocrResult.transactionId,
                amount: ocrResult.amount,
                senderName: ocrResult.senderName,
                cuit: ocrResult.cuit,
                bankName: ocrResult.bankName,
                date: ocrResult.date,
                time: ocrResult.time,
                receiverName: ocrResult.receiverName,
                receiverCbu: ocrResult.receiverCbu,
              },
              cvuWarning,
            },
            aiConfidence: ocrResult.confidence,
            aiAnalysis: `OCR: ${ocrResult.senderName} → ${ocrResult.receiverName || '?'} — $${ocrResult.amount} — ${ocrResult.bankName} — ${ocrResult.date} ${ocrResult.time}${cvuWarning ? ' — ' + cvuWarning : ''}`,
            processedBy: null,
            rejectionReason: '',
            imageHash,
            bankAccount: ocrResult.bankName,
          });

          // Update chat pending payments
          dataService.updateChat(chatId, {
            pendingPayments: (chat.pendingPayments || 0) + 1,
          });

          if (io) {
            io.to('agents').emit('payment:new', payment);
          }

          console.log(`[OCR+Palta] Payment #${payment.id} creado: $${ocrResult.amount} de "${ocrResult.senderName}" → "${ocrResult.receiverName || '?'}"`);

          // Alert admins if CVU doesn't match (possible fraud)
          if (cvuWarning && io) {
            io.to('agents').emit('fraud:alert', {
              paymentId: payment.id,
              chatId,
              type: 'cvu_mismatch',
              message: cvuWarning,
              ocrData: { senderName: ocrResult.senderName, amount: ocrResult.amount, receiverCbu: ocrResult.receiverCbu },
            });
          }

          // Step 3: Verify with Palta Wallet
          const paltaConfig = dataService.getPaltaConfig();
          if (paltaConfig.status === 'running' && paltaConfig.autoApprove) {
            console.log(`[OCR+Palta] Buscando en Palta: "${ocrResult.senderName}" por $${ocrResult.amount}...`);

            // Trigger a fresh poll from Palta
            const pollResult = await paltaService.poll();
            console.log(`[OCR+Palta] Poll: ${pollResult.newTransactions} nuevas, ${pollResult.matches} matches`);

            // Check if our payment was matched
            const updatedPayment = dataService.getPaymentById(payment.id);
            if (updatedPayment && updatedPayment.status === 'approved') {
              console.log(`[OCR+Palta] ✅ Payment #${payment.id} auto-aprobado vía Palta!`);
            } else {
              // Try direct match with unmatched Palta transactions
              const unmatchedTxs = dataService.getUnmatchedPaltaTransactions();
              const ocrNameParts = ocrResult.senderName.toLowerCase().split(/\s+/).filter(p => p.length > 2);
              const directMatch = unmatchedTxs.find(tx => {
                // Amount must match within $1 tolerance (OCR can be slightly off)
                if (Math.abs(tx.amount - ocrResult.amount) > 1) return false;
                // Name: at least one name part must appear in Palta counterparty (handles order differences)
                const paltaName = (tx.counterpartyName || '').toLowerCase();
                const nameMatch = ocrNameParts.some(part => paltaName.includes(part));
                if (nameMatch) console.log(`[OCR+Palta] Name match: OCR="${ocrResult.senderName}" ↔ Palta="${tx.counterpartyName}" (amount: $${tx.amount})`);
                return nameMatch;
              });

              if (directMatch) {
                console.log(`[OCR+Palta] Match directo encontrado: ${directMatch.counterpartyName} $${directMatch.amount}`);
                await paltaService.autoApprovePayment(payment.id, directMatch.paltaId);
                dataService.updatePaltaTransaction(directMatch.id, {
                  matched: true,
                  matchedPaymentId: payment.id,
                  autoApproved: true,
                });
              } else {
                console.log(`[OCR+Palta] No se encontró match en Palta. Queda pendiente para revisión manual.`);

                // Send waiting message
                const waitMsg = dataService.addChatMessage({
                  chatId,
                  sender: 'bot',
                  senderName: 'Casino 463',
                  text: `📋 Recibimos tu comprobante por $${ocrResult.amount.toLocaleString('es-AR')}. Estamos verificando la transferencia. Te avisamos en unos minutos. 🔍`,
                  type: 'text',
                });
                if (io) {
                  io.to(`chat:${chatId}`).emit('message:new', waitMsg);
                  io.to('agents').emit('message:new', waitMsg);
                }
              }
            }
          } else {
            console.log(`[OCR+Palta] Palta no está activo o auto-approve desactivado. Payment queda pendiente.`);
            // Notify user that payment is pending manual review
            const pendingMsg = dataService.addChatMessage({
              chatId,
              sender: 'bot',
              senderName: 'Casino 463',
              text: `📋 Recibimos tu comprobante por $${ocrResult.amount.toLocaleString('es-AR')}. Un asistente verificará tu transferencia en breve.`,
              type: 'text',
            });
            if (io) {
              io.to(`chat:${chatId}`).emit('message:new', pendingMsg);
              io.to('agents').emit('message:new', pendingMsg);
            }
          }
        } catch (err: any) {
          console.error(`[OCR+Palta] Error en flujo async:`, err.message);
          // Notify user about the error so they don't wait forever
          try {
            const errMsg = dataService.addChatMessage({
              chatId,
              sender: 'bot',
              senderName: 'Casino 463',
              text: '⚠️ Hubo un problema procesando tu comprobante. Un asistente lo revisará manualmente.',
              type: 'text',
            });
            if (io) {
              io.to(`chat:${chatId}`).emit('message:new', errMsg);
              io.to('agents').emit('message:new', errMsg);
            }
          } catch (_) { /* prevent double-error */ }
        }
      })();
    }
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Error subiendo imagen' });
  }
});

// ── CHAT AUTOMATION ─────────────────────────────
// Update chat state (automation flow)
router.put('/chats/:id/state', (req: Request, res: Response) => {
  const { state } = req.body;
  const validStates = ['welcome', 'options', 'carga_cuenta', 'carga_comprobante', 'carga_verificando', 'carga_nombre', 'carga_cuit', 'retiro_datos', 'retiro_procesando', 'soporte', 'cuponera', 'idle'];
  if (!validStates.includes(state)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const chat = dataService.updateChat(req.params.id, { state });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  const io = req.app.get('io');
  if (io) io.to('agents').emit('chat:state-changed', { chatId: req.params.id, state });
  res.json(chat);
});

// Enable options (re-show options menu to client)
router.post('/chats/:id/enable-options', (req: Request, res: Response) => {
  const chat = dataService.updateChat(req.params.id, {
    state: 'options',
    showOptionButtons: true,
    showUploadButton: false,
  });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  const io = req.app.get('io');

  // Send the opciones auto-message
  const autoMsgs = dataService.getAutoMessages();
  const opcionesMsg = autoMsgs.find(m => m.tipo === 'opciones');
  if (opcionesMsg) {
    const botMsg = dataService.addChatMessage({
      chatId: req.params.id,
      sender: 'bot',
      senderName: 'Casino 463',
      text: opcionesMsg.mensaje,
      type: 'text',
    });
    if (io) {
      io.to(`chat:${req.params.id}`).emit('message:new', botMsg);
      io.to('agents').emit('message:new', botMsg);
    }
  }

  // Emit state change so widget shows the buttons
  if (io) {
    io.to(`chat:${req.params.id}`).emit('chat:state-changed', { chatId: req.params.id, state: 'options' });
    io.to('agents').emit('chat:updated', { chatId: req.params.id });
  }
  res.json(chat);
});

// Update chat tags
router.put('/chats/:id/tags', (req: Request, res: Response) => {
  const { tags } = req.body;
  const chat = dataService.updateChat(req.params.id, { tags: tags || [] });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  const io = req.app.get('io');
  if (io) io.to('agents').emit('chat:updated', { chatId: req.params.id });
  res.json(chat);
});

// Update chat note
router.put('/chats/:id/nota', (req: Request, res: Response) => {
  const { nota } = req.body;
  const chat = dataService.updateChat(req.params.id, { nota: nota || '' });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  res.json(chat);
});

// Get chat payments
router.get('/chats/:id/payments', (req: Request, res: Response) => {
  const payments = dataService.getPaymentsByChat(req.params.id);
  res.json(payments);
});

// Send auto-message to chat
router.post('/chats/:id/auto-message', (req: Request, res: Response) => {
  const { tipo, variables } = req.body;
  const autoMsgs = dataService.getAutoMessages();
  const template = autoMsgs.find(m => m.tipo === tipo);
  if (!template) return res.status(404).json({ error: `Mensaje automático '${tipo}' no encontrado` });

  // Replace variables in template
  let text = template.mensaje;
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });
  }

  const botMsg = dataService.addChatMessage({
    chatId: req.params.id,
    sender: 'bot',
    senderName: 'Casino 463',
    text,
    type: 'text',
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`chat:${req.params.id}`).emit('message:new', botMsg);
    io.to('agents').emit('message:new', botMsg);
    io.to('agents').emit('chat:updated', { chatId: req.params.id });
  }
  res.json(botMsg);
});

// Transfer to admin (escalate)
router.post('/chats/:id/transfer', (req: Request, res: Response) => {
  const { adminId } = req.body;
  const chat = dataService.updateChat(req.params.id, {
    assignedAgent: adminId || null,
    status: 'waiting',
    state: 'soporte',
  });
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

  // Send transfer message
  const autoMsgs = dataService.getAutoMessages();
  const transferMsg = autoMsgs.find(m => m.tipo === 'admin_transfer');
  if (transferMsg) {
    const botMsg = dataService.addChatMessage({
      chatId: req.params.id,
      sender: 'bot',
      senderName: 'Casino 463',
      text: transferMsg.mensaje,
      type: 'text',
    });
    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${req.params.id}`).emit('message:new', botMsg);
      io.to('agents').emit('message:new', botMsg);
    }
  }

  const io = req.app.get('io');
  if (io) io.to('agents').emit('chat:updated', { chatId: req.params.id });
  res.json(chat);
});

// ── LABELS ───────────────────────────────────
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

// ── STATS ────────────────────────────────────
router.get('/stats', (_req: Request, res: Response) => {
  res.json(dataService.getStats());
});

export default router;
