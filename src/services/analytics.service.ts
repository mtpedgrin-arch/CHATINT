import { dataService } from './data.service';
import type { ActivityLog, Client, Payment } from './data.service';

interface CachedResult {
  data: any;
  timestamp: number;
}

// ── ARGENTINA TIMEZONE HELPERS (UTC-3) ────────────────
const AR_OFFSET = -3; // Argentina is UTC-3

/** Convert a UTC ISO string to Argentina date string (YYYY-MM-DD) */
function toArgDate(isoStr: string): string {
  const d = new Date(isoStr);
  d.setHours(d.getHours() + AR_OFFSET);
  return d.toISOString().split('T')[0];
}

/** Get current Argentina date string (YYYY-MM-DD) */
function argToday(): string {
  const now = new Date();
  now.setHours(now.getHours() + AR_OFFSET);
  return now.toISOString().split('T')[0];
}

/** Get current Argentina time as Date object */
function argNow(): Date {
  const now = new Date();
  now.setHours(now.getHours() + AR_OFFSET);
  return now;
}

/** Get hour in Argentina timezone (0-23) from a UTC ISO string */
function toArgHour(isoStr: string): number {
  const d = new Date(isoStr);
  // getUTCHours + offset, wrap around 0-23
  let h = d.getUTCHours() + AR_OFFSET;
  if (h < 0) h += 24;
  if (h >= 24) h -= 24;
  return h;
}

/** Convert Argentina date bounds to UTC ISO for filtering
 *  e.g. "2026-03-11" → start: "2026-03-11T03:00:00.000Z", end: "2026-03-12T02:59:59.999Z"
 */
function argDayToUtcBounds(dateStr: string): { start: string; end: string } {
  // Argentina midnight = UTC 03:00
  return {
    start: dateStr + 'T03:00:00.000Z',
    end: new Date(new Date(dateStr + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
  };
}

class AnalyticsService {
  private cache: Map<string, CachedResult> = new Map();
  private CACHE_TTL = 60000; // 60 seconds

  private getCached(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  // ── OVERVIEW KPIs ──────────────────────────
  getOverview() {
    const cacheKey = 'overview';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const today = argToday();
    const clients = dataService.getClients();
    const activities = dataService.getAllActivities();
    const payments = dataService.getPayments();

    // DAU - unique clients active today (Argentina time)
    const todayActivities = activities.filter(a => toArgDate(a.timestamp) === today);
    const dauSet = new Set(todayActivities.map(a => a.clientId));
    const dau = dauSet.size;

    // Revenue today (Argentina time)
    const todayPayments = payments.filter(p => toArgDate(p.createdAt) === today && p.status === 'approved');
    const depositsToday = todayPayments.filter(p => p.type === 'deposit').reduce((s, p) => s + p.amount, 0);
    const withdrawalsToday = todayPayments.filter(p => p.type === 'withdrawal').reduce((s, p) => s + p.amount, 0);
    const revenueToday = depositsToday - withdrawalsToday;

    // Active sessions (logins in last 30 min)
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const recentLogins = activities.filter(a =>
      a.action === 'login' && a.timestamp >= thirtyMinAgo
    );
    const activeSessions = new Set(recentLogins.map(a => a.clientId)).size;

    // New clients today (Argentina time)
    const newToday = clients.filter(c => toArgDate(c.createdAt) === today).length;

    // Total clients
    const totalClients = clients.length;
    const activeClients = clients.filter(c => c.estado === 'activo').length;
    const vipClients = clients.filter(c => c.vip).length;

    // Push notification stats
    const pushSubs = dataService.getPushSubscriptions();
    const clientsWithPush = new Set(pushSubs.filter(s => s.clientId).map(s => s.clientId)).size;
    const clientsWithoutPush = totalClients - clientsWithPush;
    const pushAdoptionRate = totalClients > 0 ? Math.round((clientsWithPush / totalClients) * 100) : 0;

    // Push tracking stats
    const trackingStats = dataService.getPushTrackingStats();

    const result = {
      dau,
      revenueToday,
      depositsToday,
      withdrawalsToday,
      activeSessions,
      newToday,
      totalClients,
      activeClients,
      vipClients,
      totalActivitiesToday: todayActivities.length,
      pushStats: {
        subscribed: clientsWithPush,
        notSubscribed: clientsWithoutPush,
        adoptionRate: pushAdoptionRate,
        totalSubscriptions: pushSubs.length,
      },
      pushTracking: trackingStats,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── ACTIVE USERS SERIES ────────────────────
  getActiveUsers(from: string, to: string, period: 'day' | 'week' | 'month' = 'day') {
    const cacheKey = `active-users-${from}-${to}-${period}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const activities = dataService.getAllActivities();
    const clients = dataService.getClients();

    // Generate date range
    const dates = this.generateDateRange(from, to, period);
    const series = dates.map(dateStr => {
      const { start, end } = this.getPeriodBounds(dateStr, period);
      const periodActivities = activities.filter(a => {
        const t = a.timestamp;
        return t >= start && t <= end;
      });
      const uniqueClients = new Set(periodActivities.map(a => a.clientId));
      return {
        date: dateStr,
        activeUsers: uniqueClients.size,
        logins: periodActivities.filter(a => a.action === 'login').length,
        messages: periodActivities.filter(a => a.action === 'chat_message').length,
      };
    });

    // WAU & MAU
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const wauSet = new Set(activities.filter(a => a.timestamp >= weekAgo).map(a => a.clientId));
    const mauSet = new Set(activities.filter(a => a.timestamp >= monthAgo).map(a => a.clientId));

    const result = {
      series,
      wau: wauSet.size,
      mau: mauSet.size,
      totalClients: clients.length,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── TOP USERS ──────────────────────────────
  getTopUsers(limit = 10, metric: 'activity' | 'deposits' = 'activity', from?: string, to?: string) {
    const cacheKey = `top-users-${limit}-${metric}-${from}-${to}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const clients = dataService.getClients();
    const activities = dataService.getAllActivities();
    const payments = dataService.getPayments();

    if (metric === 'activity') {
      // Count activities per client
      const activityCount: Record<number, number> = {};
      const filteredActivities = (from && to)
        ? activities.filter(a => a.timestamp >= from && a.timestamp <= to)
        : activities;

      filteredActivities.forEach(a => {
        activityCount[a.clientId] = (activityCount[a.clientId] || 0) + 1;
      });

      const ranked = Object.entries(activityCount)
        .map(([id, count]) => {
          const client = clients.find(c => c.id === Number(id));
          const lastLogin = filteredActivities
            .filter(a => a.clientId === Number(id) && a.action === 'login')
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
          return {
            clientId: Number(id),
            nombre: client?.nombre || 'Desconocido',
            usuario: client?.usuario || '',
            vip: client?.vip || false,
            totalActions: count,
            lastLogin: lastLogin?.timestamp || client?.lastActivity || '',
            totalDepositos: client?.totalDepositos || 0,
          };
        })
        .sort((a, b) => b.totalActions - a.totalActions)
        .slice(0, limit);

      this.setCache(cacheKey, ranked);
      return ranked;

    } else {
      // Top by deposits
      const ranked = clients
        .filter(c => c.totalDepositos > 0)
        .map(c => ({
          clientId: c.id,
          nombre: c.nombre,
          usuario: c.usuario,
          vip: c.vip,
          totalDepositos: c.totalDepositos,
          totalRetiros: c.totalRetiros,
          balance: c.balance,
          lastActivity: c.lastActivity,
        }))
        .sort((a, b) => b.totalDepositos - a.totalDepositos)
        .slice(0, limit);

      this.setCache(cacheKey, ranked);
      return ranked;
    }
  }

  // ── USER DETAIL ────────────────────────────
  getUserDetail(clientId: number) {
    const client = dataService.getClientById(clientId);
    if (!client) return null;

    const activities = dataService.getActivitiesByClient(clientId, 200);
    const payments = dataService.getPaymentsByClient(clientId);
    const chats = dataService.getChats({ archived: undefined });
    const clientChats = chats.filter(c => c.clientId === clientId);

    // Activity breakdown
    const actionCounts: Record<string, number> = {};
    activities.forEach(a => {
      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    });

    // Daily activity for last 30 days (Argentina time)
    const today = argToday();
    const dailyActivity: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = activities.filter(a => toArgDate(a.timestamp) === dateStr).length;
      dailyActivity.push({ date: dateStr, count });
    }

    // Session frequency (Argentina dates)
    const loginDates = new Set(
      activities
        .filter(a => a.action === 'login')
        .map(a => toArgDate(a.timestamp))
    );
    const daysActive = loginDates.size;
    const firstActivity = activities.length > 0 ? activities[activities.length - 1].timestamp : client.createdAt;
    const now = new Date();
    const daysSinceFirst = Math.max(1, Math.ceil((now.getTime() - new Date(firstActivity).getTime()) / (24 * 60 * 60 * 1000)));
    const sessionFrequency = daysActive / Math.min(daysSinceFirst, 30); // sessions per day avg

    return {
      client,
      actionCounts,
      dailyActivity,
      totalActivities: activities.length,
      recentActivities: activities.slice(0, 50),
      payments: {
        total: payments.length,
        approved: payments.filter(p => p.status === 'approved').length,
        totalDeposited: payments.filter(p => p.type === 'deposit' && p.status === 'approved').reduce((s, p) => s + p.amount, 0),
        totalWithdrawn: payments.filter(p => p.type === 'withdrawal' && p.status === 'approved').reduce((s, p) => s + p.amount, 0),
        recent: payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
      },
      chats: clientChats.length,
      daysActive,
      sessionFrequency: Math.round(sessionFrequency * 100) / 100,
      memberSince: client.createdAt,
    };
  }

  // ── FINANCIAL ──────────────────────────────
  getFinancial(from: string, to: string, period: 'day' | 'week' | 'month' = 'day') {
    const cacheKey = `financial-${from}-${to}-${period}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const payments = dataService.getPayments().filter(p => p.status === 'approved');
    const dates = this.generateDateRange(from, to, period);

    const series = dates.map(dateStr => {
      const { start, end } = this.getPeriodBounds(dateStr, period);
      const periodPayments = payments.filter(p => p.processedAt && p.processedAt >= start && p.processedAt <= end);
      const deposits = periodPayments.filter(p => p.type === 'deposit').reduce((s, p) => s + p.amount, 0);
      const withdrawals = periodPayments.filter(p => p.type === 'withdrawal').reduce((s, p) => s + p.amount, 0);
      return {
        date: dateStr,
        deposits,
        withdrawals,
        net: deposits - withdrawals,
        count: periodPayments.length,
      };
    });

    // Totals — use Argentina day bounds for the range
    const rangeStart = from + 'T03:00:00.000Z'; // Argentina midnight = UTC 03:00
    const rangeEnd = new Date(new Date(to + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();
    const allInRange = payments.filter(p => p.processedAt && p.processedAt >= rangeStart && p.processedAt <= rangeEnd);
    const totalDeposits = allInRange.filter(p => p.type === 'deposit').reduce((s, p) => s + p.amount, 0);
    const totalWithdrawals = allInRange.filter(p => p.type === 'withdrawal').reduce((s, p) => s + p.amount, 0);
    const avgDeposit = allInRange.filter(p => p.type === 'deposit').length > 0
      ? totalDeposits / allInRange.filter(p => p.type === 'deposit').length : 0;

    const result = {
      series,
      totalDeposits,
      totalWithdrawals,
      netRevenue: totalDeposits - totalWithdrawals,
      avgDeposit: Math.round(avgDeposit),
      totalTransactions: allInRange.length,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── RETENTION COHORTS ──────────────────────
  getRetention() {
    const cacheKey = 'retention';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const clients = dataService.getClients();
    const activities = dataService.getAllActivities();
    const now = new Date();

    // Build weekly cohorts (last 8 weeks)
    const cohorts: { weekLabel: string; weekStart: string; totalUsers: number; retention: number[] }[] = [];

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekStartStr = toArgDate(weekStart.toISOString());
      const weekEndStr = toArgDate(weekEnd.toISOString());

      // Users who registered in this week (Argentina time)
      const cohortUsers = clients.filter(c => {
        const d = toArgDate(c.createdAt);
        return d >= weekStartStr && d < weekEndStr;
      });

      if (cohortUsers.length === 0) {
        cohorts.push({
          weekLabel: weekStartStr,
          weekStart: weekStartStr,
          totalUsers: 0,
          retention: [],
        });
        continue;
      }

      const cohortIds = new Set(cohortUsers.map(c => c.id));
      const retention: number[] = [];

      // Check subsequent weeks
      for (let sw = 1; sw <= 7 - w; sw++) {
        const checkStart = new Date(weekEnd);
        checkStart.setDate(checkStart.getDate() + (sw - 1) * 7);
        const checkEnd = new Date(checkStart);
        checkEnd.setDate(checkEnd.getDate() + 7);

        if (checkStart > now) break;

        const checkStartStr = checkStart.toISOString();
        const checkEndStr = checkEnd.toISOString();

        const activeInWeek = new Set(
          activities
            .filter(a => cohortIds.has(a.clientId) && a.timestamp >= checkStartStr && a.timestamp < checkEndStr)
            .map(a => a.clientId)
        );

        retention.push(Math.round((activeInWeek.size / cohortUsers.length) * 100));
      }

      cohorts.push({
        weekLabel: weekStartStr,
        weekStart: weekStartStr,
        totalUsers: cohortUsers.length,
        retention,
      });
    }

    this.setCache(cacheKey, cohorts);
    return cohorts;
  }

  // ── FUNNEL ─────────────────────────────────
  getFunnel() {
    const cacheKey = 'funnel';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const clients = dataService.getClients();
    const payments = dataService.getPayments().filter(p => p.status === 'approved');

    const registered = clients.length;
    const withDeposit = new Set(payments.filter(p => p.type === 'deposit' && p.clientId).map(p => p.clientId)).size;

    // Recurrent: clients with 2+ approved deposits
    const depositCounts: Record<number, number> = {};
    payments.filter(p => p.type === 'deposit' && p.clientId).forEach(p => {
      depositCounts[p.clientId!] = (depositCounts[p.clientId!] || 0) + 1;
    });
    const recurrent = Object.values(depositCounts).filter(c => c >= 2).length;

    const vip = clients.filter(c => c.vip).length;

    const result = {
      steps: [
        { name: 'Registrados', value: registered, percent: 100 },
        { name: 'Primer Deposito', value: withDeposit, percent: registered > 0 ? Math.round((withDeposit / registered) * 100) : 0 },
        { name: 'Recurrentes', value: recurrent, percent: registered > 0 ? Math.round((recurrent / registered) * 100) : 0 },
        { name: 'VIP', value: vip, percent: registered > 0 ? Math.round((vip / registered) * 100) : 0 },
      ],
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── SEGMENTS ───────────────────────────────
  getSegments() {
    const cacheKey = 'segments';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const clients = dataService.getClients();
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const newClients = clients.filter(c => c.createdAt >= sevenDaysAgo).length;
    const active = clients.filter(c => c.lastActivity >= sevenDaysAgo && c.createdAt < sevenDaysAgo).length;
    const atRisk = clients.filter(c => c.lastActivity < sevenDaysAgo && c.lastActivity >= thirtyDaysAgo).length;
    const inactive = clients.filter(c => c.lastActivity < thirtyDaysAgo).length;
    const vip = clients.filter(c => c.vip).length;
    const blocked = clients.filter(c => c.estado === 'bloqueado').length;

    const result = {
      segments: [
        { name: 'Nuevos (7d)', value: newClients, color: '#00b894' },
        { name: 'Activos', value: active, color: '#6c5ce7' },
        { name: 'En Riesgo', value: atRisk, color: '#fdcb6e' },
        { name: 'Inactivos', value: inactive, color: '#d63031' },
        { name: 'VIP', value: vip, color: '#e17055' },
        { name: 'Bloqueados', value: blocked, color: '#636e72' },
      ],
      total: clients.length,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── PEAK HOURS (Argentina timezone) ─────────
  getPeakHours(from?: string, to?: string) {
    const cacheKey = `peak-hours-${from}-${to}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const activities = dataService.getAllActivities();
    const filtered = (from && to)
      ? activities.filter(a => a.timestamp >= from + 'T03:00:00.000Z' && a.timestamp <= new Date(new Date(to + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString())
      : activities;

    const hourCounts = new Array(24).fill(0);
    filtered.forEach(a => {
      const hour = toArgHour(a.timestamp);
      hourCounts[hour]++;
    });

    const result = hourCounts.map((count, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      hourNum: hour,
      activities: count,
    }));

    this.setCache(cacheKey, result);
    return result;
  }

  // ── ENGAGEMENT ─────────────────────────────
  getEngagement(from?: string, to?: string) {
    const cacheKey = `engagement-${from}-${to}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const activities = dataService.getAllActivities();
    const clients = dataService.getClients();
    const events = dataService.getEvents();
    const entries = events.flatMap(e => dataService.getEventEntries(e.id));

    const filtered = (from && to)
      ? activities.filter(a => a.timestamp >= from + 'T03:00:00.000Z' && a.timestamp <= new Date(new Date(to + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString())
      : activities;

    // Messages per user
    const msgActivities = filtered.filter(a => a.action === 'chat_message');
    const msgUsers = new Set(msgActivities.map(a => a.clientId));
    const avgMsgsPerUser = msgUsers.size > 0 ? Math.round(msgActivities.length / msgUsers.size * 10) / 10 : 0;

    // Event participation
    const totalEventsRun = events.filter(e => e.status !== 'draft').length;
    const totalEntries = entries.length;
    const qualifiedEntries = entries.filter(e => e.qualified).length;

    // Push stats from notifications
    const notifications = dataService.getSentNotifications();
    const totalPushSent = notifications.reduce((s, n) => s + n.deliveredCount, 0);

    const result = {
      totalMessages: msgActivities.length,
      uniqueMessengers: msgUsers.size,
      avgMsgsPerUser,
      totalEventsRun,
      totalEventEntries: totalEntries,
      qualifiedEntries,
      eventParticipationRate: clients.length > 0 ? Math.round((new Set(entries.map(e => e.clientId)).size / clients.length) * 100) : 0,
      totalPushSent,
      totalNotifications: notifications.length,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── SESSIONS ───────────────────────────────
  getSessions(from?: string, to?: string) {
    const cacheKey = `sessions-${from}-${to}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const activities = dataService.getAllActivities();
    const filtered = (from && to)
      ? activities.filter(a => a.timestamp >= from + 'T03:00:00.000Z' && a.timestamp <= new Date(new Date(to + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString())
      : activities;

    const logins = filtered.filter(a => a.action === 'login' || a.action === 'session_start');

    // Unique sessions per day (Argentina dates)
    const sessionsByDay: Record<string, Set<number>> = {};
    logins.forEach(a => {
      const day = toArgDate(a.timestamp);
      if (!sessionsByDay[day]) sessionsByDay[day] = new Set();
      sessionsByDay[day].add(a.clientId);
    });

    const days = Object.keys(sessionsByDay).length;
    const totalSessions = logins.length;
    const uniqueSessionUsers = new Set(logins.map(a => a.clientId)).size;
    const avgSessionsPerDay = days > 0 ? Math.round(totalSessions / days * 10) / 10 : 0;
    const avgSessionsPerUser = uniqueSessionUsers > 0 ? Math.round(totalSessions / uniqueSessionUsers * 10) / 10 : 0;

    const result = {
      totalSessions,
      uniqueSessionUsers,
      avgSessionsPerDay,
      avgSessionsPerUser,
      sessionsByDay: Object.entries(sessionsByDay).map(([date, users]) => ({
        date,
        sessions: users.size,
      })).sort((a, b) => a.date.localeCompare(b.date)),
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ── DAILY CLEANUP ──────────────────────────
  runDailyCleanup() {
    const removed = dataService.cleanupOldActivities(30);
    console.log(`[Analytics] Daily cleanup: removed ${removed} activity logs older than 30 days`);
    return removed;
  }

  // ── HELPERS ────────────────────────────────
  private generateDateRange(from: string, to: string, period: 'day' | 'week' | 'month'): string[] {
    const dates: string[] = [];
    // Use noon to avoid DST edge cases
    const start = new Date(from + 'T12:00:00');
    const end = new Date(to + 'T12:00:00');

    if (period === 'day') {
      const current = new Date(start);
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    } else if (period === 'week') {
      const current = new Date(start);
      // Align to Monday
      current.setDate(current.getDate() - current.getDay() + 1);
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 7);
      }
    } else {
      const current = new Date(start);
      current.setDate(1);
      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setMonth(current.getMonth() + 1);
      }
    }

    return dates;
  }

  private getPeriodBounds(dateStr: string, period: 'day' | 'week' | 'month'): { start: string; end: string } {
    if (period === 'day') {
      // Argentina day: midnight AR = 03:00 UTC
      return argDayToUtcBounds(dateStr);
    } else if (period === 'week') {
      const end = new Date(dateStr + 'T12:00:00');
      end.setDate(end.getDate() + 6);
      const endStr = end.toISOString().split('T')[0];
      return {
        start: dateStr + 'T03:00:00.000Z',
        end: new Date(new Date(endStr + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
      };
    } else {
      const end = new Date(dateStr + 'T12:00:00');
      end.setMonth(end.getMonth() + 1);
      end.setDate(0); // last day of month
      const endStr = end.toISOString().split('T')[0];
      return {
        start: dateStr + 'T03:00:00.000Z',
        end: new Date(new Date(endStr + 'T03:00:00.000Z').getTime() + 24 * 60 * 60 * 1000 - 1).toISOString(),
      };
    }
  }
}

export const analyticsService = new AnalyticsService();
