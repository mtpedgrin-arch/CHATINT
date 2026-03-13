import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  getAnalyticsOverview, getAnalyticsActiveUsers, getAnalyticsTopUsers,
  getAnalyticsFinancial, getAnalyticsRetention, getAnalyticsFunnel,
  getAnalyticsSegments, getAnalyticsPeakHours, getAnalyticsEngagement,
  getAnalyticsSessions, getAnalyticsUserDetail
} from '../api';

const TABS = [
  { id: 'general', label: 'General', icon: '📊' },
  { id: 'financiero', label: 'Financiero', icon: '💰' },
  { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  { id: 'retencion', label: 'Retencion', icon: '🔄' },
  { id: 'engagement', label: 'Engagement', icon: '🎯' },
];

const COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#d63031', '#e17055', '#636e72', '#0984e3', '#a29bfe'];

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n?.toLocaleString() || '0';
}

function formatMoney(n) {
  return '$' + (n || 0).toLocaleString();
}

// Date helpers — Argentina timezone (UTC-3)
function toArgDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function toArgDateTime(date) {
  const d = new Date(date);
  return d.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function getDaysAgo(days) {
  // Get Argentina "today" then subtract days
  const now = new Date();
  const arStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // YYYY-MM-DD format
  const d = new Date(arStr + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function getToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// ── KPI Card ──
function KPICard({ label, value, icon, color = '#6c5ce7', sub }) {
  return (
    <div style={styles.kpiCard}>
      <div style={{ ...styles.kpiIcon, background: color + '22', color }}>{icon}</div>
      <div>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiLabel}>{label}</div>
        {sub && <div style={styles.kpiSub}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Main Component ──
export default function Analytics() {
  const [tab, setTab] = useState('general');
  const [dateRange, setDateRange] = useState({ from: getDaysAgo(30), to: getToday() });
  const [loading, setLoading] = useState(false);

  // Data states
  const [overview, setOverview] = useState(null);
  const [activeUsers, setActiveUsers] = useState(null);
  const [segments, setSegments] = useState(null);
  const [peakHours, setPeakHours] = useState(null);
  const [financial, setFinancial] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [topActive, setTopActive] = useState([]);
  const [topDeposits, setTopDeposits] = useState([]);
  const [sessions, setSessions] = useState(null);
  const [retention, setRetention] = useState([]);
  const [engagement, setEngagement] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = dateRange;
      if (tab === 'general') {
        const [ov, au, seg, ph] = await Promise.all([
          getAnalyticsOverview(),
          getAnalyticsActiveUsers(from, to, 'day'),
          getAnalyticsSegments(),
          getAnalyticsPeakHours(from, to),
        ]);
        setOverview(ov);
        setActiveUsers(au);
        setSegments(seg);
        setPeakHours(ph);
      } else if (tab === 'financiero') {
        const [fin, fun] = await Promise.all([
          getAnalyticsFinancial(from, to, 'day'),
          getAnalyticsFunnel(),
        ]);
        setFinancial(fin);
        setFunnel(fun);
      } else if (tab === 'usuarios') {
        const [ta, td, ses] = await Promise.all([
          getAnalyticsTopUsers(10, 'activity', from, to),
          getAnalyticsTopUsers(10, 'deposits', from, to),
          getAnalyticsSessions(from, to),
        ]);
        setTopActive(ta);
        setTopDeposits(td);
        setSessions(ses);
      } else if (tab === 'retencion') {
        const ret = await getAnalyticsRetention();
        setRetention(ret);
      } else if (tab === 'engagement') {
        const [eng, ses] = await Promise.all([
          getAnalyticsEngagement(from, to),
          getAnalyticsSessions(from, to),
        ]);
        setEngagement(eng);
        setSessions(ses);
      }
    } catch (e) {
      console.error('Analytics load error:', e);
    }
    setLoading(false);
  }, [tab, dateRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadUserDetail = async (clientId) => {
    setSelectedUser(clientId);
    try {
      const data = await getAnalyticsUserDetail(clientId);
      setUserDetail(data);
    } catch (e) {
      console.error('User detail error:', e);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedUser(null); }}
              style={tab === t.id ? { ...styles.tab, ...styles.tabActive } : styles.tab}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div style={styles.dateRange}>
          <input type="date" value={dateRange.from} onChange={e => setDateRange(p => ({ ...p, from: e.target.value }))} style={styles.dateInput} />
          <span style={{ color: '#888' }}>→</span>
          <input type="date" value={dateRange.to} onChange={e => setDateRange(p => ({ ...p, to: e.target.value }))} style={styles.dateInput} />
          <button onClick={loadData} style={styles.refreshBtn}>🔄</button>
        </div>
      </div>

      {loading && <div style={styles.loading}>Cargando datos...</div>}

      {/* Tab Content */}
      {tab === 'general' && <GeneralTab overview={overview} activeUsers={activeUsers} segments={segments} peakHours={peakHours} />}
      {tab === 'financiero' && <FinancieroTab financial={financial} funnel={funnel} />}
      {tab === 'usuarios' && !selectedUser && <UsuariosTab topActive={topActive} topDeposits={topDeposits} sessions={sessions} onSelectUser={loadUserDetail} />}
      {tab === 'usuarios' && selectedUser && <UserDetailView data={userDetail} onBack={() => setSelectedUser(null)} />}
      {tab === 'retencion' && <RetencionTab retention={retention} />}
      {tab === 'engagement' && <EngagementTab engagement={engagement} sessions={sessions} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB: GENERAL
// ════════════════════════════════════════════════════════
function GeneralTab({ overview, activeUsers, segments, peakHours }) {
  if (!overview) return null;
  return (
    <div>
      {/* KPI Cards */}
      <div style={styles.kpiRow}>
        <KPICard label="Usuarios Activos Hoy" value={overview.dau} icon="👥" color="#6c5ce7" />
        <KPICard label="Revenue Hoy" value={formatMoney(overview.revenueToday)} icon="💰" color="#00b894" sub={`Dep: ${formatMoney(overview.depositsToday)} | Ret: ${formatMoney(overview.withdrawalsToday)}`} />
        <KPICard label="Sesiones Activas" value={overview.activeSessions} icon="🔗" color="#0984e3" />
        <KPICard label="Nuevos Hoy" value={overview.newToday} icon="🆕" color="#e17055" sub={`Total: ${overview.totalClients} | VIP: ${overview.vipClients}`} />
      </div>

      {/* Push Notification Stats */}
      {overview.pushStats && (
        <div style={{ ...styles.chartCard, marginBottom: 12 }}>
          <h3 style={styles.chartTitle}>🔔 Push Notifications</h3>
          {/* Adoption bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#888', fontSize: 13 }}>Adopción:</span>
              <div style={{ width: 200, height: 18, background: 'rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ width: `${overview.pushStats.adoptionRate}%`, height: '100%', background: 'linear-gradient(90deg, #6c5ce7, #a29bfe)', borderRadius: 10, transition: 'width 0.5s' }} />
              </div>
              <span style={{ color: '#a29bfe', fontWeight: 700, fontSize: 16 }}>{overview.pushStats.adoptionRate}%</span>
            </div>
            <span style={styles.metricBadge}>🔔 Activadas: {overview.pushStats.subscribed}</span>
            <span style={{ ...styles.metricBadge, background: 'rgba(214,48,49,0.15)', color: '#ff7675' }}>🔕 Sin activar: {overview.pushStats.notSubscribed}</span>
            <span style={{ ...styles.metricBadge, background: 'rgba(0,184,148,0.15)', color: '#55efc4' }}>📱 Dispositivos: {overview.pushStats.totalSubscriptions}</span>
          </div>
          {/* Tracking stats */}
          {overview.pushTracking && (
            <div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ background: 'rgba(108,92,231,0.12)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#a29bfe' }}>{overview.pushTracking.totalBannerShown}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Banner mostrado</div>
                </div>
                <div style={{ background: 'rgba(0,184,148,0.12)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#55efc4' }}>{overview.pushTracking.totalAccepted}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Aceptaron push</div>
                </div>
                <div style={{ background: 'rgba(214,48,49,0.12)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ff7675' }}>{overview.pushTracking.totalDismissed}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Cerraron banner</div>
                </div>
                <div style={{ background: 'rgba(253,121,168,0.12)', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fd79a8' }}>{overview.pushTracking.totalDenied}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>Bloquearon (browser)</div>
                </div>
              </div>
              {/* PWA Install stats */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: 13, fontWeight: 600 }}>📲 PWA App:</span>
                <div style={{ background: 'rgba(0,184,148,0.12)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#55efc4' }}>{overview.pushTracking.totalPwaInstalled}</span>
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>instalaron</span>
                </div>
                <div style={{ background: 'rgba(214,48,49,0.12)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#ff7675' }}>{overview.pushTracking.totalPwaDismissed}</span>
                  <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>rechazaron</span>
                </div>
                {overview.pushTracking.totalPwaInstalled > 0 && (
                  <span style={{ color: '#55efc4', fontSize: 13 }}>
                    ({Math.round((overview.pushTracking.totalPwaInstalled / (overview.pushTracking.totalPwaInstalled + overview.pushTracking.totalPwaDismissed)) * 100) || 0}% conversion)
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div style={styles.chartsRow}>
        {/* Active Users Line Chart */}
        <div style={{ ...styles.chartCard, flex: 2 }}>
          <h3 style={styles.chartTitle}>Usuarios Activos - Ultimos 30 dias</h3>
          {activeUsers?.series && (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={activeUsers.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip contentStyle={styles.tooltip} labelFormatter={d => `Fecha: ${d}`} />
                <Legend />
                <Line type="monotone" dataKey="activeUsers" stroke="#6c5ce7" strokeWidth={2} name="Activos" dot={false} />
                <Line type="monotone" dataKey="logins" stroke="#00b894" strokeWidth={2} name="Logins" dot={false} />
                <Line type="monotone" dataKey="messages" stroke="#fdcb6e" strokeWidth={1} name="Mensajes" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {activeUsers && (
            <div style={styles.metricRow}>
              <span style={styles.metricBadge}>WAU: {activeUsers.wau}</span>
              <span style={styles.metricBadge}>MAU: {activeUsers.mau}</span>
              <span style={styles.metricBadge}>Total: {activeUsers.totalClients}</span>
            </div>
          )}
        </div>

        {/* Segments Pie Chart */}
        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Segmentos de Usuarios</h3>
          {segments?.segments && (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={segments.segments.filter(s => s.value > 0)}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={90}
                  dataKey="value" nameKey="name"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {segments.segments.filter(s => s.value > 0).map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={styles.tooltip} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Peak Hours */}
      <div style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Horas Pico de Actividad</h3>
        {peakHours && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={peakHours}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="hour" tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip contentStyle={styles.tooltip} />
              <Bar dataKey="activities" fill="#6c5ce7" name="Actividades" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB: FINANCIERO
// ════════════════════════════════════════════════════════
function FinancieroTab({ financial, funnel }) {
  if (!financial) return null;
  return (
    <div>
      {/* KPI Cards */}
      <div style={styles.kpiRow}>
        <KPICard label="Total Depositos" value={formatMoney(financial.totalDeposits)} icon="📥" color="#00b894" />
        <KPICard label="Total Retiros" value={formatMoney(financial.totalWithdrawals)} icon="📤" color="#d63031" />
        <KPICard label="Revenue Neto" value={formatMoney(financial.netRevenue)} icon="💎" color="#6c5ce7" />
        <KPICard label="Deposito Promedio" value={formatMoney(financial.avgDeposit)} icon="📊" color="#0984e3" sub={`${financial.totalTransactions} transacciones`} />
      </div>

      {/* Deposits vs Withdrawals */}
      <div style={styles.chartsRow}>
        <div style={{ ...styles.chartCard, flex: 2 }}>
          <h3 style={styles.chartTitle}>Depositos vs Retiros</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={financial.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => formatMoney(v)} />
              <Tooltip contentStyle={styles.tooltip} formatter={v => formatMoney(v)} />
              <Legend />
              <Bar dataKey="deposits" fill="#00b894" name="Depositos" radius={[4, 4, 0, 0]} />
              <Bar dataKey="withdrawals" fill="#d63031" name="Retiros" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Net Revenue Area */}
        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Revenue Neto (Tendencia)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={financial.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={d => d.slice(8)} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} tickFormatter={v => formatMoney(v)} />
              <Tooltip contentStyle={styles.tooltip} formatter={v => formatMoney(v)} />
              <Area type="monotone" dataKey="net" stroke="#6c5ce7" fill="#6c5ce740" name="Neto" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Funnel */}
      {funnel && (
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Funnel de Conversion</h3>
          <div style={styles.funnelContainer}>
            {funnel.steps.map((step, i) => (
              <div key={i} style={styles.funnelStep}>
                <div style={{
                  ...styles.funnelBar,
                  width: `${Math.max(step.percent, 5)}%`,
                  background: COLORS[i],
                }}>
                  <span style={styles.funnelBarText}>{step.name}: {step.value} ({step.percent}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB: USUARIOS
// ════════════════════════════════════════════════════════
function UsuariosTab({ topActive, topDeposits, sessions, onSelectUser }) {
  return (
    <div>
      {/* Session KPIs */}
      {sessions && (
        <div style={styles.kpiRow}>
          <KPICard label="Total Sesiones" value={sessions.totalSessions} icon="🔗" color="#6c5ce7" />
          <KPICard label="Usuarios Unicos" value={sessions.uniqueSessionUsers} icon="👤" color="#00b894" />
          <KPICard label="Sesiones/Dia" value={sessions.avgSessionsPerDay} icon="📅" color="#0984e3" />
          <KPICard label="Sesiones/Usuario" value={sessions.avgSessionsPerUser} icon="📊" color="#e17055" />
        </div>
      )}

      <div style={styles.chartsRow}>
        {/* Top Active */}
        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Top 10 Mas Activos</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Usuario</th>
                <th style={styles.th}>Acciones</th>
                <th style={styles.th}>Ultimo Login</th>
              </tr>
            </thead>
            <tbody>
              {topActive.map((u, i) => (
                <tr key={u.clientId} style={styles.tr} onClick={() => onSelectUser(u.clientId)}>
                  <td style={styles.td}>{i + 1}</td>
                  <td style={styles.td}>
                    {u.nombre} {u.vip && <span style={styles.vipBadge}>VIP</span>}
                  </td>
                  <td style={styles.td}>{u.usuario}</td>
                  <td style={styles.td}><strong>{u.totalActions}</strong></td>
                  <td style={styles.td}>{u.lastLogin ? toArgDate(u.lastLogin) : '-'}</td>
                </tr>
              ))}
              {topActive.length === 0 && <tr><td style={styles.td} colSpan={5}>Sin datos de actividad</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Top Depositors */}
        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Top 10 High Rollers</h3>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Nombre</th>
                <th style={styles.th}>Depositos</th>
                <th style={styles.th}>Retiros</th>
                <th style={styles.th}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {topDeposits.map((u, i) => (
                <tr key={u.clientId} style={styles.tr} onClick={() => onSelectUser(u.clientId)}>
                  <td style={styles.td}>{i + 1}</td>
                  <td style={styles.td}>
                    {u.nombre} {u.vip && <span style={styles.vipBadge}>VIP</span>}
                  </td>
                  <td style={{ ...styles.td, color: '#00b894' }}>{formatMoney(u.totalDepositos)}</td>
                  <td style={{ ...styles.td, color: '#d63031' }}>{formatMoney(u.totalRetiros)}</td>
                  <td style={styles.td}>{formatMoney(u.balance)}</td>
                </tr>
              ))}
              {topDeposits.length === 0 && <tr><td style={styles.td} colSpan={5}>Sin datos de depositos</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// USER DETAIL VIEW
// ════════════════════════════════════════════════════════
function UserDetailView({ data, onBack }) {
  if (!data) return <div style={styles.loading}>Cargando detalle...</div>;
  const { client, actionCounts, dailyActivity, payments, daysActive, sessionFrequency } = data;

  return (
    <div>
      <button onClick={onBack} style={styles.backBtn}>← Volver a la lista</button>

      <div style={styles.userHeader}>
        <div style={styles.userAvatar}>{client.nombre?.charAt(0)?.toUpperCase() || '?'}</div>
        <div>
          <h2 style={{ color: '#fff', margin: 0 }}>{client.nombre} {client.vip && <span style={styles.vipBadge}>VIP</span>}</h2>
          <p style={{ color: '#888', margin: '4px 0' }}>@{client.usuario} | {client.telefono} | {client.estado}</p>
          <p style={{ color: '#666', margin: 0, fontSize: 12 }}>Miembro desde: {toArgDate(client.createdAt)}</p>
        </div>
      </div>

      <div style={styles.kpiRow}>
        <KPICard label="Dias Activo" value={daysActive} icon="📅" color="#6c5ce7" />
        <KPICard label="Sesiones/Dia" value={sessionFrequency} icon="🔗" color="#0984e3" />
        <KPICard label="Total Depositado" value={formatMoney(payments.totalDeposited)} icon="📥" color="#00b894" />
        <KPICard label="Total Retirado" value={formatMoney(payments.totalWithdrawn)} icon="📤" color="#d63031" />
      </div>

      {/* Activity breakdown */}
      <div style={styles.chartsRow}>
        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Actividad por Tipo</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}>
            {Object.entries(actionCounts).map(([action, count]) => (
              <div key={action} style={styles.actionBadge}>
                <span>{action}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...styles.chartCard, flex: 2 }}>
          <h3 style={styles.chartTitle}>Actividad Diaria (30 dias)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={d => d.slice(8)} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip contentStyle={styles.tooltip} />
              <Bar dataKey="count" fill="#6c5ce7" name="Actividades" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activities */}
      <div style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Actividad Reciente</h3>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {data.recentActivities?.slice(0, 20).map((a, i) => (
            <div key={i} style={styles.activityItem}>
              <span style={styles.activityAction}>{a.action}</span>
              <span style={styles.activityTime}>{toArgDateTime(a.timestamp)}</span>
              {a.metadata?.amount && <span style={styles.activityMeta}>{formatMoney(a.metadata.amount)}</span>}
            </div>
          ))}
          {(!data.recentActivities || data.recentActivities.length === 0) && (
            <p style={{ color: '#666', textAlign: 'center', padding: 20 }}>Sin actividad registrada</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB: RETENCION
// ════════════════════════════════════════════════════════
function RetencionTab({ retention }) {
  if (!retention || retention.length === 0) {
    return <div style={styles.chartCard}><p style={{ color: '#888', textAlign: 'center', padding: 40 }}>Sin datos de retencion. Se generan automaticamente con el tiempo.</p></div>;
  }

  const maxWeeks = Math.max(...retention.map(c => c.retention.length));

  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>Cohortes de Retencion Semanal</h3>
      <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
        Cada fila es una cohorte de usuarios registrados esa semana. Los valores muestran el % que volvio en semanas posteriores.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Cohorte</th>
              <th style={styles.th}>Usuarios</th>
              {Array.from({ length: maxWeeks }, (_, i) => (
                <th key={i} style={styles.th}>Sem {i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {retention.map((cohort, i) => (
              <tr key={i}>
                <td style={styles.td}>{cohort.weekLabel}</td>
                <td style={styles.td}><strong>{cohort.totalUsers}</strong></td>
                {Array.from({ length: maxWeeks }, (_, wi) => {
                  const val = cohort.retention[wi];
                  const bg = val === undefined ? 'transparent'
                    : val >= 60 ? '#00b89444'
                    : val >= 30 ? '#fdcb6e44'
                    : val > 0 ? '#d6303144'
                    : '#63636e22';
                  return (
                    <td key={wi} style={{ ...styles.td, background: bg, textAlign: 'center', fontWeight: 600 }}>
                      {val !== undefined ? `${val}%` : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// TAB: ENGAGEMENT
// ════════════════════════════════════════════════════════
function EngagementTab({ engagement, sessions }) {
  if (!engagement) return null;

  return (
    <div>
      <div style={styles.kpiRow}>
        <KPICard label="Mensajes Totales" value={engagement.totalMessages} icon="💬" color="#6c5ce7" />
        <KPICard label="Usuarios que Escriben" value={engagement.uniqueMessengers} icon="✍️" color="#00b894" />
        <KPICard label="Msgs/Usuario" value={engagement.avgMsgsPerUser} icon="📊" color="#0984e3" />
        <KPICard label="Push Enviados" value={engagement.totalPushSent} icon="🔔" color="#e17055" />
      </div>

      <div style={styles.chartsRow}>
        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Eventos</h3>
          <div style={styles.engagementGrid}>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.totalEventsRun}</div>
              <div style={styles.engagementLabel}>Eventos Realizados</div>
            </div>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.totalEventEntries}</div>
              <div style={styles.engagementLabel}>Inscripciones</div>
            </div>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.qualifiedEntries}</div>
              <div style={styles.engagementLabel}>Calificados</div>
            </div>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.eventParticipationRate}%</div>
              <div style={styles.engagementLabel}>Tasa de Participacion</div>
            </div>
          </div>
        </div>

        <div style={{ ...styles.chartCard, flex: 1 }}>
          <h3 style={styles.chartTitle}>Comunicacion</h3>
          <div style={styles.engagementGrid}>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.totalMessages}</div>
              <div style={styles.engagementLabel}>Total Mensajes</div>
            </div>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.avgMsgsPerUser}</div>
              <div style={styles.engagementLabel}>Promedio/Usuario</div>
            </div>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.totalNotifications}</div>
              <div style={styles.engagementLabel}>Notificaciones Push</div>
            </div>
            <div style={styles.engagementItem}>
              <div style={styles.engagementValue}>{engagement.totalPushSent}</div>
              <div style={styles.engagementLabel}>Push Entregados</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions by day */}
      {sessions?.sessionsByDay && sessions.sessionsByDay.length > 0 && (
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Sesiones por Dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sessions.sessionsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip contentStyle={styles.tooltip} />
              <Bar dataKey="sessions" fill="#6c5ce7" name="Sesiones" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════
const styles = {
  container: { padding: '0 0 40px 0', maxWidth: 1400 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  tabs: { display: 'flex', gap: 4 },
  tab: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: 13, fontWeight: 500,
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
  },
  tabActive: { background: '#6c5ce7', color: '#fff' },
  dateRange: { display: 'flex', alignItems: 'center', gap: 8 },
  dateInput: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid #333', borderRadius: 6,
    color: '#ccc', padding: '6px 10px', fontSize: 12,
  },
  refreshBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid #333', borderRadius: 6,
    padding: '6px 10px', cursor: 'pointer', fontSize: 14,
  },
  loading: { textAlign: 'center', color: '#888', padding: 40, fontSize: 14 },
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 },
  kpiCard: {
    background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '16px 20px',
    display: 'flex', alignItems: 'center', gap: 14, border: '1px solid rgba(255,255,255,0.06)',
  },
  kpiIcon: { width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 },
  kpiValue: { fontSize: 22, fontWeight: 700, color: '#fff' },
  kpiLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  kpiSub: { fontSize: 11, color: '#666', marginTop: 2 },
  chartsRow: { display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  chartCard: {
    background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20,
    border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12, minWidth: 0,
  },
  chartTitle: { color: '#ccc', fontSize: 14, fontWeight: 600, margin: '0 0 14px 0' },
  tooltip: { background: '#1e1e30', border: '1px solid #333', borderRadius: 8, color: '#ddd' },
  metricRow: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  metricBadge: {
    background: 'rgba(108,92,231,0.15)', color: '#a29bfe', padding: '4px 10px',
    borderRadius: 6, fontSize: 12, fontWeight: 600,
  },
  // Tables
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '8px 10px', color: '#888', fontSize: 11,
    borderBottom: '1px solid #333', fontWeight: 600, textTransform: 'uppercase',
  },
  tr: { cursor: 'pointer', transition: 'background 0.2s' },
  td: { padding: '8px 10px', color: '#ccc', borderBottom: '1px solid rgba(255,255,255,0.04)' },
  vipBadge: {
    background: '#e17055', color: '#fff', padding: '2px 6px', borderRadius: 4,
    fontSize: 10, fontWeight: 700, marginLeft: 6,
  },
  // Funnel
  funnelContainer: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0' },
  funnelStep: { width: '100%' },
  funnelBar: { padding: '10px 14px', borderRadius: 6, minWidth: 50, transition: 'width 0.5s' },
  funnelBarText: { color: '#fff', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  // User Detail
  backBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid #333', borderRadius: 8,
    color: '#aaa', padding: '8px 16px', cursor: 'pointer', fontSize: 13, marginBottom: 16,
  },
  userHeader: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  userAvatar: {
    width: 56, height: 56, borderRadius: 14, background: '#6c5ce7',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 24, fontWeight: 700,
  },
  actionBadge: {
    background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 12px',
    display: 'flex', gap: 8, alignItems: 'center', color: '#aaa', fontSize: 12,
  },
  activityItem: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  activityAction: {
    background: 'rgba(108,92,231,0.15)', color: '#a29bfe', padding: '3px 8px',
    borderRadius: 4, fontSize: 11, fontWeight: 600, minWidth: 100, textAlign: 'center',
  },
  activityTime: { color: '#888', fontSize: 12 },
  activityMeta: { color: '#00b894', fontSize: 12, fontWeight: 600, marginLeft: 'auto' },
  // Engagement
  engagementGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  engagementItem: {
    background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '16px 14px', textAlign: 'center',
  },
  engagementValue: { fontSize: 28, fontWeight: 700, color: '#fff' },
  engagementLabel: { fontSize: 11, color: '#888', marginTop: 4 },
};
