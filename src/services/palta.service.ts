import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { dataService, type PaltaTransaction, type Payment } from './data.service';

puppeteer.use(StealthPlugin());

const SESSION_DIR = path.join(__dirname, '../../data/palta-session');
const USER_DATA_DIR = path.join(SESSION_DIR, 'chrome-profile');

// Ensure directories exist
[SESSION_DIR, USER_DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

interface PaltaActivity {
  _id: string;
  counterparty?: {
    account_routing?: { scheme: string; address: string };
    id: string;
    name: string;
    id_type: string;
  };
  amount: number;
  createdAt: string;
  transactionCode: string;
  _walletToId?: { amount: number; _id: string };
}

interface MatchResult {
  payment: Payment;
  transaction: PaltaTransaction;
  confidence: number;
  nameMatchType: 'exact' | 'partial' | 'fuzzy';
}

class PaltaService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userId: string | null = null;
  private walletId: string | null = null;
  private userInfo: any = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private capturedActivities: PaltaActivity[] | null = null;
  private capturedPageCount = 0;
  private io: any = null;
  private isPolling = false;

  setIO(io: any) {
    this.io = io;
  }

  getStatus() {
    const config = dataService.getPaltaConfig();
    return {
      status: config.status,
      enabled: config.enabled,
      autoApprove: config.autoApprove,
      pollIntervalSeconds: config.pollIntervalSeconds,
      lastPollAt: config.lastPollAt,
      errorMessage: config.errorMessage,
      browserOpen: !!this.browser,
      userId: this.userId,
      walletId: this.walletId,
      userName: this.userInfo ? `${this.userInfo.name || ''} ${this.userInfo.lastname || ''}`.trim() : null,
    };
  }

  // ─── BROWSER MANAGEMENT ───────────────────────

  private async launchBrowser(): Promise<void> {
    const config = dataService.getPaltaConfig();
    const useHeadless = config.headless ?? true; // default: headless (servidor/Docker)
    console.log(`[Palta] Browser mode: ${useHeadless ? 'HEADLESS (servidor)' : 'VISIBLE (para login manual)'}`);

    // In headless/server mode: don't use userDataDir (avoids lock conflicts in Docker)
    // In visible mode (local dev): use userDataDir to persist login session
    if (useHeadless) {
      // Clean any stale lock files just in case
      const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
      lockFiles.forEach(f => {
        const lockPath = path.join(USER_DATA_DIR, f);
        try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch (_) {}
      });
    }

    const launchOptions: any = {
      headless: useHeadless ? 'new' : false,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1280,800'],
      defaultViewport: { width: 1280, height: 800 },
    };

    // Only use userDataDir in non-headless mode (local dev with persistent session)
    if (!useHeadless) {
      launchOptions.userDataDir = USER_DATA_DIR;
    }

    this.browser = await (puppeteer as any).launch(launchOptions);

    const pages = await this.browser!.pages();
    this.page = pages[0] || await this.browser!.newPage();

    // Intercept API responses
    this.page.on('response', async (response: any) => {
      const url = response.url();
      const method = response.request().method();
      if (method !== 'GET' || response.status() !== 200) return;

      try {
        if (url.includes('/api/me') && !url.includes('OPTIONS')) {
          const body = await response.json();
          if (body.data?.user?._id) {
            this.userId = body.data.user._id;
            this.userInfo = body.data.user;
          }
        }

        if (url.includes('/wallets')) {
          const body = await response.json();
          if (body.data?.wallets?.[0]?._id) {
            this.walletId = body.data.wallets[0]._id;
          }
        }

        if (url.includes('/activities')) {
          const body = await response.json();
          if (body.data?.activities) {
            if (this.capturedActivities === null) {
              this.capturedActivities = [];
            }
            this.capturedActivities.push(...body.data.activities);
            this.capturedPageCount++;
            console.log(`[Palta] 📡 Página ${this.capturedPageCount}: ${body.data.activities.length} transacciones (total acumulado: ${this.capturedActivities.length})`);
          }
        }
      } catch (e) {}
    });

    // Handle browser close
    this.browser!.on('disconnected', () => {
      console.log('[Palta] ⚠️ Browser desconectado');
      this.browser = null;
      this.page = null;
      this.stopPolling();
      dataService.updatePaltaConfig({ status: 'stopped', errorMessage: 'Navegador cerrado' });
      this.emitStatus();
    });
  }

  async init(): Promise<{ success: boolean; message: string; loginRequired?: boolean }> {
    try {
      if (this.browser) {
        return { success: true, message: 'Ya está corriendo' };
      }

      console.log('[Palta] 🌐 Iniciando navegador...');
      await this.launchBrowser();

      await this.page!.goto('https://activa-app.palta.app', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await this.delay(3000);

      // Check if login is needed
      const currentUrl = this.page!.url();
      if (currentUrl.includes('/auth')) {
        console.log('[Palta] 🔐 Login manual requerido');
        dataService.updatePaltaConfig({ status: 'login_required', errorMessage: '' });
        this.emitStatus();

        // Wait for manual login (up to 5 minutes)
        for (let i = 0; i < 100; i++) {
          await this.delay(3000);
          if (!this.page || !this.browser) {
            return { success: false, message: 'Navegador cerrado durante login' };
          }
          const url = this.page.url();
          if (!url.includes('/auth')) {
            console.log('[Palta] ✅ Login detectado');
            break;
          }
        }

        if (this.page?.url().includes('/auth')) {
          dataService.updatePaltaConfig({ status: 'login_required', errorMessage: 'Timeout esperando login' });
          return { success: false, message: 'Timeout esperando login manual', loginRequired: true };
        }
      }

      // Wait for API data capture
      await this.delay(5000);

      if (!this.userId) {
        console.log('[Palta] Recargando para capturar datos...');
        await this.page!.setCacheEnabled(false);
        await this.page!.reload({ waitUntil: 'networkidle2' });
        await this.delay(5000);
        await this.page!.setCacheEnabled(true);
      }

      if (!this.userId) {
        dataService.updatePaltaConfig({ status: 'error', errorMessage: 'No se pudo obtener info del usuario' });
        return { success: false, message: 'No se pudo obtener info del usuario' };
      }

      console.log(`[Palta] ✅ Logueado: ${this.userInfo?.name || ''} ${this.userInfo?.lastname || ''}`);
      console.log(`[Palta]    User ID: ${this.userId}`);
      console.log(`[Palta]    Wallet ID: ${this.walletId}`);

      // Start keep-alive
      this.startKeepAlive();

      dataService.updatePaltaConfig({ status: 'running', errorMessage: '' });
      this.emitStatus();

      // Start polling if enabled
      const config = dataService.getPaltaConfig();
      if (config.enabled) {
        this.startPolling();
      }

      return { success: true, message: 'Palta Wallet conectado exitosamente' };
    } catch (err: any) {
      console.error('[Palta] ❌ Error:', err.message);
      dataService.updatePaltaConfig({ status: 'error', errorMessage: err.message });
      this.emitStatus();
      return { success: false, message: err.message };
    }
  }

  private startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(async () => {
      try {
        if (!this.page || !this.browser) return;
        await this.page.evaluate(`
          window.scrollTo(0, 0);
          var buttons = document.querySelectorAll('button');
          var btn = Array.from(buttons).find(function(b) { return b.textContent.includes('Inicio'); });
          if (btn) btn.click();
        `);
      } catch (e) {}
    }, 60000);
  }

  // ─── TRANSACTION FETCHING ───────────────────────

  async getActivities(): Promise<PaltaActivity[]> {
    if (!this.page || !this.browser) {
      throw new Error('Browser no está abierto');
    }

    const TARGET_PAGES = 3;
    this.capturedActivities = null;
    this.capturedPageCount = 0;

    // Click "Historial"
    await this.page.evaluate(`
      var buttons = document.querySelectorAll('button');
      var btn = Array.from(buttons).find(function(b) { return b.textContent.includes('Historial'); });
      if (btn) btn.click();
    `);

    // Wait for first page to be captured
    for (let i = 0; i < 20; i++) {
      await this.delay(500);
      if (this.capturedPageCount > 0) break;
    }

    if (this.capturedPageCount === 0) {
      // Try navigating directly
      await this.page.goto('https://activa-app.palta.app/history', {
        waitUntil: 'networkidle2',
      });
      for (let i = 0; i < 20; i++) {
        await this.delay(500);
        if (this.capturedPageCount > 0) break;
      }
    }

    // Now try to load additional pages by scrolling down
    if (this.capturedPageCount > 0 && this.capturedPageCount < TARGET_PAGES) {
      for (let page = this.capturedPageCount; page < TARGET_PAGES; page++) {
        const activities = this.capturedActivities as unknown as PaltaActivity[];
        const prevCount = activities.length;
        const prevPageCount = this.capturedPageCount;

        // Scroll to bottom to trigger infinite scroll / load more
        await this.page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
        await this.delay(800);

        // Also try clicking common "load more" / "ver más" buttons
        await this.page.evaluate(`
          (function() {
            var loadMore = null;
            // Try by common class patterns
            var selectors = ['[class*="load-more"]', '[class*="LoadMore"]', '[class*="loadMore"]', '[class*="ver-mas"]', '[class*="show-more"]'];
            for (var i = 0; i < selectors.length; i++) {
              loadMore = document.querySelector(selectors[i]);
              if (loadMore) break;
            }
            // Try by button text
            if (!loadMore) {
              var btns = document.querySelectorAll('button, a, div[role="button"]');
              for (var j = 0; j < btns.length; j++) {
                var txt = btns[j].textContent.toLowerCase().trim();
                if (txt.includes('ver m') || txt.includes('cargar m') || txt.includes('load more') || txt.includes('show more') || txt.includes('more')) {
                  loadMore = btns[j];
                  break;
                }
              }
            }
            if (loadMore) {
              loadMore.click();
              console.log('[Palta-scroll] Clicked load more button');
            } else {
              // Try scrolling within a scrollable container
              var containers = document.querySelectorAll('[class*="list"], [class*="List"], [class*="scroll"], [class*="Scroll"], [class*="history"], [class*="History"], main, [role="main"]');
              for (var k = 0; k < containers.length; k++) {
                if (containers[k].scrollHeight > containers[k].clientHeight) {
                  containers[k].scrollTop = containers[k].scrollHeight;
                  console.log('[Palta-scroll] Scrolled container:', containers[k].className);
                  break;
                }
              }
            }
          })();
        `);

        // Wait for new data to arrive
        for (let i = 0; i < 15; i++) {
          await this.delay(500);
          if (this.capturedPageCount > prevPageCount) break;
        }

        // If no new data arrived, stop trying
        const currentActivities = this.capturedActivities as unknown as PaltaActivity[];
        if (currentActivities.length === prevCount) {
          console.log(`[Palta] 📄 No hay más páginas después de ${this.capturedPageCount} (intenté cargar página ${page + 1})`);
          break;
        }

        console.log(`[Palta] 📄 Página ${this.capturedPageCount} cargada — total acumulado: ${currentActivities.length} transacciones`);
      }
    }

    // Deduplicate by _id (in case of overlapping pages)
    const allActivities = this.capturedActivities || [];
    if (allActivities.length > 0) {
      const seen = new Set<string>();
      const unique = allActivities.filter((a: PaltaActivity) => {
        if (seen.has(a._id)) return false;
        seen.add(a._id);
        return true;
      });
      console.log(`[Palta] ✅ Total final: ${unique.length} transacciones únicas de ${this.capturedPageCount} página(s)`);
      return unique;
    }

    return allActivities;
  }

  // ─── MATCHING ENGINE ───────────────────────

  private normalizeString(str: string): string {
    return str.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  }

  private namesMatch(paltaName: string, paymentName: string): { match: boolean; type: 'exact' | 'partial' | 'fuzzy' } {
    const normalPalta = this.normalizeString(paltaName);
    const normalPayment = this.normalizeString(paymentName);

    // Exact match
    if (normalPalta === normalPayment) {
      return { match: true, type: 'exact' };
    }

    // Partial match: one contains the other
    if (normalPalta.includes(normalPayment) || normalPayment.includes(normalPalta)) {
      return { match: true, type: 'partial' };
    }

    // Fuzzy: split names and check if at least 2 words match
    const paltaWords = normalPalta.split(/\s+/).filter(w => w.length > 2);
    const paymentWords = normalPayment.split(/\s+/).filter(w => w.length > 2);
    const matchingWords = paltaWords.filter(pw =>
      paymentWords.some(payw => pw.includes(payw) || payw.includes(pw))
    );

    if (matchingWords.length >= 2 || (matchingWords.length >= 1 && paltaWords.length <= 2)) {
      return { match: true, type: 'fuzzy' };
    }

    return { match: false, type: 'exact' };
  }

  findMatches(transactions: PaltaTransaction[]): MatchResult[] {
    const pendingPayments = dataService.getPendingPayments()
      .filter(p => p.type === 'deposit' && p.clientId);

    const results: MatchResult[] = [];

    for (const tx of transactions) {
      if (tx.matched) continue;

      for (const payment of pendingPayments) {
        // Amount must match exactly
        if (Math.abs(tx.amount - payment.amount) > 0.01) continue;

        // Get client name
        const client = payment.clientId ? dataService.getClientById(payment.clientId) : null;
        if (!client) continue;

        // Try matching name
        const nameResult = this.namesMatch(tx.counterpartyName, client.nombre);
        if (!nameResult.match) continue;

        // Calculate confidence
        let confidence = 70;
        if (nameResult.type === 'exact') confidence = 100;
        else if (nameResult.type === 'partial') confidence = 90;
        else if (nameResult.type === 'fuzzy') confidence = 75;

        // Bonus: same day
        const txDate = new Date(tx.createdAt).toISOString().split('T')[0];
        const payDate = new Date(payment.createdAt).toISOString().split('T')[0];
        if (txDate === payDate) confidence = Math.min(100, confidence + 5);

        results.push({
          payment,
          transaction: tx,
          confidence,
          nameMatchType: nameResult.type,
        });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // Remove duplicate payment matches (keep highest confidence)
    const seen = new Set<number>();
    return results.filter(r => {
      if (seen.has(r.payment.id)) return false;
      seen.add(r.payment.id);
      return true;
    });
  }

  // ─── AUTO-APPROVE ───────────────────────

  async autoApprovePayment(paymentId: number, paltaTxId: string): Promise<boolean> {
    try {
      const payment = dataService.getPaymentById(paymentId);
      if (!payment || payment.status !== 'pending') return false;

      // Update payment
      dataService.updatePayment(paymentId, {
        status: 'approved',
        processedBy: 'Palta Auto-Verify',
        processedAt: new Date().toISOString(),
      });

      // Track activity
      if (payment.clientId) {
        dataService.addActivity({
          clientId: payment.clientId,
          action: 'deposit',
          metadata: { paymentId, amount: payment.amount, type: 'deposit', approvedBy: 'Palta Auto-Verify', paltaTxId },
          sessionId: '',
        });
        dataService.addActivity({
          clientId: payment.clientId,
          action: 'payment_approved',
          metadata: { paymentId, amount: payment.amount, type: 'deposit', autoApproved: true },
          sessionId: '',
        });
      }

      // Update client balance
      if (payment.clientId && payment.type === 'deposit') {
        const client = dataService.getClientById(payment.clientId);
        if (client) {
          dataService.updateClient(payment.clientId, {
            balance: client.balance + payment.amount,
            totalDepositos: client.totalDepositos + payment.amount,
            vip: (client.totalDepositos + payment.amount) >= 10000,
          });
        }
      }

      // Update chat
      if (payment.chatId) {
        const chat = dataService.getChatById(payment.chatId);
        if (chat) {
          dataService.updateChat(payment.chatId, {
            pendingPayments: Math.max(0, chat.pendingPayments - 1),
            state: 'options',
          });
        }

        // Send confirmation message
        const confirmMsg = dataService.addChatMessage({
          chatId: payment.chatId,
          sender: 'bot',
          senderName: 'Casino 463',
          text: `✅ ¡Fichas cargadas automáticamente! Se verificó tu transferencia en Palta y se acreditaron $${payment.amount.toLocaleString()} en tu cuenta.\n\n¿En qué más podemos ayudarte?`,
          type: 'text',
        });

        if (this.io) {
          this.io.to(`chat:${payment.chatId}`).emit('message:new', confirmMsg);
          this.io.to('agents').emit('message:new', confirmMsg);
          this.io.to('agents').emit('payment:approved', payment);
          // Emit to BOTH chat and client rooms for popup reliability
          this.io.to(`chat:${payment.chatId}`).emit('payment:approved', payment);
          if (payment.clientId) {
            this.io.to(`client:${payment.clientId}`).emit('payment:approved', payment);
          }
          this.io.to(`chat:${payment.chatId}`).emit('chat:state-changed', { chatId: payment.chatId, state: 'options' });
          this.io.to('agents').emit('chat:updated', { chatId: payment.chatId });
        }
      }

      // Auto-enroll in events (same logic as admin.routes.ts approve)
      const activeEvent = dataService.getActiveEvent();
      if (activeEvent && payment.clientId && payment.type === 'deposit' && payment.amount >= activeEvent.minDeposit) {
        let entry = dataService.getEventEntryByClient(activeEvent.id, payment.clientId);
        if (!entry) {
          const clientForEntry = dataService.getClientById(payment.clientId);
          entry = dataService.createEventEntry({
            eventId: activeEvent.id,
            clientId: payment.clientId,
            clientName: clientForEntry?.nombre || clientForEntry?.usuario || '',
            chatId: payment.chatId || '',
          });
        }
        if (entry && !entry.qualified) {
          dataService.qualifyEventEntry(entry.id, payment.id, payment.amount);
        }
      }

      // Mark Palta transaction as matched
      const paltaTx = (dataService.getPaltaTransactions(1000) as PaltaTransaction[]).find(t => t.paltaId === paltaTxId);
      if (paltaTx) {
        dataService.updatePaltaTransaction(paltaTx.id, {
          matched: true,
          matchedPaymentId: paymentId,
          autoApproved: true,
        });
      }

      console.log(`[Palta] ✅ Auto-aprobado pago #${paymentId} — $${payment.amount}`);

      // Emit to admin
      if (this.io) {
        this.io.to('agents').emit('palta:auto-approved', {
          paymentId,
          amount: payment.amount,
          paltaTxId,
        });
      }

      return true;
    } catch (err: any) {
      console.error(`[Palta] ❌ Error auto-aprobando pago #${paymentId}:`, err.message);
      return false;
    }
  }

  // ─── POLLING ───────────────────────

  async poll(): Promise<{ newTransactions: number; matches: number; autoApproved: number }> {
    if (this.isPolling) {
      return { newTransactions: 0, matches: 0, autoApproved: 0 };
    }
    this.isPolling = true;

    try {
      const activities = await this.getActivities();
      const incoming = activities.filter(a => a.counterparty && a.amount > 0);

      let newCount = 0;
      const newTransactions: PaltaTransaction[] = [];

      // Store new transactions
      for (const activity of incoming) {
        const existing = dataService.getPaltaTransactionByPaltaId(activity._id);
        if (existing) continue;

        const tx = dataService.addPaltaTransaction({
          paltaId: activity._id,
          counterpartyName: activity.counterparty!.name,
          counterpartyCuit: activity.counterparty!.id || '',
          counterpartyCvu: activity.counterparty!.account_routing?.address || '',
          amount: activity.amount,
          transactionCode: activity.transactionCode || '',
          createdAt: activity.createdAt,
        });

        newTransactions.push(tx);
        newCount++;
        console.log(`[Palta] 🆕 Nueva transacción: ${activity.counterparty!.name} — $${activity.amount}`);
      }

      // Run matching
      const config = dataService.getPaltaConfig();
      const unmatchedTxs = dataService.getUnmatchedPaltaTransactions();
      const matches = this.findMatches(unmatchedTxs);
      let autoApprovedCount = 0;

      for (const match of matches) {
        console.log(`[Palta] 🔗 Match: "${match.transaction.counterpartyName}" → Pago #${match.payment.id} ($${match.payment.amount}) [${match.nameMatchType}, ${match.confidence}%]`);

        // Mark as matched
        dataService.updatePaltaTransaction(match.transaction.id, {
          matched: true,
          matchedPaymentId: match.payment.id,
        });

        // Auto-approve if enabled
        if (config.autoApprove && match.confidence >= 75) {
          const approved = await this.autoApprovePayment(match.payment.id, match.transaction.paltaId);
          if (approved) {
            dataService.updatePaltaTransaction(match.transaction.id, { autoApproved: true });
            autoApprovedCount++;
          }
        }

        // Emit match to admin panel
        if (this.io) {
          this.io.to('agents').emit('palta:match', {
            transaction: match.transaction,
            paymentId: match.payment.id,
            confidence: match.confidence,
            nameMatchType: match.nameMatchType,
            autoApproved: config.autoApprove && match.confidence >= 75,
          });
        }
      }

      dataService.updatePaltaConfig({ lastPollAt: new Date().toISOString() });

      if (newCount > 0 || matches.length > 0) {
        this.emitStatus();
      }

      return { newTransactions: newCount, matches: matches.length, autoApproved: autoApprovedCount };
    } catch (err: any) {
      console.error('[Palta] ❌ Error en poll:', err.message);
      dataService.updatePaltaConfig({ errorMessage: err.message });
      return { newTransactions: 0, matches: 0, autoApproved: 0 };
    } finally {
      this.isPolling = false;
    }
  }

  startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    const config = dataService.getPaltaConfig();
    const interval = (config.pollIntervalSeconds || 60) * 1000;

    console.log(`[Palta] 🔄 Polling cada ${config.pollIntervalSeconds}s`);

    // First poll immediately
    setTimeout(() => this.poll(), 2000);

    this.pollInterval = setInterval(() => {
      if (this.browser && this.page) {
        this.poll();
      }
    }, interval);

    dataService.updatePaltaConfig({ enabled: true, status: 'running' });
    this.emitStatus();
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    dataService.updatePaltaConfig({ enabled: false });
    this.emitStatus();
  }

  // ─── STOP / CLOSE ───────────────────────

  async stop(): Promise<void> {
    this.stopPolling();
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.page = null;
    }
    this.userId = null;
    this.walletId = null;
    this.userInfo = null;
    dataService.updatePaltaConfig({ status: 'stopped', errorMessage: '' });
    this.emitStatus();
    console.log('[Palta] 🛑 Servicio detenido');
  }

  // ─── HEALTH CHECK / TEST CONNECTION ───────────────────────

  async healthCheck(): Promise<{
    ok: boolean;
    browserOpen: boolean;
    loggedIn: boolean;
    canFetchData: boolean;
    userName: string | null;
    userId: string | null;
    walletId: string | null;
    message: string;
    action?: 'none' | 'start' | 'login';
  }> {
    // 1. ¿Browser abierto?
    if (!this.browser || !this.page) {
      // Corregir estado inconsistente
      const config = dataService.getPaltaConfig();
      if (config.status === 'running' || config.enabled) {
        dataService.updatePaltaConfig({ status: 'stopped', enabled: false, errorMessage: 'Browser no está abierto' });
        this.emitStatus();
      }
      return {
        ok: false,
        browserOpen: false,
        loggedIn: false,
        canFetchData: false,
        userName: null,
        userId: null,
        walletId: null,
        message: 'Browser no está abierto. Necesitás iniciar Palta primero.',
        action: 'start',
      };
    }

    // 2. ¿Logueado?
    try {
      const currentUrl = await this.page.url();
      if (currentUrl.includes('/auth')) {
        dataService.updatePaltaConfig({ status: 'login_required', errorMessage: 'Necesita login manual' });
        this.emitStatus();
        return {
          ok: false,
          browserOpen: true,
          loggedIn: false,
          canFetchData: false,
          userName: null,
          userId: null,
          walletId: null,
          message: 'Browser abierto pero necesita login manual. Logueate en la ventana del navegador.',
          action: 'login',
        };
      }
    } catch (err: any) {
      return {
        ok: false,
        browserOpen: true,
        loggedIn: false,
        canFetchData: false,
        userName: null,
        userId: null,
        walletId: null,
        message: `Error verificando página: ${err.message}`,
        action: 'start',
      };
    }

    // 3. ¿Tiene datos del usuario?
    if (!this.userId) {
      return {
        ok: false,
        browserOpen: true,
        loggedIn: true,
        canFetchData: false,
        userName: null,
        userId: null,
        walletId: null,
        message: 'Logueado pero no se capturaron datos del usuario. Probá recargar la página de Palta.',
        action: 'none',
      };
    }

    // 4. Test de fetch real - intentar capturar actividades
    let canFetch = false;
    try {
      // Simple check: see if page responds
      await this.page.evaluate('document.title');
      canFetch = true;
    } catch (err) {
      canFetch = false;
    }

    const userName = this.userInfo ? `${this.userInfo.name || ''} ${this.userInfo.lastname || ''}`.trim() : null;

    if (canFetch) {
      // Asegurar que el estado sea correcto
      dataService.updatePaltaConfig({ status: 'running', errorMessage: '' });
      this.emitStatus();
    }

    return {
      ok: canFetch,
      browserOpen: true,
      loggedIn: true,
      canFetchData: canFetch,
      userName,
      userId: this.userId,
      walletId: this.walletId,
      message: canFetch
        ? `✅ Palta conectada y funcionando. Usuario: ${userName}`
        : 'Browser abierto y logueado pero no responde. Reiniciá Palta.',
      action: 'none',
    };
  }

  /** Fix stale status on server startup */
  fixStaleStatus() {
    const config = dataService.getPaltaConfig();
    if ((config.status === 'running' || config.enabled) && !this.browser) {
      console.log('[Palta] ⚠️ Corrigiendo estado inconsistente: config dice running pero browser no está abierto');
      dataService.updatePaltaConfig({
        status: 'stopped',
        enabled: false,
        errorMessage: 'Servidor reiniciado - browser cerrado',
      });
    }
  }

  // ─── HELPERS ───────────────────────

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private emitStatus() {
    if (this.io) {
      this.io.to('agents').emit('palta:status', this.getStatus());
    }
  }
}

export const paltaService = new PaltaService();
