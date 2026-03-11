import axios from 'axios';
import { dataService } from './data.service';

/**
 * Servicio para interactuar con el panel admin de 463.life
 *
 * La plataforma usa sesion con cookies.
 * Flujo:
 *   1. Login en admin.463.life → obtener cookie de sesion
 *   2. Usar esa cookie para hacer POST a los formularios del admin
 *
 * Endpoints:
 *   - Login: POST /index.php?act=admin&area=login
 *   - Crear usuario: POST /index.php?act=admin&area=createuser&id={cajaId}
 *   - Cambiar balance: POST /index.php?act=admin&area=changebalance&id={userId}
 *   - Ver usuarios: GET /index.php?act=admin&area=users&id={cajaId}
 */

export interface CasinoUser {
  username: string;
  password: string;
  userId?: string;
}

export interface CasinoBalance {
  balance: number;
  wager: number;
  withdrawable: number;
}

export interface CasinoPlayerInfo {
  id: string;
  login: string;
  name: string;
  balance: number;
  wager: number;
  withdrawable: number;
  status: string;
  bonusStatus: string;
  lastLogin: string;
  game?: string;
  deposit?: number;
  withdraw?: number;
  profit?: number;
}

class CasinoService {
  private sessionCookie: string | null = null;
  private loginUser: string = '';
  private loginPassword: string = '';
  private cajaId: string = '';
  private baseUrl: string = '';
  private isLoggedIn: boolean = false;

  configure(config: { url: string; apiKey: string; user: string; password: string; cajaId: string }) {
    this.baseUrl = config.url.replace(/\/+$/, '').trim();
    this.loginUser = config.user.trim();
    this.loginPassword = config.password.trim();
    this.cajaId = (config.cajaId || '').trim();
    this.isLoggedIn = false;
    this.sessionCookie = null;
    console.log(`[Casino] Configured: url=${this.baseUrl}, user=${this.loginUser}, caja=${this.cajaId}, pwLength=${this.loginPassword.length}`);
  }

  configureFromStore() {
    const apiConfig = dataService.getApiConfig();
    if (apiConfig.casino?.url) {
      this.configure({
        url: apiConfig.casino.url,
        apiKey: apiConfig.casino.token || '',
        user: apiConfig.casino.user || '',
        password: apiConfig.casino.password || '',
        cajaId: apiConfig.casino.cajaId || '',
      });
    }
  }

  get configured(): boolean {
    return !!(this.baseUrl && this.loginUser && this.loginPassword);
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {}),
      ...extra,
    };
  }

  async login(): Promise<{ success: boolean; error?: string }> {
    if (!this.configured) {
      return { success: false, error: 'Casino API no configurada' };
    }

    try {
      const loginUrl = this.url('/index.php?act=admin&area=login');
      console.log(`[Casino] Login URL: ${loginUrl}`);

      const params = new URLSearchParams();
      params.append('login', this.loginUser);
      params.append('password', this.loginPassword);

      const response = await axios({
        method: 'POST',
        url: loginUrl,
        data: params.toString(),
        headers: this.headers(),
        maxRedirects: 0,
        validateStatus: () => true,
      });

      // Capturar cookies de sesion
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        this.sessionCookie = cookies.map((c: string) => c.split(';')[0]).join('; ');
      }

      console.log(`[Casino] Login response status: ${response.status}`);

      // 302 = login exitoso (redirect)
      if (response.status === 302 || response.status === 301) {
        this.isLoggedIn = true;
        console.log('[Casino] Login exitoso (redirect)');

        // Seguir el redirect
        const location = response.headers['location'];
        if (location) {
          const followUrl = location.startsWith('http') ? location : this.url(location);
          try {
            const followResp = await axios.get(followUrl, {
              headers: this.headers(),
              validateStatus: () => true,
            });
            const moreCookies = followResp.headers['set-cookie'];
            if (moreCookies) {
              const newCookies = moreCookies.map((c: string) => c.split(';')[0]).join('; ');
              this.sessionCookie = this.sessionCookie ? `${this.sessionCookie}; ${newCookies}` : newCookies;
            }
          } catch {}
        }
        return { success: true };
      }

      // 200 = check if it's the actual admin page (login success) or login form (failure)
      if (response.status === 200) {
        const html = typeof response.data === 'string' ? response.data : '';
        if (html.includes('area=login') && html.includes('<input') && html.includes('password')) {
          return { success: false, error: 'Credenciales incorrectas' };
        }
        this.isLoggedIn = true;
        console.log('[Casino] Login exitoso (200)');
        return { success: true };
      }

      return { success: false, error: `Status: ${response.status}` };
    } catch (err: any) {
      console.error('[Casino] Login error:', err.message);
      return { success: false, error: err.message };
    }
  }

  private async ensureLoggedIn(): Promise<boolean> {
    if (!this.isLoggedIn) {
      const result = await this.login();
      return result.success;
    }
    return true;
  }

  async createUser(nombre: string, telefono: string): Promise<{ success: boolean; user?: CasinoUser; error?: string; htmlPreview?: string }> {
    if (!await this.ensureLoggedIn()) {
      return { success: false, error: 'No se pudo iniciar sesion' };
    }

    const username = this.generateUsername(nombre, telefono);
    const password = this.generateStrongPassword();

    try {
      // Campos necesarios: group=5 (Terminal), sended, login, password, balance
      const params = new URLSearchParams();
      params.append('sended', 'true');
      params.append('group', '5');
      params.append('login', username);
      params.append('password', password);
      params.append('balance', '0');

      console.log(`[Casino] Creating user: ${username} at caja ${this.cajaId}`);

      const response = await axios({
        method: 'POST',
        url: this.url(`/index.php?act=admin&area=createuser&id=${this.cajaId}`),
        data: params.toString(),
        headers: this.headers(),
        validateStatus: () => true,
        maxRedirects: 5,
      });

      const html = typeof response.data === 'string' ? response.data : '';
      console.log(`[Casino] createUser status: ${response.status}, html length: ${html.length}`);
      console.log(`[Casino] createUser html preview:`, html.substring(0, 2000));
      console.log(`[Casino] createUser response headers:`, JSON.stringify(response.headers));

      if (html.includes('Exito') || html.includes('xito') || html.includes('Success') || html.includes('successfully')) {
        // Extraer userId del HTML - buscar en reg-password id="XXXXXXX"
        const userIdMatch = html.match(/reg-password[^>]*id="(\d+)"/);
        const altIdMatch = html.match(/id="(\d{5,})"/);
        const userId = userIdMatch?.[1] || altIdMatch?.[1];
        console.log(`[Casino] Usuario creado: ${username}, userId: ${userId}`);
        return { success: true, user: { username, password, userId } };
      }

      // 302 redirect usually means success
      if (response.status === 302) {
        console.log(`[Casino] Usuario creado (redirect): ${username}`);
        return { success: true, user: { username, password } };
      }

      if (html.includes('demasiado simple') || html.includes('too simple')) {
        const strongerPw = this.generateStrongPassword(12);
        params.set('password', strongerPw);
        const retry = await axios({
          method: 'POST',
          url: this.url(`/index.php?act=admin&area=createuser&id=${this.cajaId}`),
          data: params.toString(),
          headers: this.headers(),
          validateStatus: () => true,
        });
        const retryHtml = typeof retry.data === 'string' ? retry.data : '';
        if (retryHtml.includes('Exito') || retryHtml.includes('xito') || retryHtml.includes('Success') || retry.status === 302) {
          return { success: true, user: { username, password: strongerPw } };
        }
      }

      if (html.includes('ya existe') || html.includes('already exists') || html.includes('already used')) {
        return { success: false, error: `El usuario ${username} ya existe` };
      }

      // If the response is the create form again, the creation might have failed silently
      // Check if it shows an error message
      const errorMatch = html.match(/<div[^>]*class="[^"]*error[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const errorMsg = errorMatch ? errorMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      console.error('[Casino] createUser may have failed. Error:', errorMsg || 'unknown');
      return { success: false, error: errorMsg || 'Error al crear usuario', user: { username, password }, htmlPreview: html.substring(0, 3000) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async depositCredits(usernameOrId: string, amount: number): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    const result = await this.changeBalance(usernameOrId, amount, 'in');
    // If deposit failed with session/access error, force re-login and retry once
    if (!result.success && (result.error?.includes('sesion') || result.error?.includes('No access') || result.error?.includes('login'))) {
      console.log(`[Casino] Session expired, forcing re-login...`);
      this.isLoggedIn = false;
      this.sessionCookie = null;
      const loginResult = await this.login();
      if (loginResult.success) {
        console.log(`[Casino] Re-login successful, retrying deposit...`);
        return this.changeBalance(usernameOrId, amount, 'in');
      }
    }
    return result;
  }

  async withdrawCredits(usernameOrId: string, amount: number): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    return this.changeBalance(usernameOrId, amount, 'out');
  }

  /**
   * Cambiar balance usando el endpoint real del panel:
   * POST index.php?act=admin&area=balance&response=js&type=frame&printing=true&id={userId}
   * Body: balance_currency, amount, send, all, operation (in/out)
   */
  private async changeBalance(usernameOrId: string, amount: number, operation: 'in' | 'out'): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    if (!await this.ensureLoggedIn()) {
      return { success: false, error: 'No se pudo iniciar sesion' };
    }

    try {
      let userId = usernameOrId;
      if (!/^\d+$/.test(usernameOrId)) {
        const foundId = await this.getUserId(usernameOrId);
        if (!foundId) return { success: false, error: `Usuario ${usernameOrId} no encontrado` };
        userId = foundId;
      }

      const params = new URLSearchParams();
      params.append('balance_currency', 'ARS');
      params.append('amount', amount.toString());
      params.append('send', 'true');
      params.append('all', 'false');
      params.append('operation', operation);

      const balanceUrl = this.url(`/index.php?act=admin&area=balance&response=js&type=frame&printing=true&id=${userId}`);
      console.log(`[Casino] changeBalance: ${operation} ${amount} ARS for userId ${userId}`);

      const response = await axios({
        method: 'POST',
        url: balanceUrl,
        data: params.toString(),
        headers: this.headers(),
        validateStatus: () => true,
      });

      const data = response.data;
      console.log(`[Casino] changeBalance response:`, typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500));

      // La respuesta es JSON con successMessage o error
      if (typeof data === 'object' && data !== null) {
        if (data.error || data.errorMessage) {
          return { success: false, error: data.error || data.errorMessage };
        }
        if (data.successMessage || data.dataList) {
          const newBalance = data.dataList?.currencies?.ARS;
          console.log(`[Casino] ${operation === 'in' ? 'Deposited' : 'Withdrawn'} ${amount} ARS for userId ${userId}`);
          return { success: true, newBalance: newBalance !== undefined ? parseFloat(String(newBalance).replace(/,/g, '')) : undefined };
        }
      }

      // Si devolvió string, puede ser HTML de error
      if (typeof data === 'string') {
        if (data.includes('No access') || data.includes('Error')) {
          return { success: false, error: 'Sin permiso para cambiar balance' };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getBalance(username: string): Promise<{ success: boolean; balance?: CasinoBalance; error?: string }> {
    if (!await this.ensureLoggedIn()) {
      return { success: false, error: 'No se pudo iniciar sesion en casino' };
    }

    if (!this.cajaId) {
      return { success: false, error: 'cajaId no configurado — configurar en APIs > Casino 463' };
    }

    try {
      const usersUrl = this.url(`/index.php?act=admin&area=users&id=${this.cajaId}`);
      console.log(`[Casino] getBalance: fetching ${usersUrl} for user "${username}"`);

      const response = await axios.get(usersUrl, { headers: this.headers(), validateStatus: () => true });
      const html = typeof response.data === 'string' ? response.data : '';

      console.log(`[Casino] getBalance: status=${response.status}, htmlLength=${html.length}`);

      // Check if we got redirected to login page (session expired)
      if (html.includes('area=login') && html.includes('<input') && html.includes('password')) {
        console.log(`[Casino] Session expired, forcing re-login...`);
        this.isLoggedIn = false;
        this.sessionCookie = null;
        if (!await this.ensureLoggedIn()) {
          return { success: false, error: 'Re-login falló' };
        }
        // Retry after re-login
        const retryResp = await axios.get(usersUrl, { headers: this.headers(), validateStatus: () => true });
        const retryHtml = typeof retryResp.data === 'string' ? retryResp.data : '';
        return this.parseBalanceFromHtml(retryHtml, username);
      }

      return this.parseBalanceFromHtml(html, username);
    } catch (err: any) {
      console.error(`[Casino] getBalance error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private parseBalanceFromHtml(html: string, username: string): { success: boolean; balance?: CasinoBalance; error?: string } {
    // Parse JSON embedded in usersClass
    const jsonMatch = html.match(/new\s+usersClass\(\s*(\[[\s\S]*?\])\s*,\s*\d+/);
    if (!jsonMatch) {
      console.log(`[Casino] No usersClass found in HTML (length=${html.length}). First 200 chars: ${html.substring(0, 200)}`);
      return { success: false, error: 'No se pudo leer la lista de usuarios del casino' };
    }

    try {
      const rawUsers = JSON.parse(jsonMatch[1]);
      console.log(`[Casino] Parsed ${rawUsers.length} users. Looking for "${username}"...`);

      // Case-insensitive search
      const user = rawUsers.find((u: any) =>
        (u.login || '').toLowerCase() === username.toLowerCase() ||
        u.id === username
      );

      if (user) {
        const currency = user.currencies?.[0] || 'ARS';
        console.log(`[Casino] Found user: login=${user.login}, id=${user.id}, balance=${user.balances?.[currency]}`);
        return {
          success: true,
          balance: {
            balance: this.parseAmount(user.balances?.[currency]),
            wager: this.parseAmount(user.wager?.[currency]),
            withdrawable: this.parseAmount(user.out_balance?.[currency]),
          },
        };
      }

      // Not found — log available users for debugging
      const availableLogins = rawUsers.slice(0, 15).map((u: any) => u.login).filter(Boolean);
      console.log(`[Casino] User "${username}" NOT found. Available: ${availableLogins.join(', ')}${rawUsers.length > 15 ? '...' : ''}`);
      return { success: false, error: `Usuario "${username}" no encontrado en caja ${this.cajaId}. Usuarios disponibles: ${availableLogins.slice(0, 5).join(', ')}` };
    } catch (parseErr: any) {
      console.error(`[Casino] JSON parse error: ${parseErr.message}`);
      return { success: false, error: 'Error parseando datos del casino' };
    }
  }

  async getPlayers(): Promise<{ success: boolean; players?: CasinoPlayerInfo[]; total?: number; error?: string }> {
    if (!await this.ensureLoggedIn()) {
      return { success: false, error: 'No se pudo iniciar sesion' };
    }

    try {
      const response = await axios.get(
        this.url(`/index.php?act=admin&area=users&id=${this.cajaId}`),
        { headers: this.headers(), validateStatus: () => true }
      );

      const html = typeof response.data === 'string' ? response.data : '';
      const players: CasinoPlayerInfo[] = [];

      // Los datos de usuarios están embebidos como JSON en: new usersClass([...], cajaId, ...)
      const jsonMatch = html.match(/new\s+usersClass\(\s*(\[[\s\S]*?\])\s*,\s*\d+/);
      if (jsonMatch) {
        try {
          const rawUsers = JSON.parse(jsonMatch[1]);
          for (const u of rawUsers) {
            if (!u.id || u.login === 'Total') continue; // Skip totals row
            const currency = u.currencies?.[0] || 'ARS';
            players.push({
              id: u.id,
              login: u.login,
              name: u.name || '',
              balance: this.parseAmount(u.balances?.[currency]),
              wager: this.parseAmount(u.wager?.[currency]),
              withdrawable: this.parseAmount(u.out_balance?.[currency]),
              status: u.online === '1' ? 'online' : 'offline',
              bonusStatus: '',
              lastLogin: '',
              game: u.game || '',
              deposit: this.parseAmount(u.in?.[currency]),
              withdraw: this.parseAmount(u.out?.[currency]),
              profit: this.parseAmount(u.profit?.[currency]),
            });
          }
        } catch (parseErr) {
          console.error('[Casino] Error parsing users JSON:', parseErr);
        }
      }

      return { success: true, players, total: players.length };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async userExists(username: string): Promise<boolean> {
    const userId = await this.getUserId(username);
    return !!userId;
  }

  private async getUserId(username: string): Promise<string | null> {
    try {
      if (!this.cajaId) {
        console.error('[Casino] getUserId: cajaId not configured');
        return null;
      }

      const usersUrl = this.url(`/index.php?act=admin&area=users&id=${this.cajaId}`);
      console.log(`[Casino] getUserId: looking for "${username}" in caja ${this.cajaId}`);

      const response = await axios.get(usersUrl, { headers: this.headers(), validateStatus: () => true });
      const html = typeof response.data === 'string' ? response.data : '';

      // Check if redirected to login
      if (html.includes('area=login') && html.includes('password')) {
        console.log('[Casino] getUserId: session expired, re-logging...');
        this.isLoggedIn = false;
        this.sessionCookie = null;
        if (!await this.ensureLoggedIn()) return null;
        const retryResp = await axios.get(usersUrl, { headers: this.headers(), validateStatus: () => true });
        const retryHtml = typeof retryResp.data === 'string' ? retryResp.data : '';
        return this.findUserIdInHtml(retryHtml, username);
      }

      return this.findUserIdInHtml(html, username);
    } catch (err: any) {
      console.error('[Casino] getUserId error:', err.message);
      return null;
    }
  }

  private findUserIdInHtml(html: string, username: string): string | null {
    // Parse JSON from usersClass
    const jsonMatch = html.match(/new\s+usersClass\(\s*(\[[\s\S]*?\])\s*,\s*\d+/);
    if (jsonMatch) {
      try {
        const rawUsers = JSON.parse(jsonMatch[1]);
        // Case-insensitive search
        const user = rawUsers.find((u: any) => (u.login || '').toLowerCase() === username.toLowerCase());
        if (user?.id) {
          console.log(`[Casino] getUserId: found "${username}" → id=${user.id}`);
          return user.id;
        }
        const available = rawUsers.slice(0, 10).map((u: any) => u.login).filter(Boolean);
        console.log(`[Casino] getUserId: "${username}" not in ${rawUsers.length} users. Sample: ${available.join(', ')}`);
      } catch {}
    }

    // Fallback: regex search (case-insensitive)
    const esc = this.escapeRegex(username);
    const idRegex = new RegExp(`"id":"(\\d+)","login":"${esc}"`, 'i');
    const match = html.match(idRegex);
    if (match) {
      console.log(`[Casino] getUserId: found via regex "${username}" → id=${match[1]}`);
      return match[1];
    }

    return null;
  }

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    if (!this.configured) {
      return {
        success: false,
        message: 'Casino API no configurada. Falta URL, usuario o password.',
        details: { url: this.baseUrl || 'EMPTY', user: this.loginUser || 'EMPTY', passwordSet: !!this.loginPassword, cajaId: this.cajaId || 'EMPTY' },
      };
    }

    console.log(`[Casino] Test connection: url=${this.baseUrl}, user=${this.loginUser}, caja=${this.cajaId}`);

    const loginResult = await this.login();
    if (!loginResult.success) {
      return { success: false, message: `Login fallido: ${loginResult.error}`, details: { url: this.baseUrl, user: this.loginUser } };
    }

    if (this.cajaId) {
      try {
        const usersUrl = this.url(`/index.php?act=admin&area=users&id=${this.cajaId}`);
        console.log(`[Casino] Fetching users from: ${usersUrl}`);
        const response = await axios.get(usersUrl, { headers: this.headers(), validateStatus: () => true });
        const html = typeof response.data === 'string' ? response.data : '';

        console.log(`[Casino] Users response: status=${response.status}, length=${html.length}`);

        // Try to parse users
        const jsonMatch = html.match(/new\s+usersClass\(\s*(\[[\s\S]*?\])\s*,\s*\d+/);
        let userCount = 0;
        let userLogins: string[] = [];

        if (jsonMatch) {
          try {
            const rawUsers = JSON.parse(jsonMatch[1]);
            userCount = rawUsers.length;
            userLogins = rawUsers.slice(0, 10).map((u: any) => u.login).filter(Boolean);
            console.log(`[Casino] Found ${userCount} users. First 10: ${userLogins.join(', ')}`);
          } catch (parseErr: any) {
            console.error(`[Casino] JSON parse error: ${parseErr.message}`);
          }
        } else {
          console.log(`[Casino] No usersClass JSON found in HTML. Preview: ${html.substring(0, 300)}`);
        }

        const hasUsers = userCount > 0;
        return {
          success: true,
          message: hasUsers ? `Conexion exitosa — ${userCount} usuarios encontrados` : 'Login ok pero no se encontraron usuarios',
          details: {
            loginOk: true,
            cajaAccess: hasUsers,
            cajaId: this.cajaId,
            userCount,
            sampleUsers: userLogins,
            htmlLength: html.length,
            hasUsersClassJson: !!jsonMatch,
          },
        };
      } catch (err: any) {
        return { success: true, message: `Login ok, error al acceder a caja: ${err.message}`, details: { loginOk: true, cajaAccess: false } };
      }
    }

    return { success: true, message: 'Login exitoso (sin cajaId configurado)', details: { loginOk: true, cajaId: 'NOT SET' } };
  }

  private generateUsername(nombre: string, telefono: string): string {
    const cleanName = nombre.toLowerCase().trim().split(' ')[0]
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const phoneDigits = telefono.replace(/\D/g, '');
    const lastDigits = phoneDigits.slice(-6) || Math.random().toString().slice(2, 8);
    return `${cleanName || 'user'}${lastDigits}`;
  }

  private generateStrongPassword(length = 10): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$';
    let pw = '';
    pw += upper[Math.floor(Math.random() * upper.length)];
    pw += lower[Math.floor(Math.random() * lower.length)];
    pw += digits[Math.floor(Math.random() * digits.length)];
    pw += special[Math.floor(Math.random() * special.length)];
    const all = upper + lower + digits;
    for (let i = pw.length; i < length; i++) pw += all[Math.floor(Math.random() * all.length)];
    return pw.split('').sort(() => Math.random() - 0.5).join('');
  }

  private parseAmount(val: string | number | undefined): number {
    if (val === undefined || val === null) return 0;
    const str = String(val).replace(/,/g, '');
    return parseFloat(str) || 0;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const casinoService = new CasinoService();
