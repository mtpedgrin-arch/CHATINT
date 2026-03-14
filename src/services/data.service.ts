import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_PATH = path.join(DATA_DIR, 'store.json');
const TEMPLATE_PATH = path.join(DATA_DIR, 'store.template.json');

export interface User {
  id: number;
  nombre: string;
  apellido: string;
  usuario: string;
  email: string;
  password: string;
  rol: 'admin' | 'operador' | 'viewer';
  estatus: 'active' | 'inactive';
  inicio: string | null;
  fin: string | null;
  restriccion: string;
  createdAt: string;
}

export interface Client {
  id: number;
  nombre: string;
  telefono: string;
  usuario: string;
  clave: string;
  cuit: string;
  balance: number;
  wager: number;
  saldoCobrable: number;
  estado: 'activo' | 'inactivo' | 'bloqueado';
  vip: boolean;
  totalDepositos: number;
  totalRetiros: number;
  labels: number[];
  createdAt: string;
  lastActivity: string;
}

export interface Command {
  id: number;
  nombre: string;
  comando: string;
  mensaje: string;
  estatus: 'active' | 'inactive';
}

export interface AutoMessage {
  id: number;
  tipo: string;
  mensaje: string;
  categoria: 'bienvenida' | 'carga' | 'retiro' | 'soporte' | 'cuponera' | 'error' | 'manual' | 'general';
}

export interface Payment {
  id: number;
  chatId: string;
  clientId: number | null;
  type: 'deposit' | 'withdrawal';
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'verified' | 'approved' | 'rejected' | 'failed';
  comprobante: {
    imageUrl: string;
    extractedData: {
      transactionId: string;
      amount: number;
      senderName: string;
      cuit: string;
      bankName: string;
      date: string;
      time?: string;
      receiverName?: string;
      receiverCbu?: string;
    } | null;
    cvuWarning?: string;
  } | null;
  aiConfidence: number;
  aiAnalysis: string;
  processedBy: string | null;
  rejectionReason: string;
  imageHash: string;
  bankAccount: string;
  createdAt: string;
  processedAt: string | null;
}

export interface ModalConfig {
  active: boolean;
  hora: string;
  duracion: number;
  mensaje: string;
  botonTexto: string;
}

export interface ButtonOption {
  type: 'link' | 'option';
  link: string;
  enabled?: boolean;
}

export interface ButtonOptions {
  carga: ButtonOption;
  retiro: ButtonOption;
  soporte: ButtonOption;
  cuponera: ButtonOption;
}

export interface ApiConfig {
  casino: { token: string; url: string; user: string; password: string; cajaId: string };
  aws: { accessKey: string; secretKey: string; region: string };
  openrouter: { apiKey: string; model: string };
  openai: { apiKey: string; model: string };
}

export interface Account {
  id: number;
  tipo: 'palta' | 'manual';
  alias: string;
  cbu: string;
  titular: string;
  banco: string;
  cuit: string;
  email: string;
  password: string;
  estatus: 'active' | 'inactive';
  createdAt: string;
}

export interface Settings {
  siteName: string;
  siteUrl: string;
  chatMode: 'auto' | 'manual';
  accountMode: 'auto' | 'manual';
  minRetiro: number;
  minDeposito: number;
  bonoBienvenida: string;
  timezone: string;
  buttonOptions: ButtonOptions;
  modalConfig: ModalConfig;
}

export interface Label {
  id: number;
  nombre: string;
  color: string;
}

export interface Chat {
  id: string;
  clientId: number | null;
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  casinoUsername: string;
  channel: 'whatsapp' | 'web' | 'telegram';
  status: 'bot' | 'waiting' | 'active' | 'resolved';
  assignedAgent: string | null;
  labels: number[];
  unread: number;
  archived: boolean;
  state: 'welcome' | 'options' | 'carga_cuenta' | 'carga_comprobante' | 'carga_verificando' | 'carga_nombre' | 'carga_cuit' | 'retiro_datos' | 'retiro_procesando' | 'soporte' | 'cuponera' | 'idle';
  tags: string[];
  pendingPayments: number;
  showOptionButtons: boolean;
  showUploadButton: boolean;
  depositAttempts: number;
  nota: string;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  sender: 'visitor' | 'agent' | 'bot' | 'system';
  senderName: string;
  text: string;
  type: 'text' | 'image' | 'file';
  timestamp: string;
  metadata?: {
    paymentId?: number;
    autoMessageType?: string;
    extractedData?: Record<string, any>;
    buttons?: { label: string; action: string }[];
  };
}

export interface PushSubscriptionRecord {
  id: string;
  clientId: number | null;
  chatId: string | null;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  createdAt: string;
}

export interface SentNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  target: string;
  targetValue: string;
  sentBy: string;
  sentAt: string;
  deliveredCount: number;
  failedCount: number;
}

export interface PopupMessage {
  id: string;
  title: string;
  body: string;
  imageUrl: string;
  buttonText: string;
  buttonUrl: string;
  target: string;
  targetValue: string;
  sentBy: string;
  sentAt: string;
}

export interface PopupTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  imageUrl: string;
  buttonText: string;
  buttonAction: 'open_chat' | 'link' | 'close';
  buttonUrl: string;
  createdAt: string;
}

export interface CasinoEvent {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  minDeposit: number;
  prizeAmount: number;
  prizeDescription: string;
  status: 'draft' | 'active' | 'ended' | 'drawn' | 'claimed';
  startedAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  createdBy: string;
  createdAt: string;
  winnerId: string | null;
  winnerClientId: number | null;
  winnerClaimed: boolean;
  drawnAt: string | null;
}

export interface EventEntry {
  id: string;
  eventId: string;
  clientId: number;
  clientName: string;
  chatId: string;
  depositPaymentId: number | null;
  depositAmount: number;
  joinedAt: string;
  qualified: boolean;
  qualifiedAt: string | null;
}

export interface Quiz {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  prizeAmount: number;
  timeLimit: number;
  status: 'draft' | 'active' | 'ended';
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  createdBy: string;
  totalAnswers: number;
  correctAnswers: number;
}

export interface QuizAnswer {
  id: string;
  quizId: string;
  clientId: number;
  clientName: string;
  selectedIndex: number;
  correct: boolean;
  answeredAt: string;
  timeMs: number;
}

export interface ScratchCard {
  id: string;
  name: string;
  prizes: ScratchPrize[];
  status: 'draft' | 'active' | 'ended';
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  createdBy: string;
  totalPlayed: number;
  totalWinners: number;
  totalPrizeGiven: number;
}

export interface ScratchPrize {
  label: string;
  amount: number;
  probability: number; // 0-100
  emoji: string;
}

export interface ScratchPlay {
  id: string;
  scratchCardId: string;
  clientId: number;
  clientName: string;
  won: boolean;
  prizeLabel: string;
  prizeAmount: number;
  playedAt: string;
}

export interface Roulette {
  id: string;
  name: string;
  segments: RouletteSegment[];
  mode: 'manual' | 'daily' | 'deposit';
  minDeposit: number;
  status: 'draft' | 'active' | 'ended';
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  totalSpins: number;
  totalPrizeGiven: number;
}

export interface RouletteSegment {
  label: string;
  amount: number;
  probability: number;
  color: string;
  emoji: string;
}

export interface RouletteSpin {
  id: string;
  rouletteId: string;
  clientId: number;
  clientName: string;
  won: boolean;
  prizeLabel: string;
  prizeAmount: number;
  segmentIndex: number;
  spunAt: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  emoji: string;
  type: 'deposit_count' | 'deposit_amount' | 'login_streak' | 'play_time' | 'invite' | 'custom';
  target: number;
  rewardAmount: number;
  rewardType: 'fichas' | 'spin' | 'scratch';
  period: 'daily' | 'weekly' | 'permanent';
  enabled: boolean;
  createdAt: string;
}

export interface MissionProgress {
  id: string;
  missionId: string;
  clientId: number;
  clientName: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  startedAt: string;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface ActivityFeedItem {
  id: string;
  type: 'scratch_win' | 'quiz_win' | 'roulette_win' | 'sorteo_win' | 'mission_complete' | 'big_deposit' | 'big_win';
  clientName: string;
  message: string;
  amount: number;
  emoji: string;
  timestamp: string;
}

export interface ActivityLog {
  id: string;
  clientId: number;
  action: 'login' | 'deposit' | 'withdrawal' | 'chat_message' | 'event_join' | 'payment_approved' | 'payment_rejected' | 'session_start' | 'session_end';
  metadata: Record<string, any>;
  timestamp: string;
  sessionId: string;
}

export interface DailyAggregate {
  date: string; // YYYY-MM-DD
  dau: number;
  totalLogins: number;
  totalDeposits: number;
  totalWithdrawals: number;
  depositAmount: number;
  withdrawalAmount: number;
  totalMessages: number;
  newClients: number;
  activeClientIds: number[];
}

export interface PushTrackingEvent {
  id: string;
  clientId: number | null;
  chatId: string | null;
  event: 'banner_shown' | 'accepted' | 'declined' | 'dismissed' | 'denied_by_browser' | 'pwa_installed' | 'pwa_dismissed';
  userAgent: string;
  timestamp: string;
}

export interface PaltaTransaction {
  id: string;
  paltaId: string;
  counterpartyName: string;
  counterpartyCuit: string;
  counterpartyCvu: string;
  amount: number;
  transactionCode: string;
  createdAt: string;
  capturedAt: string;
  matched: boolean;
  matchedPaymentId: number | null;
  autoApproved: boolean;
}

export interface PaltaConfig {
  email: string;
  password: string;
  enabled: boolean;
  pollIntervalSeconds: number;
  autoApprove: boolean;
  headless: boolean;
  lastPollAt: string | null;
  status: 'stopped' | 'running' | 'login_required' | 'logging_in' | 'error';
  errorMessage: string;
}

export interface Store {
  users: User[];
  clients: Client[];
  commands: Command[];
  autoMessages: AutoMessage[];
  apiConfig: ApiConfig;
  accounts: Account[];
  settings: Settings;
  chats: Chat[];
  chatMessages: Record<string, ChatMessage[]>;
  payments: Payment[];
  labels: Label[];
  pushSubscriptions: PushSubscriptionRecord[];
  sentNotifications: SentNotification[];
  popupMessages: PopupMessage[];
  popupTemplates: PopupTemplate[];
  events: CasinoEvent[];
  eventEntries: EventEntry[];
  quizzes: Quiz[];
  quizAnswers: QuizAnswer[];
  scratchCards: ScratchCard[];
  scratchPlays: ScratchPlay[];
  roulettes: Roulette[];
  rouletteSpins: RouletteSpin[];
  missions: Mission[];
  missionProgress: MissionProgress[];
  activityFeed: ActivityFeedItem[];
  activityLogs: ActivityLog[];
  dailyAggregates: DailyAggregate[];
  paltaTransactions: PaltaTransaction[];
  paltaConfig: PaltaConfig;
  pushTrackingEvents: PushTrackingEvent[];
}

class DataService {
  private store: Store;

  constructor() {
    this.store = this.load();
  }

  private load(): Store {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // If store.json doesn't exist, create it from template or empty
    if (!fs.existsSync(DATA_PATH)) {
      console.log('[DataService] store.json not found, initializing...');
      if (fs.existsSync(TEMPLATE_PATH)) {
        console.log('[DataService] Copying from store.template.json');
        fs.copyFileSync(TEMPLATE_PATH, DATA_PATH);
      } else {
        console.log('[DataService] Creating empty store.json');
        const empty: Store = {
          users: [{
            id: 1, nombre: 'Admin', apellido: '', usuario: 'admin',
            email: 'admin@gana463.com',
            password: '$2a$10$0AG3JgDxN.Kbsrm0mDVG1.lUjO/CuDZQnZA0lHOElRv.BIcRdUQkC', // 123456
            rol: 'admin', estatus: 'active', inicio: null, fin: null,
            restriccion: '', createdAt: new Date().toISOString(),
          }],
          clients: [], commands: [], autoMessages: [],
          apiConfig: {
            casino: { token: '', url: '', user: '', password: '', cajaId: '' },
            aws: { accessKey: '', secretKey: '', region: '' },
            openrouter: { apiKey: '', model: '' },
            openai: { apiKey: '', model: 'gpt-4o-mini' },
          },
          accounts: [],
          settings: { siteName: 'Casino 463', siteUrl: '', chatMode: 'auto' as const, accountMode: 'auto' as const, minRetiro: 0, minDeposito: 0, bonoBienvenida: '', timezone: 'America/Argentina/Buenos_Aires', buttonOptions: { carga: { type: 'option' as const, link: '', enabled: true }, retiro: { type: 'option' as const, link: '', enabled: true }, soporte: { type: 'option' as const, link: '', enabled: true }, cuponera: { type: 'link' as const, link: 'https://463.life', enabled: true } }, modalConfig: {} as any },
          chats: [], chatMessages: {}, payments: [], labels: [],
          pushSubscriptions: [], sentNotifications: [],
          popupMessages: [], popupTemplates: [],
          events: [], eventEntries: [],
          quizzes: [], quizAnswers: [],
          scratchCards: [], scratchPlays: [],
          roulettes: [], rouletteSpins: [],
          missions: [], missionProgress: [],
          activityFeed: [],
          activityLogs: [], dailyAggregates: [],
          paltaTransactions: [],
          paltaConfig: { email: '', password: '', enabled: false, pollIntervalSeconds: 60, autoApprove: true, headless: true, lastPollAt: null, status: 'stopped' as const, errorMessage: '' },
          pushTrackingEvents: [],
        };
        fs.writeFileSync(DATA_PATH, JSON.stringify(empty, null, 2));
      }
    }

    try {
      const raw = fs.readFileSync(DATA_PATH, 'utf-8');
      const data = JSON.parse(raw);
      // Backward compatibility for new collections
      if (!data.autoMessages || data.autoMessages.length === 0) {
        // Load default auto messages from template if available
        try {
          if (fs.existsSync(TEMPLATE_PATH)) {
            const tpl = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf-8'));
            data.autoMessages = tpl.autoMessages || [];
            console.log(`[DataService] Loaded ${data.autoMessages.length} default auto messages from template`);
          } else {
            data.autoMessages = [];
          }
        } catch { data.autoMessages = []; }
      }
      if (!data.pushSubscriptions) data.pushSubscriptions = [];
      if (!data.sentNotifications) data.sentNotifications = [];
      if (!data.popupMessages) data.popupMessages = [];
      if (!data.popupTemplates) data.popupTemplates = [];
      if (!data.events) data.events = [];
      if (!data.eventEntries) data.eventEntries = [];
      if (!data.activityLogs) data.activityLogs = [];
      if (!data.dailyAggregates) data.dailyAggregates = [];
      if (!data.paltaTransactions) data.paltaTransactions = [];
      if (!data.pushTrackingEvents) data.pushTrackingEvents = [];
      if (!data.roulettes) data.roulettes = [];
      if (!data.rouletteSpins) data.rouletteSpins = [];
      if (!data.scratchCards) data.scratchCards = [];
      if (!data.scratchPlays) data.scratchPlays = [];
      if (!data.missions) data.missions = [];
      if (!data.missionProgress) data.missionProgress = [];
      if (!data.activityFeed) data.activityFeed = [];
      if (!data.paltaConfig) data.paltaConfig = {
        email: '', password: '', enabled: false,
        pollIntervalSeconds: 60, autoApprove: true,
        lastPollAt: null, status: 'stopped', errorMessage: '',
      };
      // Ensure apiConfig.openai exists (backward compat)
      if (data.apiConfig && !data.apiConfig.openai) {
        data.apiConfig.openai = { apiKey: '', model: 'gpt-4o-mini' };
      }

      // Migrate telepagosAI → accountMode
      if (data.settings && !data.settings.accountMode) {
        data.settings.accountMode = (data.settings as any).telepagosAI ? 'auto' : 'auto';
        delete (data.settings as any).telepagosAI;
      }

      // Fix: ensure admin users have a valid bcrypt hash for "123456"
      // This fixes deploys where the hash was incorrectly generated
      const VALID_HASH = '$2a$10$0AG3JgDxN.Kbsrm0mDVG1.lUjO/CuDZQnZA0lHOElRv.BIcRdUQkC';
      let passwordFixed = false;
      if (data.users) {
        for (const user of data.users) {
          if (user.password && user.password !== VALID_HASH && !user.password.startsWith('$2a$10$0AG3Jg')) {
            // Check if password looks like one of the old invalid hashes
            if (user.password.includes('aFFuBiSU') || user.password.includes('8KxGfMVB') || user.password.includes('32Ezthhw')) {
              console.log(`[DataService] Fixing invalid password hash for user: ${user.email}`);
              user.password = VALID_HASH;
              passwordFixed = true;
            }
          }
        }
        if (passwordFixed) {
          fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
          console.log('[DataService] Password hashes fixed and saved');
        }
      }

      return data;
    } catch {
      throw new Error('Could not load store.json');
    }
  }

  save(): void {
    fs.writeFileSync(DATA_PATH, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  // ── USERS ──────────────────────────────────
  getUsers(): User[] { return this.store.users; }
  getUserById(id: number): User | undefined { return this.store.users.find(u => u.id === id); }
  getUserByEmail(email: string): User | undefined { return this.store.users.find(u => u.email === email); }
  getUserByUsername(usuario: string): User | undefined { return this.store.users.find(u => u.usuario === usuario); }

  createUser(data: Omit<User, 'id' | 'createdAt'>): User {
    const id = this.store.users.length > 0 ? Math.max(...this.store.users.map(u => u.id)) + 1 : 1;
    const user: User = { ...data, id, createdAt: new Date().toISOString() };
    this.store.users.push(user);
    this.save();
    return user;
  }

  updateUser(id: number, data: Partial<User>): User | null {
    const idx = this.store.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    this.store.users[idx] = { ...this.store.users[idx], ...data };
    this.save();
    return this.store.users[idx];
  }

  deleteUser(id: number): boolean {
    const idx = this.store.users.findIndex(u => u.id === id);
    if (idx === -1) return false;
    this.store.users.splice(idx, 1);
    this.save();
    return true;
  }

  // ── CLIENTS ────────────────────────────────
  getClients(): Client[] { return this.store.clients; }
  getClientById(id: number): Client | undefined { return this.store.clients.find(c => c.id === id); }

  createClient(data: Omit<Client, 'id' | 'createdAt' | 'lastActivity'>): Client {
    const id = this.store.clients.length > 0 ? Math.max(...this.store.clients.map(c => c.id)) + 1 : 1;
    const now = new Date().toISOString();
    const client: Client = { ...data, id, createdAt: now, lastActivity: now };
    this.store.clients.push(client);
    this.save();
    return client;
  }

  updateClient(id: number, data: Partial<Client>): Client | null {
    const idx = this.store.clients.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.store.clients[idx] = { ...this.store.clients[idx], ...data, lastActivity: new Date().toISOString() };
    this.save();
    return this.store.clients[idx];
  }

  deleteClient(id: number): boolean {
    const idx = this.store.clients.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.store.clients.splice(idx, 1);
    this.save();
    return true;
  }

  getClientByCasinoUsername(username: string): Client | undefined {
    return this.store.clients.find(c => c.usuario.toLowerCase() === username.toLowerCase());
  }

  // ── COMMANDS ───────────────────────────────
  getCommands(): Command[] { return this.store.commands; }

  createCommand(data: Omit<Command, 'id'>): Command {
    const id = this.store.commands.length > 0 ? Math.max(...this.store.commands.map(c => c.id)) + 1 : 1;
    const cmd: Command = { ...data, id };
    this.store.commands.push(cmd);
    this.save();
    return cmd;
  }

  updateCommand(id: number, data: Partial<Command>): Command | null {
    const idx = this.store.commands.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.store.commands[idx] = { ...this.store.commands[idx], ...data };
    this.save();
    return this.store.commands[idx];
  }

  deleteCommand(id: number): boolean {
    const idx = this.store.commands.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.store.commands.splice(idx, 1);
    this.save();
    return true;
  }

  // ── AUTO MESSAGES ──────────────────────────
  getAutoMessages(): AutoMessage[] { return this.store.autoMessages; }

  createAutoMessage(data: Omit<AutoMessage, 'id'>): AutoMessage {
    const id = this.store.autoMessages.length > 0 ? Math.max(...this.store.autoMessages.map(m => m.id)) + 1 : 1;
    const msg: AutoMessage = { ...data, id };
    this.store.autoMessages.push(msg);
    this.save();
    return msg;
  }

  updateAutoMessage(id: number, data: Partial<AutoMessage>): AutoMessage | null {
    const idx = this.store.autoMessages.findIndex(m => m.id === id);
    if (idx === -1) return null;
    this.store.autoMessages[idx] = { ...this.store.autoMessages[idx], ...data };
    this.save();
    return this.store.autoMessages[idx];
  }

  deleteAutoMessage(id: number): boolean {
    const idx = this.store.autoMessages.findIndex(m => m.id === id);
    if (idx === -1) return false;
    this.store.autoMessages.splice(idx, 1);
    this.save();
    return true;
  }

  // ── API CONFIG ─────────────────────────────
  getApiConfig(): ApiConfig { return this.store.apiConfig; }

  updateApiConfig(section: keyof ApiConfig, data: Record<string, string>): ApiConfig {
    this.store.apiConfig[section] = { ...this.store.apiConfig[section], ...data } as any;
    this.save();
    return this.store.apiConfig;
  }

  // ── ACCOUNTS ───────────────────────────────
  getAccounts(): Account[] { return this.store.accounts; }

  createAccount(data: Omit<Account, 'id' | 'createdAt'>): Account {
    const id = this.store.accounts.length > 0 ? Math.max(...this.store.accounts.map(a => a.id)) + 1 : 1;
    const acc: Account = { ...data, id, createdAt: new Date().toISOString() };
    this.store.accounts.push(acc);
    this.save();
    return acc;
  }

  updateAccount(id: number, data: Partial<Account>): Account | null {
    const idx = this.store.accounts.findIndex(a => a.id === id);
    if (idx === -1) return null;
    this.store.accounts[idx] = { ...this.store.accounts[idx], ...data };
    this.save();
    return this.store.accounts[idx];
  }

  deleteAccount(id: number): boolean {
    const idx = this.store.accounts.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.store.accounts.splice(idx, 1);
    this.save();
    return true;
  }

  // ── SETTINGS ───────────────────────────────
  getSettings(): Settings { return this.store.settings; }

  updateSettings(data: Partial<Settings>): Settings {
    this.store.settings = { ...this.store.settings, ...data };
    this.save();
    return this.store.settings;
  }

  // ── LABELS ─────────────────────────────────
  getLabels(): Label[] { return this.store.labels; }

  createLabel(data: Omit<Label, 'id'>): Label {
    const id = this.store.labels.length > 0 ? Math.max(...this.store.labels.map(l => l.id)) + 1 : 1;
    const label: Label = { ...data, id };
    this.store.labels.push(label);
    this.save();
    return label;
  }

  updateLabel(id: number, data: Partial<Label>): Label | null {
    const idx = this.store.labels.findIndex(l => l.id === id);
    if (idx === -1) return null;
    this.store.labels[idx] = { ...this.store.labels[idx], ...data };
    this.save();
    return this.store.labels[idx];
  }

  deleteLabel(id: number): boolean {
    const idx = this.store.labels.findIndex(l => l.id === id);
    if (idx === -1) return false;
    this.store.labels.splice(idx, 1);
    this.save();
    return true;
  }

  // ── CHATS ──────────────────────────────────
  getChats(opts?: { search?: string; unread?: boolean; tagColor?: string; archived?: boolean }): Chat[] {
    let chats = this.store.chats;
    if (opts?.archived === false) chats = chats.filter(c => !c.archived);
    if (opts?.unread) chats = chats.filter(c => c.unread > 0);
    if (opts?.search) {
      const s = opts.search.toLowerCase();
      chats = chats.filter(c =>
        c.visitorName.toLowerCase().includes(s) ||
        c.casinoUsername.toLowerCase().includes(s) ||
        c.visitorPhone.includes(s)
      );
    }
    if (opts?.tagColor) {
      const label = this.store.labels.find(l => l.color === opts.tagColor);
      if (label) chats = chats.filter(c => c.labels.includes(label.id));
    }
    return chats.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }

  getChatById(id: string): Chat | undefined { return this.store.chats.find(c => c.id === id); }

  createChat(data: Omit<Chat, 'id' | 'createdAt' | 'lastMessageAt' | 'unread' | 'archived' | 'lastMessage' | 'state' | 'tags' | 'pendingPayments' | 'showOptionButtons' | 'showUploadButton' | 'depositAttempts' | 'nota'>): Chat {
    const { v4: uuid } = require('uuid');
    const now = new Date().toISOString();
    const chat: Chat = {
      ...data,
      id: uuid(),
      unread: 0,
      archived: false,
      state: 'welcome',
      tags: [],
      pendingPayments: 0,
      showOptionButtons: false,
      showUploadButton: false,
      depositAttempts: 0,
      nota: '',
      lastMessage: '',
      lastMessageAt: now,
      createdAt: now,
    };
    this.store.chats.push(chat);
    this.store.chatMessages[chat.id] = [];
    this.save();
    return chat;
  }

  updateChat(id: string, data: Partial<Chat>): Chat | null {
    const idx = this.store.chats.findIndex(c => c.id === id);
    if (idx === -1) return null;
    this.store.chats[idx] = { ...this.store.chats[idx], ...data };
    this.save();
    return this.store.chats[idx];
  }

  // ── CHAT MESSAGES ──────────────────────────
  getChatMessages(chatId: string, limit = 50, before?: string): ChatMessage[] {
    const msgs = this.store.chatMessages[chatId] || [];
    let filtered = msgs;
    if (before) {
      const idx = filtered.findIndex(m => m.id === before);
      if (idx > 0) filtered = filtered.slice(0, idx);
    }
    return filtered.slice(-limit);
  }

  addChatMessage(data: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const { v4: uuid } = require('uuid');
    const msg: ChatMessage = {
      ...data,
      id: uuid(),
      timestamp: new Date().toISOString(),
    };
    if (!this.store.chatMessages[data.chatId]) {
      this.store.chatMessages[data.chatId] = [];
    }
    this.store.chatMessages[data.chatId].push(msg);

    // Update chat last message
    const chatIdx = this.store.chats.findIndex(c => c.id === data.chatId);
    if (chatIdx !== -1) {
      this.store.chats[chatIdx].lastMessage = data.text.substring(0, 100);
      this.store.chats[chatIdx].lastMessageAt = msg.timestamp;
      if (data.sender === 'visitor') {
        this.store.chats[chatIdx].unread += 1;
      }
    }
    this.save();
    return msg;
  }

  markChatRead(chatId: string): void {
    const idx = this.store.chats.findIndex(c => c.id === chatId);
    if (idx !== -1) {
      this.store.chats[idx].unread = 0;
      this.save();
    }
  }

  // ── STATS ──────────────────────────────────
  getStats() {
    const chats = this.store.chats;
    const today = new Date().toISOString().split('T')[0];
    const todayChats = chats.filter(c => c.createdAt.startsWith(today));
    return {
      totalChats: chats.length,
      activeChats: chats.filter(c => c.status === 'active' || c.status === 'bot' || c.status === 'waiting').length,
      resolvedToday: todayChats.filter(c => c.status === 'resolved').length,
      waitingChats: chats.filter(c => c.status === 'waiting').length,
      totalClients: this.store.clients.length,
      vipClients: this.store.clients.filter(c => c.vip).length,
      totalDeposits: this.store.clients.reduce((sum, c) => sum + c.totalDepositos, 0),
      totalWithdrawals: this.store.clients.reduce((sum, c) => sum + c.totalRetiros, 0),
    };
  }

  // ── PAYMENTS ────────────────────────────────
  getPayments(): Payment[] { return this.store.payments || []; }

  getPaymentsByChat(chatId: string): Payment[] {
    return (this.store.payments || []).filter(p => p.chatId === chatId);
  }

  getPaymentsByClient(clientId: number): Payment[] {
    return (this.store.payments || []).filter(p => p.clientId === clientId);
  }

  getRecentDeposits(clientId: number, days: number): any[] {
    const cutoff = Date.now() - days * 86400000;
    return (this.store.payments || []).filter((p: any) =>
      p.clientId === clientId &&
      p.type === 'deposit' &&
      p.status === 'approved' &&
      new Date(p.processedAt || p.createdAt).getTime() > cutoff
    );
  }

  getPendingPayments(): Payment[] {
    return (this.store.payments || []).filter(p => p.status === 'pending' || p.status === 'processing');
  }

  getPaymentById(id: number): Payment | undefined {
    return (this.store.payments || []).find(p => p.id === id);
  }

  createPayment(data: Omit<Payment, 'id' | 'createdAt' | 'processedAt'>): Payment {
    if (!this.store.payments) this.store.payments = [];
    const id = this.store.payments.length > 0 ? Math.max(...this.store.payments.map(p => p.id)) + 1 : 1;
    const payment: Payment = { ...data, id, createdAt: new Date().toISOString(), processedAt: null };
    this.store.payments.push(payment);
    this.save();
    return payment;
  }

  updatePayment(id: number, data: Partial<Payment>): Payment | null {
    if (!this.store.payments) this.store.payments = [];
    const idx = this.store.payments.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.store.payments[idx] = { ...this.store.payments[idx], ...data };
    this.save();
    return this.store.payments[idx];
  }

  getPaymentByImageHash(hash: string): Payment | undefined {
    return (this.store.payments || []).find(p => p.imageHash === hash && p.status !== 'rejected');
  }

  // ── PUSH SUBSCRIPTIONS ────────────────────────
  getPushSubscriptions(): PushSubscriptionRecord[] {
    return this.store.pushSubscriptions || [];
  }

  createPushSubscription(data: Omit<PushSubscriptionRecord, 'id' | 'createdAt'>): PushSubscriptionRecord {
    const { v4: uuid } = require('uuid');
    const sub: PushSubscriptionRecord = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    if (!this.store.pushSubscriptions) this.store.pushSubscriptions = [];
    this.store.pushSubscriptions.push(sub);
    this.save();
    return sub;
  }

  updatePushSubscription(id: string, data: Partial<PushSubscriptionRecord>): PushSubscriptionRecord | null {
    if (!this.store.pushSubscriptions) return null;
    const idx = this.store.pushSubscriptions.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.store.pushSubscriptions[idx] = { ...this.store.pushSubscriptions[idx], ...data };
    this.save();
    return this.store.pushSubscriptions[idx];
  }

  deletePushSubscription(id: string): boolean {
    if (!this.store.pushSubscriptions) return false;
    const idx = this.store.pushSubscriptions.findIndex(s => s.id === id);
    if (idx === -1) return false;
    this.store.pushSubscriptions.splice(idx, 1);
    this.save();
    return true;
  }

  getPushSubscriptionsByClient(clientId: number): PushSubscriptionRecord[] {
    return (this.store.pushSubscriptions || []).filter(s => s.clientId === clientId);
  }

  getPushSubscriptionsByChat(chatId: string): PushSubscriptionRecord[] {
    return (this.store.pushSubscriptions || []).filter(s => s.chatId === chatId);
  }

  // ── PUSH TRACKING EVENTS ────────────────────────
  getPushTrackingEvents(): PushTrackingEvent[] {
    return this.store.pushTrackingEvents || [];
  }

  createPushTrackingEvent(data: Omit<PushTrackingEvent, 'id' | 'timestamp'>): PushTrackingEvent {
    const { v4: uuid } = require('uuid');
    const evt: PushTrackingEvent = {
      ...data,
      id: uuid(),
      timestamp: new Date().toISOString(),
    };
    if (!this.store.pushTrackingEvents) this.store.pushTrackingEvents = [];
    this.store.pushTrackingEvents.push(evt);
    // Keep only last 5000 events
    if (this.store.pushTrackingEvents.length > 5000) {
      this.store.pushTrackingEvents = this.store.pushTrackingEvents.slice(-5000);
    }
    this.save();
    return evt;
  }

  getPushTrackingStats(): {
    totalAccepted: number;
    totalDeclined: number;
    totalDismissed: number;
    totalDenied: number;
    totalPwaInstalled: number;
    totalPwaDismissed: number;
    totalBannerShown: number;
    uniqueClientsAccepted: number;
    uniqueClientsDeclined: number;
    uniqueClientsPwaInstalled: number;
    recentEvents: PushTrackingEvent[];
  } {
    const events = this.getPushTrackingEvents();
    const accepted = events.filter(e => e.event === 'accepted');
    const declined = events.filter(e => e.event === 'declined');
    const dismissed = events.filter(e => e.event === 'dismissed');
    const denied = events.filter(e => e.event === 'denied_by_browser');
    const pwaInstalled = events.filter(e => e.event === 'pwa_installed');
    const pwaDismissed = events.filter(e => e.event === 'pwa_dismissed');
    const bannerShown = events.filter(e => e.event === 'banner_shown');

    return {
      totalAccepted: accepted.length,
      totalDeclined: declined.length,
      totalDismissed: dismissed.length,
      totalDenied: denied.length,
      totalPwaInstalled: pwaInstalled.length,
      totalPwaDismissed: pwaDismissed.length,
      totalBannerShown: bannerShown.length,
      uniqueClientsAccepted: new Set(accepted.filter(e => e.clientId).map(e => e.clientId)).size,
      uniqueClientsDeclined: new Set(declined.filter(e => e.clientId).map(e => e.clientId)).size,
      uniqueClientsPwaInstalled: new Set(pwaInstalled.filter(e => e.clientId).map(e => e.clientId)).size,
      recentEvents: events.slice(-50).reverse(),
    };
  }

  // ── SENT NOTIFICATIONS ────────────────────────
  getSentNotifications(): SentNotification[] {
    return (this.store.sentNotifications || []).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }

  createSentNotification(data: Omit<SentNotification, 'id' | 'sentAt'>): SentNotification {
    const { v4: uuid } = require('uuid');
    const notif: SentNotification = {
      ...data,
      id: uuid(),
      sentAt: new Date().toISOString(),
    };
    if (!this.store.sentNotifications) this.store.sentNotifications = [];
    this.store.sentNotifications.push(notif);
    this.save();
    return notif;
  }

  // ── POPUP MESSAGES ────────────────────────────
  getPopupMessages(): PopupMessage[] {
    return (this.store.popupMessages || []).sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }

  createPopupMessage(data: Omit<PopupMessage, 'id' | 'sentAt'>): PopupMessage {
    const { v4: uuid } = require('uuid');
    const popup: PopupMessage = {
      ...data,
      id: uuid(),
      sentAt: new Date().toISOString(),
    };
    if (!this.store.popupMessages) this.store.popupMessages = [];
    this.store.popupMessages.push(popup);
    this.save();
    return popup;
  }

  // ── POPUP TEMPLATES ────────────────────────
  getPopupTemplates(): PopupTemplate[] {
    return this.store.popupTemplates || [];
  }

  createPopupTemplate(data: Omit<PopupTemplate, 'id' | 'createdAt'>): PopupTemplate {
    const { v4: uuid } = require('uuid');
    const tpl: PopupTemplate = { ...data, id: uuid(), createdAt: new Date().toISOString() };
    if (!this.store.popupTemplates) this.store.popupTemplates = [];
    this.store.popupTemplates.push(tpl);
    this.save();
    return tpl;
  }

  updatePopupTemplate(id: string, data: Partial<PopupTemplate>): PopupTemplate | null {
    if (!this.store.popupTemplates) return null;
    const idx = this.store.popupTemplates.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.store.popupTemplates[idx] = { ...this.store.popupTemplates[idx], ...data };
    this.save();
    return this.store.popupTemplates[idx];
  }

  deletePopupTemplate(id: string): boolean {
    if (!this.store.popupTemplates) return false;
    const idx = this.store.popupTemplates.findIndex(t => t.id === id);
    if (idx === -1) return false;
    this.store.popupTemplates.splice(idx, 1);
    this.save();
    return true;
  }

  // ── MODAL CONFIG ────────────────────────────
  getModalConfig(): ModalConfig {
    return this.store.settings.modalConfig || { active: false, hora: '20:00', duracion: 1, mensaje: '', botonTexto: 'Ver más' };
  }

  updateModalConfig(data: Partial<ModalConfig>): ModalConfig {
    this.store.settings.modalConfig = { ...this.getModalConfig(), ...data };
    this.save();
    return this.store.settings.modalConfig;
  }

  // ── BUTTON OPTIONS ──────────────────────────
  getButtonOptions(): ButtonOptions {
    const defaults = {
      carga: { type: 'option' as const, link: '', enabled: true },
      retiro: { type: 'option' as const, link: '', enabled: true },
      soporte: { type: 'option' as const, link: '', enabled: true },
      cuponera: { type: 'option' as const, link: '', enabled: true },
    };
    const stored = this.store.settings.buttonOptions || {};
    return {
      carga: { ...defaults.carga, ...stored.carga },
      retiro: { ...defaults.retiro, ...stored.retiro },
      soporte: { ...defaults.soporte, ...stored.soporte },
      cuponera: { ...defaults.cuponera, ...stored.cuponera },
    };
  }

  updateButtonOptions(data: Partial<ButtonOptions>): ButtonOptions {
    this.store.settings.buttonOptions = { ...this.getButtonOptions(), ...data };
    this.save();
    return this.store.settings.buttonOptions;
  }

  // ── EVENTS ─────────────────────────────────
  getEvents(): CasinoEvent[] {
    return this.store.events || [];
  }

  getEventById(id: string): CasinoEvent | undefined {
    return (this.store.events || []).find(e => e.id === id);
  }

  getActiveEvent(): CasinoEvent | undefined {
    return (this.store.events || []).find(e => e.status === 'active');
  }

  createEvent(data: Omit<CasinoEvent, 'id' | 'createdAt' | 'startedAt' | 'endsAt' | 'winnerId' | 'winnerClientId' | 'winnerClaimed' | 'drawnAt'>): CasinoEvent {
    const { v4: uuid } = require('uuid');
    const event: CasinoEvent = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      startedAt: null,
      endsAt: null,
      winnerId: null,
      winnerClientId: null,
      winnerClaimed: false,
      drawnAt: null,
    };
    if (!this.store.events) this.store.events = [];
    this.store.events.push(event);
    this.save();
    return event;
  }

  updateEvent(id: string, data: Partial<CasinoEvent>): CasinoEvent | null {
    if (!this.store.events) return null;
    const idx = this.store.events.findIndex(e => e.id === id);
    if (idx === -1) return null;
    this.store.events[idx] = { ...this.store.events[idx], ...data };
    this.save();
    return this.store.events[idx];
  }

  deleteEvent(id: string): boolean {
    if (!this.store.events) return false;
    const idx = this.store.events.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.store.events.splice(idx, 1);
    // Also delete related entries
    if (this.store.eventEntries) {
      this.store.eventEntries = this.store.eventEntries.filter(e => e.eventId !== id);
    }
    this.save();
    return true;
  }

  // ── EVENT ENTRIES ─────────────────────────────
  getEventEntries(eventId: string): EventEntry[] {
    return (this.store.eventEntries || []).filter(e => e.eventId === eventId);
  }

  getEventEntryByClient(eventId: string, clientId: number): EventEntry | undefined {
    return (this.store.eventEntries || []).find(e => e.eventId === eventId && e.clientId === clientId);
  }

  createEventEntry(data: Omit<EventEntry, 'id' | 'joinedAt' | 'qualified' | 'qualifiedAt' | 'depositPaymentId' | 'depositAmount'>): EventEntry {
    const { v4: uuid } = require('uuid');
    const entry: EventEntry = {
      ...data,
      id: uuid(),
      depositPaymentId: null,
      depositAmount: 0,
      joinedAt: new Date().toISOString(),
      qualified: false,
      qualifiedAt: null,
    };
    if (!this.store.eventEntries) this.store.eventEntries = [];
    this.store.eventEntries.push(entry);
    this.save();
    return entry;
  }

  updateEventEntry(id: string, data: Partial<EventEntry>): EventEntry | null {
    if (!this.store.eventEntries) return null;
    const idx = this.store.eventEntries.findIndex(e => e.id === id);
    if (idx === -1) return null;
    this.store.eventEntries[idx] = { ...this.store.eventEntries[idx], ...data };
    this.save();
    return this.store.eventEntries[idx];
  }

  qualifyEventEntry(entryId: string, paymentId: number, amount: number): EventEntry | null {
    if (!this.store.eventEntries) return null;
    const idx = this.store.eventEntries.findIndex(e => e.id === entryId);
    if (idx === -1) return null;
    this.store.eventEntries[idx].qualified = true;
    this.store.eventEntries[idx].qualifiedAt = new Date().toISOString();
    this.store.eventEntries[idx].depositPaymentId = paymentId;
    this.store.eventEntries[idx].depositAmount = amount;
    this.save();
    return this.store.eventEntries[idx];
  }

  drawEventWinner(eventId: string): { event: CasinoEvent; winner: EventEntry } | null {
    const event = this.getEventById(eventId);
    if (!event) return null;
    const qualified = this.getEventEntries(eventId).filter(e => e.qualified);
    if (qualified.length === 0) return null;
    // Random pick
    const winnerEntry = qualified[Math.floor(Math.random() * qualified.length)];
    const updatedEvent = this.updateEvent(eventId, {
      status: 'drawn',
      winnerId: winnerEntry.id,
      winnerClientId: winnerEntry.clientId,
      drawnAt: new Date().toISOString(),
    });
    return updatedEvent ? { event: updatedEvent, winner: winnerEntry } : null;
  }

  // ── QUIZZES ──────────────────────────
  getQuizzes(): Quiz[] {
    return this.store.quizzes || [];
  }

  getQuizById(id: string): Quiz | undefined {
    return (this.store.quizzes || []).find(q => q.id === id);
  }

  getActiveQuiz(): Quiz | undefined {
    return (this.store.quizzes || []).find(q => q.status === 'active');
  }

  createQuiz(data: Omit<Quiz, 'id' | 'createdAt' | 'startedAt' | 'endedAt' | 'totalAnswers' | 'correctAnswers'>): Quiz {
    const { v4: uuid } = require('uuid');
    const quiz: Quiz = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      totalAnswers: 0,
      correctAnswers: 0,
    };
    if (!this.store.quizzes) this.store.quizzes = [];
    this.store.quizzes.push(quiz);
    this.save();
    return quiz;
  }

  updateQuiz(id: string, data: Partial<Quiz>): Quiz | null {
    if (!this.store.quizzes) return null;
    const idx = this.store.quizzes.findIndex(q => q.id === id);
    if (idx === -1) return null;
    this.store.quizzes[idx] = { ...this.store.quizzes[idx], ...data };
    this.save();
    return this.store.quizzes[idx];
  }

  deleteQuiz(id: string): boolean {
    if (!this.store.quizzes) return false;
    const before = this.store.quizzes.length;
    this.store.quizzes = this.store.quizzes.filter(q => q.id !== id);
    // Also remove answers
    if (this.store.quizAnswers) {
      this.store.quizAnswers = this.store.quizAnswers.filter(a => a.quizId !== id);
    }
    this.save();
    return this.store.quizzes.length < before;
  }

  getQuizAnswers(quizId: string): QuizAnswer[] {
    return (this.store.quizAnswers || []).filter(a => a.quizId === quizId);
  }

  getQuizAnswerByClient(quizId: string, clientId: number): QuizAnswer | undefined {
    return (this.store.quizAnswers || []).find(a => a.quizId === quizId && a.clientId === clientId);
  }

  createQuizAnswer(data: Omit<QuizAnswer, 'id' | 'answeredAt'>): QuizAnswer {
    const { v4: uuid } = require('uuid');
    const answer: QuizAnswer = {
      ...data,
      id: uuid(),
      answeredAt: new Date().toISOString(),
    };
    if (!this.store.quizAnswers) this.store.quizAnswers = [];
    this.store.quizAnswers.push(answer);
    this.save();
    return answer;
  }

  // ── SCRATCH CARDS (Raspa y Gana) ──────────────────────────
  getScratchCards(): ScratchCard[] {
    return this.store.scratchCards || [];
  }

  getScratchCardById(id: string): ScratchCard | undefined {
    return (this.store.scratchCards || []).find(s => s.id === id);
  }

  getActiveScratchCard(): ScratchCard | undefined {
    return (this.store.scratchCards || []).find(s => s.status === 'active');
  }

  createScratchCard(data: Omit<ScratchCard, 'id' | 'createdAt' | 'startedAt' | 'endedAt' | 'totalPlayed' | 'totalWinners' | 'totalPrizeGiven'>): ScratchCard {
    const { v4: uuid } = require('uuid');
    const card: ScratchCard = {
      ...data,
      id: uuid(),
      createdAt: new Date().toISOString(),
      startedAt: null,
      endedAt: null,
      totalPlayed: 0,
      totalWinners: 0,
      totalPrizeGiven: 0,
    };
    if (!this.store.scratchCards) this.store.scratchCards = [];
    this.store.scratchCards.push(card);
    this.save();
    return card;
  }

  updateScratchCard(id: string, data: Partial<ScratchCard>): ScratchCard | null {
    if (!this.store.scratchCards) return null;
    const idx = this.store.scratchCards.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.store.scratchCards[idx] = { ...this.store.scratchCards[idx], ...data };
    this.save();
    return this.store.scratchCards[idx];
  }

  deleteScratchCard(id: string): boolean {
    if (!this.store.scratchCards) return false;
    const before = this.store.scratchCards.length;
    this.store.scratchCards = this.store.scratchCards.filter(s => s.id !== id);
    if (this.store.scratchPlays) {
      this.store.scratchPlays = this.store.scratchPlays.filter(p => p.scratchCardId !== id);
    }
    this.save();
    return this.store.scratchCards.length < before;
  }

  getScratchPlays(scratchCardId: string): ScratchPlay[] {
    return (this.store.scratchPlays || []).filter(p => p.scratchCardId === scratchCardId);
  }

  getScratchPlayByClient(scratchCardId: string, clientId: number): ScratchPlay | undefined {
    return (this.store.scratchPlays || []).find(p => p.scratchCardId === scratchCardId && p.clientId === clientId);
  }

  createScratchPlay(data: Omit<ScratchPlay, 'id' | 'playedAt'>): ScratchPlay {
    const { v4: uuid } = require('uuid');
    const play: ScratchPlay = {
      ...data,
      id: uuid(),
      playedAt: new Date().toISOString(),
    };
    if (!this.store.scratchPlays) this.store.scratchPlays = [];
    this.store.scratchPlays.push(play);
    this.save();
    return play;
  }

  // ── ROULETTE (Ruleta) ──────────────────────────
  getRoulettes(): Roulette[] { return this.store.roulettes || []; }
  getRouletteById(id: string): Roulette | undefined { return (this.store.roulettes || []).find(r => r.id === id); }
  getActiveRoulette(): Roulette | undefined { return (this.store.roulettes || []).find(r => r.status === 'active'); }

  createRoulette(data: Omit<Roulette, 'id' | 'createdAt' | 'startedAt' | 'endedAt' | 'totalSpins' | 'totalPrizeGiven'>): Roulette {
    const { v4: uuid } = require('uuid');
    const r: Roulette = { ...data, id: uuid(), createdAt: new Date().toISOString(), startedAt: null, endedAt: null, totalSpins: 0, totalPrizeGiven: 0 };
    if (!this.store.roulettes) this.store.roulettes = [];
    this.store.roulettes.push(r); this.save(); return r;
  }

  updateRoulette(id: string, data: Partial<Roulette>): Roulette | null {
    if (!this.store.roulettes) return null;
    const idx = this.store.roulettes.findIndex(r => r.id === id);
    if (idx === -1) return null;
    this.store.roulettes[idx] = { ...this.store.roulettes[idx], ...data };
    this.save(); return this.store.roulettes[idx];
  }

  deleteRoulette(id: string): boolean {
    if (!this.store.roulettes) return false;
    const before = this.store.roulettes.length;
    this.store.roulettes = this.store.roulettes.filter(r => r.id !== id);
    if (this.store.rouletteSpins) this.store.rouletteSpins = this.store.rouletteSpins.filter(s => s.rouletteId !== id);
    this.save(); return this.store.roulettes.length < before;
  }

  getRouletteSpins(rouletteId: string): RouletteSpin[] { return (this.store.rouletteSpins || []).filter(s => s.rouletteId === rouletteId); }
  getRouletteSpinByClient(rouletteId: string, clientId: number): RouletteSpin | undefined { return (this.store.rouletteSpins || []).find(s => s.rouletteId === rouletteId && s.clientId === clientId); }

  createRouletteSpin(data: Omit<RouletteSpin, 'id' | 'spunAt'>): RouletteSpin {
    const { v4: uuid } = require('uuid');
    const spin: RouletteSpin = { ...data, id: uuid(), spunAt: new Date().toISOString() };
    if (!this.store.rouletteSpins) this.store.rouletteSpins = [];
    this.store.rouletteSpins.push(spin); this.save(); return spin;
  }

  // ── MISSIONS (Misiones) ──────────────────────────
  getMissions(): Mission[] { return this.store.missions || []; }
  getMissionById(id: string): Mission | undefined { return (this.store.missions || []).find(m => m.id === id); }

  createMission(data: Omit<Mission, 'id' | 'createdAt'>): Mission {
    const { v4: uuid } = require('uuid');
    const m: Mission = { ...data, id: uuid(), createdAt: new Date().toISOString() };
    if (!this.store.missions) this.store.missions = [];
    this.store.missions.push(m); this.save(); return m;
  }

  updateMission(id: string, data: Partial<Mission>): Mission | null {
    if (!this.store.missions) return null;
    const idx = this.store.missions.findIndex(m => m.id === id);
    if (idx === -1) return null;
    this.store.missions[idx] = { ...this.store.missions[idx], ...data };
    this.save(); return this.store.missions[idx];
  }

  deleteMission(id: string): boolean {
    if (!this.store.missions) return false;
    const before = this.store.missions.length;
    this.store.missions = this.store.missions.filter(m => m.id !== id);
    if (this.store.missionProgress) this.store.missionProgress = this.store.missionProgress.filter(p => p.missionId !== id);
    this.save(); return this.store.missions.length < before;
  }

  getMissionProgress(missionId: string): MissionProgress[] { return (this.store.missionProgress || []).filter(p => p.missionId === missionId); }
  getClientMissionProgress(clientId: number): MissionProgress[] { return (this.store.missionProgress || []).filter(p => p.clientId === clientId); }
  getClientMissionForMission(clientId: number, missionId: string): MissionProgress | undefined { return (this.store.missionProgress || []).find(p => p.clientId === clientId && p.missionId === missionId); }

  createMissionProgress(data: Omit<MissionProgress, 'id' | 'startedAt' | 'completedAt' | 'claimedAt'>): MissionProgress {
    const { v4: uuid } = require('uuid');
    const p: MissionProgress = { ...data, id: uuid(), startedAt: new Date().toISOString(), completedAt: null, claimedAt: null };
    if (!this.store.missionProgress) this.store.missionProgress = [];
    this.store.missionProgress.push(p); this.save(); return p;
  }

  updateMissionProgress(id: string, data: Partial<MissionProgress>): MissionProgress | null {
    if (!this.store.missionProgress) return null;
    const idx = this.store.missionProgress.findIndex(p => p.id === id);
    if (idx === -1) return null;
    this.store.missionProgress[idx] = { ...this.store.missionProgress[idx], ...data };
    this.save(); return this.store.missionProgress[idx];
  }

  // ── ACTIVITY FEED ──────────────────────────
  getActivityFeed(limit: number = 50): ActivityFeedItem[] {
    return (this.store.activityFeed || []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }

  addActivityFeedItem(data: Omit<ActivityFeedItem, 'id' | 'timestamp'>): ActivityFeedItem {
    const { v4: uuid } = require('uuid');
    const item: ActivityFeedItem = { ...data, id: uuid(), timestamp: new Date().toISOString() };
    if (!this.store.activityFeed) this.store.activityFeed = [];
    this.store.activityFeed.push(item);
    // Keep max 200 items
    if (this.store.activityFeed.length > 200) this.store.activityFeed = this.store.activityFeed.slice(-200);
    this.save(); return item;
  }

  // ── ACTIVITY LOGS ──────────────────────────
  addActivity(data: Omit<ActivityLog, 'id' | 'timestamp'>): ActivityLog {
    const { v4: uuid } = require('uuid');
    const log: ActivityLog = {
      ...data,
      id: uuid(),
      timestamp: new Date().toISOString(),
    };
    if (!this.store.activityLogs) this.store.activityLogs = [];
    this.store.activityLogs.push(log);
    this.save();
    return log;
  }

  getActivitiesByClient(clientId: number, limit = 100): ActivityLog[] {
    return (this.store.activityLogs || [])
      .filter(a => a.clientId === clientId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  getActivitiesInRange(from: string, to: string, action?: string): ActivityLog[] {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    return (this.store.activityLogs || []).filter(a => {
      const t = new Date(a.timestamp).getTime();
      if (t < fromTime || t > toTime) return false;
      if (action && a.action !== action) return false;
      return true;
    });
  }

  getAllActivities(): ActivityLog[] {
    return this.store.activityLogs || [];
  }

  getDailyAggregates(): DailyAggregate[] {
    return this.store.dailyAggregates || [];
  }

  upsertDailyAggregate(data: DailyAggregate): DailyAggregate {
    if (!this.store.dailyAggregates) this.store.dailyAggregates = [];
    const idx = this.store.dailyAggregates.findIndex(d => d.date === data.date);
    if (idx !== -1) {
      this.store.dailyAggregates[idx] = data;
    } else {
      this.store.dailyAggregates.push(data);
    }
    this.save();
    return data;
  }

  cleanupOldActivities(daysToKeep = 30): number {
    if (!this.store.activityLogs) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    const cutoffTime = cutoff.getTime();
    const before = this.store.activityLogs.length;
    this.store.activityLogs = this.store.activityLogs.filter(
      a => new Date(a.timestamp).getTime() >= cutoffTime
    );
    const removed = before - this.store.activityLogs.length;
    if (removed > 0) this.save();
    return removed;
  }

  // ── ENHANCED STATS ──────────────────────────
  getPaymentStats() {
    const payments = this.store.payments || [];
    const today = new Date().toISOString().split('T')[0];
    const todayPayments = payments.filter(p => p.createdAt.startsWith(today));
    return {
      totalPayments: payments.length,
      pendingPayments: payments.filter(p => p.status === 'pending' || p.status === 'processing').length,
      approvedToday: todayPayments.filter(p => p.status === 'approved').length,
      rejectedToday: todayPayments.filter(p => p.status === 'rejected').length,
      totalApprovedAmount: payments.filter(p => p.status === 'approved' && p.type === 'deposit').reduce((sum, p) => sum + p.amount, 0),
      totalWithdrawnAmount: payments.filter(p => p.status === 'approved' && p.type === 'withdrawal').reduce((sum, p) => sum + p.amount, 0),
      avgConfidence: payments.filter(p => p.aiConfidence > 0).reduce((sum, p, _, arr) => sum + p.aiConfidence / arr.length, 0),
    };
  }

  // ── PALTA TRANSACTIONS ──────────────────────
  getPaltaTransactions(limit = 100): PaltaTransaction[] {
    return (this.store.paltaTransactions || [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  getPaltaTransactionByPaltaId(paltaId: string): PaltaTransaction | undefined {
    return (this.store.paltaTransactions || []).find(t => t.paltaId === paltaId);
  }

  getPaltaTransactionById(id: string): PaltaTransaction | undefined {
    return (this.store.paltaTransactions || []).find(t => t.id === id);
  }

  addPaltaTransaction(data: Omit<PaltaTransaction, 'id' | 'capturedAt' | 'matched' | 'matchedPaymentId' | 'autoApproved'>): PaltaTransaction {
    const { v4: uuid } = require('uuid');
    const tx: PaltaTransaction = {
      ...data,
      id: uuid(),
      capturedAt: new Date().toISOString(),
      matched: false,
      matchedPaymentId: null,
      autoApproved: false,
    };
    if (!this.store.paltaTransactions) this.store.paltaTransactions = [];
    this.store.paltaTransactions.push(tx);
    this.save();
    return tx;
  }

  updatePaltaTransaction(id: string, data: Partial<PaltaTransaction>): PaltaTransaction | null {
    if (!this.store.paltaTransactions) return null;
    const idx = this.store.paltaTransactions.findIndex(t => t.id === id);
    if (idx === -1) return null;
    this.store.paltaTransactions[idx] = { ...this.store.paltaTransactions[idx], ...data };
    this.save();
    return this.store.paltaTransactions[idx];
  }

  getUnmatchedPaltaTransactions(): PaltaTransaction[] {
    return (this.store.paltaTransactions || []).filter(t => !t.matched);
  }

  // ── PALTA CONFIG ──────────────────────────
  getPaltaConfig(): PaltaConfig {
    const config = this.store.paltaConfig || {
      email: '', password: '', enabled: false,
      pollIntervalSeconds: 60, autoApprove: true, headless: true,
      lastPollAt: null, status: 'stopped', errorMessage: '',
    };
    // Backward compat: add headless if missing (true for server/Docker)
    if (config.headless === undefined) config.headless = true;
    return config;
  }

  updatePaltaConfig(data: Partial<PaltaConfig>): PaltaConfig {
    this.store.paltaConfig = { ...this.getPaltaConfig(), ...data };
    this.save();
    return this.store.paltaConfig;
  }
}

export const dataService = new DataService();
