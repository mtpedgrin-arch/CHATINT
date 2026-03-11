import { Router, Request, Response } from 'express';
import { dataService } from '../services/data.service';
import { ocrService } from '../services/ocr.service';
import { paltaService } from '../services/palta.service';
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
  // Use Palta account data if mode is 'auto' and connected, otherwise manual accounts
  const paltaAccount = settings.accountMode === 'auto' ? paltaService.getAccountInfo() : null;
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
      if (primaryAccount) {
        const autoText = getAutoText('cbu_selected', {
          cbu: primaryAccount.cbu || '',
          titular: primaryAccount.titular || '',
          cuit: (primaryAccount as any).cuit || '',
        });
        if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
      }

    } else if (normalized === 'alias') {
      newState = 'carga_comprobante';
      if (primaryAccount) {
        const autoText = getAutoText('alias_selected', {
          alias: primaryAccount.alias || '',
          titular: primaryAccount.titular || '',
        });
        if (autoText) botMessages.push(sendBotMessage(chatId, autoText, io));
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
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Check file size (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagen demasiado grande (máx 5MB)' });
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
          console.log(`[OCR+Palta] Iniciando análisis de comprobante para chat ${chatId}`);

          // Step 1: OCR - extract data from comprobante
          const ocrResult = await ocrService.analyzeComprobante(imageUrl);

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
              },
            },
            aiConfidence: ocrResult.confidence,
            aiAnalysis: `OCR: ${ocrResult.senderName} — $${ocrResult.amount} — ${ocrResult.bankName} — ${ocrResult.date}`,
            processedBy: null,
            rejectionReason: '',
            imageHash: `ocr-${Date.now()}`,
            bankAccount: ocrResult.bankName,
          });

          // Update chat pending payments
          dataService.updateChat(chatId, {
            pendingPayments: (chat.pendingPayments || 0) + 1,
          });

          if (io) {
            io.to('agents').emit('payment:new', payment);
          }

          console.log(`[OCR+Palta] Payment #${payment.id} creado: $${ocrResult.amount} de "${ocrResult.senderName}"`);

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
              const directMatch = unmatchedTxs.find(tx =>
                Math.abs(tx.amount - ocrResult.amount) < 0.01 &&
                tx.counterpartyName.toLowerCase().includes(ocrResult.senderName.split(' ')[0].toLowerCase())
              );

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
