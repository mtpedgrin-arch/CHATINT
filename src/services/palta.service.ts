import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { dataService, type PaltaTransaction, type Payment } from './data.service';
import { casinoService } from './casino.service';

puppeteer.use(StealthPlugin());

// Firebase config from Palta's app bundles
const firebaseConfig = {
  apiKey: 'AIzaSyBZVUcH3j2ftMFx2Z_kwAlHa2GdFyyrIf8',
  authDomain: 'tarjeta-palta.firebaseapp.com',
  databaseURL: 'https://tarjeta-palta.firebaseio.com',
  projectId: 'tarjeta-palta',
  storageBucket: 'tarjeta-palta.appspot.com',
  messagingSenderId: '216946726905',
  appId: '1:216946726905:web:ef325b566dfa41bd640f28',
};

const firebaseApp = initializeApp(firebaseConfig, 'palta-scraper');
const firebaseAuth = getAuth(firebaseApp);

const SESSION_DIR = path.join(__dirname, '../../data/palta-session');
const USER_DATA_DIR = path.join(SESSION_DIR, 'chrome-profile');
const COOKIES_PATH = path.join(SESSION_DIR, 'cookies.json');
const TOKEN_PATH = path.join(SESSION_DIR, 'auth-token.json');
const PALTA_API_BASE = 'https://prod-api.palta.app/api';

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
  private authToken: string | null = null;  // Firebase JWT token for direct API mode
  private apiMode = false;  // true = direct API calls (no browser needed)
  private firebaseUser: User | null = null;  // Firebase user for auto token refresh
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private accountCvu: string | null = null;
  private accountAlias: string | null = null;
  private accountCuit: string | null = null;

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
      apiMode: this.apiMode,
      mode: this.apiMode ? 'api' : this.browser ? 'browser' : 'disconnected',
      userId: this.userId,
      walletId: this.walletId,
      userName: this.userInfo ? `${this.userInfo.name || ''} ${this.userInfo.lastname || ''}`.trim() : null,
      accountInfo: this.getAccountInfo(),
    };
  }

  // Get Palta account details (CVU, alias, titular, CUIT) for deposit flow
  getAccountInfo(): { cvu: string; alias: string; titular: string; cuit: string } | null {
    if (!this.apiMode || !this.userInfo) return null;
    return {
      cvu: this.accountCvu || '',
      alias: this.accountAlias || '',
      titular: `${this.userInfo.name || ''} ${this.userInfo.lastname || ''}`.trim(),
      cuit: this.accountCuit || '',
    };
  }

  // ─── COOKIE MANAGEMENT (persist session across restarts) ───

  private async saveCookies(): Promise<void> {
    try {
      if (!this.page) return;
      const cookies = await this.page.cookies();
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
      console.log(`[Palta] 🍪 ${cookies.length} cookies guardadas en ${COOKIES_PATH}`);
    } catch (err: any) {
      console.error(`[Palta] Error guardando cookies: ${err.message}`);
    }
  }

  private loadCookies(): any[] {
    try {
      if (!fs.existsSync(COOKIES_PATH)) return [];
      const data = fs.readFileSync(COOKIES_PATH, 'utf-8');
      const cookies = JSON.parse(data);
      if (!Array.isArray(cookies) || cookies.length === 0) return [];
      console.log(`[Palta] 🍪 ${cookies.length} cookies cargadas desde archivo`);
      return cookies;
    } catch (err: any) {
      console.error(`[Palta] Error cargando cookies: ${err.message}`);
      return [];
    }
  }

  // ─── AUTH TOKEN MANAGEMENT (for direct API mode) ───

  private saveToken(token: string): void {
    try {
      this.authToken = token;
      fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token, savedAt: new Date().toISOString() }));
      console.log(`[Palta] 🔑 Auth token guardado`);
    } catch (err: any) {
      console.error(`[Palta] Error guardando token: ${err.message}`);
    }
  }

  private loadToken(): string | null {
    try {
      if (!fs.existsSync(TOKEN_PATH)) return null;
      const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
      if (data.token) {
        console.log(`[Palta] 🔑 Token cargado desde archivo (guardado: ${data.savedAt})`);
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Direct API call using Firebase token (no browser needed!)
  private async apiCall(endpoint: string, params?: Record<string, string>): Promise<any> {
    if (!this.authToken) throw new Error('No hay token de autenticación');
    // endpoint should be like '/me', '/wallets', etc. — PALTA_API_BASE already ends with /api
    const url = new URL(`${PALTA_API_BASE}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const resp = await fetch(url.toString(), {
      headers: {
        'Authorization': this.authToken,  // Palta uses raw token, no "Bearer" prefix
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (resp.status === 401) {
      throw new Error('Token expirado (401).');
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`API error ${resp.status}: ${text.substring(0, 200)}`);
    }
    return resp.json();
  }

  // Firebase login → verifyToken → Palta JWT (no browser needed!)
  async firebaseLogin(): Promise<{ success: boolean; message: string }> {
    const config = dataService.getPaltaConfig();
    if (!config.email || !config.password) {
      return { success: false, message: 'Configurá email y password de Palta en Config.' };
    }

    // Only show 'logging_in' if not already running (avoid flickering during token refresh)
    const isRefresh = config.status === 'running' && this.apiMode;

    try {
      const email = config.email.trim();
      const password = config.password.trim();
      console.log(`[Palta] 🔥 Firebase login con ${email}...${isRefresh ? ' (token refresh)' : ''}`);
      if (!isRefresh) {
        dataService.updatePaltaConfig({ status: 'logging_in', errorMessage: '' });
        this.emitStatus();
      }

      // Step 1: Firebase Auth → get Firebase ID token
      const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      this.firebaseUser = credential.user;
      const firebaseIdToken = await credential.user.getIdToken();
      console.log(`[Palta] 🔥 Firebase OK! UID: ${credential.user.uid}`);

      // Step 2: Exchange Firebase token for Palta JWT via verifyToken
      console.log('[Palta] 🔄 Intercambiando token con Palta API...');
      const verifyResp = await fetch(`${PALTA_API_BASE}/user/verifyToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: firebaseIdToken }),
      });

      if (!verifyResp.ok) {
        const errText = await verifyResp.text().catch(() => '');
        throw new Error(`verifyToken failed (${verifyResp.status}): ${errText.substring(0, 200)}`);
      }

      const verifyData: any = await verifyResp.json();
      if (!verifyData.data?.token) {
        throw new Error('verifyToken no devolvió token');
      }

      // Save Palta JWT (this is what the API accepts)
      this.authToken = verifyData.data.token as string;
      this.saveToken(this.authToken);

      // Extract user info from verifyToken response
      const vd = verifyData.data;
      if (vd._id) {
        this.userId = vd._id;
        this.userInfo = { name: vd.name, lastname: vd.lastname, email: vd.email };
        this.accountCvu = vd.cvu || null;
        this.accountAlias = vd.alias || null;
        this.accountCuit = vd.cuit || null;
      }
      if (vd.wallets?.[0]?._id) {
        this.walletId = vd.wallets[0]._id;
      }

      console.log(`[Palta] ✅ Palta token obtenido! Usuario: ${vd.name} ${vd.lastname}`);
      console.log(`[Palta]    Wallet: ${this.walletId}, Saldo: $${vd.wallets?.[0]?.amount?.toLocaleString('es-AR') || '?'}`);

      // Fetch full account details from /me (CVU, alias, CUIT not in verifyToken)
      if (!this.accountCvu) {
        try {
          const meResp = await this.apiCall('/me');
          const user = meResp.data?.user;
          if (user) {
            this.accountCvu = user.cvu || null;
            this.accountAlias = user.alias || null;
            this.accountCuit = user.cuit || null;
            console.log(`[Palta]    CVU: ${this.accountCvu}, Alias: ${this.accountAlias}`);
          }
        } catch {}
      }

      // Start auto token refresh (Palta tokens expire every ~1 hour)
      this.startTokenRefresh();

      return { success: true, message: 'Firebase + Palta login OK' };
    } catch (err: any) {
      console.error(`[Palta] 🔥 Login error:`, err.code || '', err.message);
      let msg = err.message;
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Password incorrecta. Verificá en Config de Palta.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'Email no encontrado en Palta.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos. Esperá unos minutos.';
      }
      dataService.updatePaltaConfig({ status: 'error', errorMessage: msg });
      this.emitStatus();
      return { success: false, message: msg };
    }
  }

  // Auto-refresh Firebase token every 50 minutes (tokens last 1 hour)
  private startTokenRefresh() {
    if (this.tokenRefreshInterval) clearInterval(this.tokenRefreshInterval);
    this.tokenRefreshInterval = setInterval(async () => {
      try {
        // Must redo full flow: Firebase auth → verifyToken → Palta JWT
        const result = await this.firebaseLogin();
        if (result.success) {
          console.log('[Palta] 🔄 Token Palta renovado automáticamente');
        } else {
          console.error(`[Palta] ❌ Error renovando token: ${result.message}`);
          dataService.updatePaltaConfig({ status: 'error', errorMessage: 'Token expirado y re-login falló' });
          this.emitStatus();
        }
      } catch (err: any) {
        console.error(`[Palta] ❌ Error renovando token: ${err.message}`);
      }
    }, 50 * 60 * 1000); // 50 minutes
  }

  // Init using Firebase → Palta API direct calls (no browser!)
  async initApiMode(): Promise<{ success: boolean; message: string }> {
    // firebaseLogin already does: Firebase auth → verifyToken → saves userId, walletId, authToken
    if (!this.authToken) {
      const loginResult = await this.firebaseLogin();
      if (!loginResult.success) return loginResult;
    }

    if (!this.userId || !this.walletId) {
      return { success: false, message: 'Login OK pero no se obtuvieron datos de usuario/wallet' };
    }

    // Verify token works by calling /me
    try {
      const meResp = await this.apiCall('/me');
      console.log(`[Palta] ✅ API mode verificado — /me respondió OK`);
    } catch (err: any) {
      console.log(`[Palta] ⚠️ /me falló (${err.message}), intentando re-login...`);
      this.authToken = null;
      const relogin = await this.firebaseLogin();
      if (!relogin.success) {
        this.apiMode = false;
        return { success: false, message: relogin.message };
      }
    }

    this.apiMode = true;
    dataService.updatePaltaConfig({ status: 'running', errorMessage: '' });
    this.emitStatus();
    return { success: true, message: `API mode — ${this.userInfo?.name || ''} ${this.userInfo?.lastname || ''}`.trim() };
  }

  // Fetch activities (cashins + commissions) via direct API (no browser)
  async getActivitiesApi(): Promise<PaltaActivity[]> {
    if (!this.authToken || !this.userId) throw new Error('API mode no inicializado');

    // Refresh Palta JWT if Firebase user is available (full flow: Firebase → verifyToken)
    if (this.firebaseUser) {
      try {
        await this.firebaseLogin();
      } catch {}
    }

    const allActivities: PaltaActivity[] = [];
    const pages = 3;

    for (let page = 1; page <= pages; page++) {
      try {
        // Correct endpoint: /user/{userId}/activities (returns cashins + commissions, newest first)
        const resp = await this.apiCall(`/user/${this.userId}/activities`, {
          page: String(page),
          limit: '50',
        });
        const activities = resp.data?.activities;
        if (activities?.length > 0) {
          // Only cashin (deposits) — no cashouts, no commissions
          const cashins = activities.filter((a: any) => a.type === 'cashin');
          allActivities.push(...(cashins as PaltaActivity[]));
          console.log(`[Palta-API] Página ${page}: ${activities.length} actividades (${cashins.length} cashins)`);
        } else {
          break;
        }
      } catch (err: any) {
        console.error(`[Palta-API] Error página ${page}: ${err.message}`);
        if (err.message.includes('401')) {
          // Token expired, try refresh
          const relogin = await this.firebaseLogin();
          if (relogin.success) {
            try {
              const resp = await this.apiCall(`/user/${this.userId}/activities`, {
                page: String(page),
                limit: '50',
              });
              const activities = resp.data?.activities;
              if (activities?.length > 0) {
                const cashins = activities.filter((a: any) => !a.commission && a.counterparty);
                allActivities.push(...(cashins as PaltaActivity[]));
              }
            } catch {}
          }
        }
        break;
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    return allActivities.filter(a => {
      if (seen.has(a._id)) return false;
      seen.add(a._id);
      return true;
    });
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

    // Intercept API requests to capture auth token
    this.page.on('request', (request: any) => {
      const authHeader = request.headers()['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ') && request.url().includes('palta.app')) {
        const token = authHeader.replace('Bearer ', '');
        if (token && token !== this.authToken) {
          this.saveToken(token);
          console.log('[Palta] 🔑 Auth token capturado del browser!');
        }
      }
    });

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
      if (this.apiMode && this.authToken) {
        return { success: true, message: 'Ya está corriendo (API mode)' };
      }
      if (this.browser) {
        return { success: true, message: 'Ya está corriendo (browser mode)' };
      }

      // ALWAYS try API mode first (Firebase login, no browser needed!)
      const config = dataService.getPaltaConfig();
      if (config.email && config.password) {
        console.log('[Palta] 🚀 Intentando API mode (Firebase, sin browser)...');
        const apiResult = await this.initApiMode();
        if (apiResult.success) {
          // Start polling if enabled
          if (config.enabled) {
            this.startPolling();
          }
          return { success: true, message: `🔥 ${apiResult.message}` };
        }
        console.log(`[Palta] API mode falló: ${apiResult.message}. Intentando browser...`);
      }

      console.log('[Palta] 🌐 Iniciando navegador...');
      await this.launchBrowser();

      // Try to restore saved cookies BEFORE navigating (skip login if session is valid)
      const savedCookies = this.loadCookies();
      if (savedCookies.length > 0) {
        console.log(`[Palta] 🍪 Restaurando ${savedCookies.length} cookies guardadas...`);
        await this.page!.setCookie(...savedCookies);
      }

      await this.page!.goto('https://activa-app.palta.app', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      await this.delay(3000);

      // Check if login is needed
      const currentUrl = this.page!.url();
      if (currentUrl.includes('/auth')) {

        if (savedCookies.length > 0) {
          console.log('[Palta] ⚠️ Cookies expiradas, necesita nuevo login');
        }

        // Try auto-login if credentials are configured
        if (config.email && config.password) {
          console.log('[Palta] 🔐 Auto-login con credenciales guardadas...');
          dataService.updatePaltaConfig({ status: 'logging_in', errorMessage: '' });
          this.emitStatus();

          try {
            await this.delay(2000);

            const emailSelector = 'input[type="email"], input[name="email"], input[placeholder*="mail"], input[placeholder*="correo"]';
            const passwordSelector = 'input[type="password"], input[name="password"]';
            const submitSelector = 'button[type="submit"], button:not([type])';

            await this.page!.waitForSelector(emailSelector, { timeout: 10000 });
            await this.page!.type(emailSelector, config.email, { delay: 50 });
            await this.delay(500);

            await this.page!.waitForSelector(passwordSelector, { timeout: 5000 });
            await this.page!.type(passwordSelector, config.password, { delay: 50 });
            await this.delay(500);

            await this.page!.click(submitSelector);
            console.log('[Palta] 📤 Formulario enviado, esperando...');

            for (let i = 0; i < 20; i++) {
              await this.delay(3000);
              if (!this.page || !this.browser) {
                return { success: false, message: 'Navegador cerrado durante login' };
              }
              if (!this.page.url().includes('/auth')) {
                console.log('[Palta] ✅ Auto-login exitoso');
                await this.saveCookies();
                break;
              }
            }

            if (this.page?.url().includes('/auth')) {
              console.log('[Palta] ❌ Auto-login falló');
              dataService.updatePaltaConfig({ status: 'login_required', errorMessage: 'Auto-login falló. Verifica credenciales.' });
              this.emitStatus();
              return { success: false, message: 'Auto-login falló. Verifica credenciales.', loginRequired: true };
            }
          } catch (autoLoginErr: any) {
            console.log(`[Palta] ⚠️ Auto-login error: ${autoLoginErr.message}`);
          }
        }

        // If still on auth page, wait for manual login (local dev with visible browser)
        if (this.page?.url().includes('/auth')) {
          console.log('[Palta] 🔐 Login manual requerido');
          dataService.updatePaltaConfig({ status: 'login_required', errorMessage: '' });
          this.emitStatus();

          for (let i = 0; i < 100; i++) {
            await this.delay(3000);
            if (!this.page || !this.browser) {
              return { success: false, message: 'Navegador cerrado durante login' };
            }
            if (!this.page.url().includes('/auth')) {
              console.log('[Palta] ✅ Login detectado');
              // Save cookies after successful manual login!
              await this.saveCookies();
              break;
            }
          }

          if (this.page?.url().includes('/auth')) {
            dataService.updatePaltaConfig({ status: 'login_required', errorMessage: 'Timeout esperando login' });
            return { success: false, message: 'Timeout esperando login manual', loginRequired: true };
          }
        }
      } else {
        // Already logged in — save/refresh cookies
        await this.saveCookies();
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
      if (dataService.getPaltaConfig().enabled) {
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

    if (!normalPalta || !normalPayment) return { match: false, type: 'exact' };

    // Exact match
    if (normalPalta === normalPayment) {
      return { match: true, type: 'exact' };
    }

    // Partial match: one contains the other (must be significant — at least 8 chars)
    if (normalPalta.length >= 8 && normalPayment.length >= 8) {
      if (normalPalta.includes(normalPayment) || normalPayment.includes(normalPalta)) {
        return { match: true, type: 'partial' };
      }
    }

    // Fuzzy: split names and check word overlap
    // Common first names like "Pablo", "Juan", "Maria" alone are NOT enough
    const paltaWords = normalPalta.split(/\s+/).filter(w => w.length > 2);
    const paymentWords = normalPayment.split(/\s+/).filter(w => w.length > 2);

    // Require at least 2 words in each name to do fuzzy matching
    if (paltaWords.length < 2 || paymentWords.length < 2) {
      return { match: false, type: 'exact' };
    }

    // Count matching words (exact word match only, no substring)
    const matchingWords = paltaWords.filter(pw =>
      paymentWords.some(payw => pw === payw)
    );

    // Require at least 2 matching words (e.g., first name + last name)
    // This prevents "Pablo Ezequiel Leguiza" matching "Pablo Daniel Salinas" (only "pablo" matches)
    if (matchingWords.length >= 2) {
      return { match: true, type: 'fuzzy' };
    }

    // Special case: if last names match exactly (last word of each), that's a strong signal
    const paltaLastName = paltaWords[paltaWords.length - 1];
    const paymentLastName = paymentWords[paymentWords.length - 1];
    if (paltaLastName === paymentLastName && paltaLastName.length >= 4 && matchingWords.length >= 1) {
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

        // Try matching name against BOTH client name AND OCR-extracted sender name
        const ocrSenderName = (payment.comprobante as any)?.extractedData?.senderName || '';
        const nameResult = this.namesMatch(tx.counterpartyName, client.nombre);
        const ocrNameResult = ocrSenderName ? this.namesMatch(tx.counterpartyName, ocrSenderName) : { match: false, type: 'exact' as const };

        // Use the best match between client name and OCR name
        const bestMatch = nameResult.match ? nameResult : (ocrNameResult.match ? ocrNameResult : null);
        if (!bestMatch) continue;

        // Calculate confidence
        let confidence = 70;
        if (bestMatch.type === 'exact') confidence = 100;
        else if (bestMatch.type === 'partial') confidence = 90;
        else if (bestMatch.type === 'fuzzy') confidence = 75;

        // Bonus: CUIT match (very strong signal)
        const ocrCuit = (payment.comprobante as any)?.extractedData?.cuit || '';
        if (ocrCuit && tx.counterpartyCuit && this.normalizeString(ocrCuit) === this.normalizeString(tx.counterpartyCuit)) {
          confidence = Math.min(100, confidence + 10);
          console.log(`[Palta] 🔑 CUIT match bonus: ${ocrCuit}`);
        }

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

      // Update client balance (local)
      if (payment.clientId && payment.type === 'deposit') {
        const client = dataService.getClientById(payment.clientId);
        if (client) {
          dataService.updateClient(payment.clientId, {
            balance: client.balance + payment.amount,
            totalDepositos: client.totalDepositos + payment.amount,
            vip: (client.totalDepositos + payment.amount) >= 10000,
          });

          // ── DEPOSIT CREDITS IN CASINO 463.life ──
          // This is the actual credit deposit to the casino platform
          const casinoUsername = client.usuario;
          if (casinoUsername && casinoService.configured) {
            try {
              casinoService.configureFromStore();
              const depositResult = await casinoService.depositCredits(casinoUsername, payment.amount);
              if (depositResult.success) {
                console.log(`[Palta→Casino] ✅ Fichas depositadas en 463.life: ${casinoUsername} +$${payment.amount} (newBalance: ${depositResult.newBalance})`);
              } else {
                console.error(`[Palta→Casino] ❌ Error depositando fichas en 463.life: ${depositResult.error}`);
                // Still continue with approval — admin can manually fix casino balance
              }
            } catch (casinoErr: any) {
              console.error(`[Palta→Casino] ❌ Exception depositando fichas: ${casinoErr.message}`);
            }
          } else {
            console.log(`[Palta→Casino] ⚠️ Casino deposit skipped: username=${casinoUsername || 'N/A'}, configured=${casinoService.configured}`);
          }
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
      // Use API mode if available, otherwise browser mode
      const activities = this.apiMode ? await this.getActivitiesApi() : await this.getActivities();
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
        // Re-verify payment is still pending (prevent race conditions)
        const freshPayment = dataService.getPaymentById(match.payment.id);
        if (!freshPayment || freshPayment.status !== 'pending') {
          console.log(`[Palta] ⏭️ Skipping match: Pago #${match.payment.id} ya no está pendiente (status: ${freshPayment?.status})`);
          continue;
        }

        console.log(`[Palta] 🔗 Match: "${match.transaction.counterpartyName}" → Pago #${match.payment.id} ($${match.payment.amount}) [${match.nameMatchType}, ${match.confidence}%]`);

        // Mark as matched
        dataService.updatePaltaTransaction(match.transaction.id, {
          matched: true,
          matchedPaymentId: match.payment.id,
        });

        // Auto-approve if enabled — require >= 85% confidence (exact or partial name match + same day)
        // Fuzzy-only matches (75%) go to manual review for safety
        if (config.autoApprove && match.confidence >= 85) {
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
            autoApproved: config.autoApprove && match.confidence >= 85,
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
      if (this.apiMode || (this.browser && this.page)) {
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
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
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
    this.authToken = null;
    this.firebaseUser = null;
    this.apiMode = false;
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
    // API mode check
    if (this.apiMode && this.authToken) {
      try {
        const meResp = await this.apiCall('/me');
        const userName = meResp.data?.user ? `${meResp.data.user.name || ''} ${meResp.data.user.lastname || ''}`.trim() : this.userInfo?.name;
        return {
          ok: true,
          browserOpen: false,
          loggedIn: true,
          canFetchData: true,
          userName: userName || null,
          userId: this.userId,
          walletId: this.walletId,
          message: `✅ Palta conectada (API mode, sin browser). Usuario: ${userName}`,
          action: 'none',
        };
      } catch (err: any) {
        return {
          ok: false,
          browserOpen: false,
          loggedIn: false,
          canFetchData: false,
          userName: null,
          userId: this.userId,
          walletId: this.walletId,
          message: `API mode error: ${err.message}`,
          action: 'start',
        };
      }
    }

    // 1. ¿Browser abierto?
    if (!this.browser || !this.page) {
      const config = dataService.getPaltaConfig();
      if (config.status === 'running' || config.enabled) {
        dataService.updatePaltaConfig({ status: 'stopped', enabled: false, errorMessage: 'No está conectado' });
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
        message: 'Palta no está conectada. Hacé click en Iniciar.',
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
    // Fix any non-stopped status when there's no active connection
    if ((config.status === 'running' || config.status === 'logging_in' || config.status === 'login_required' || config.enabled) && !this.browser && !this.apiMode) {
      console.log('[Palta] ⚠️ Corrigiendo estado inconsistente');
      dataService.updatePaltaConfig({
        status: 'stopped',
        enabled: false,
        errorMessage: 'Servidor reiniciado — presioná Iniciar para reconectar',
      });
    }

    // Auto-start API mode if credentials are configured
    const updated = dataService.getPaltaConfig();
    if (updated.email && updated.password) {
      console.log('[Palta] 🔄 Auto-iniciando API mode...');
      this.initApiMode().then(result => {
        if (result.success) {
          console.log(`[Palta] ✅ Auto-start exitoso: ${result.message}`);
          // Auto-start polling too
          this.startPolling();
        } else {
          console.log(`[Palta] ⚠️ Auto-start falló: ${result.message}`);
        }
      }).catch(err => {
        console.error(`[Palta] ❌ Auto-start error: ${err.message}`);
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
