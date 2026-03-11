import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import {
  getPaltaStatus, getPaltaConfig, updatePaltaConfig,
  startPalta, stopPalta, startPaltaPolling, stopPaltaPolling,
  triggerPaltaPoll, getPaltaTransactions, getPaltaUnmatched,
  matchPaltaTransaction, getPaltaSuggestions, getPaltaStats,
  getPendingPayments, testPaltaConnection,
} from '../api';
import io from 'socket.io-client';

const statusColors = {
  stopped: '#ef4444',
  running: '#22c55e',
  logging_in: '#3b82f6',
  login_required: '#f59e0b',
  error: '#ef4444',
};

const statusLabels = {
  stopped: 'Detenido',
  running: 'Activo',
  logging_in: 'Conectando...',
  login_required: 'Login Requerido',
  error: 'Error',
};

export default function PaltaWallet() {
  const { toast } = useToast();
  const [tab, setTab] = useState('dashboard');
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [editConfig, setEditConfig] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [statusData, configData, statsData] = await Promise.all([
        getPaltaStatus(),
        getPaltaConfig(),
        getPaltaStats(),
      ]);
      setStatus(statusData);
      setConfig(configData);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading Palta data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const [txData, sugData, pendData] = await Promise.all([
        getPaltaTransactions(500),
        getPaltaSuggestions(),
        getPendingPayments(),
      ]);
      setTransactions(txData);
      setSuggestions(sugData);
      setPendingPayments(pendData);
    } catch (err) {
      console.error('Error loading transactions:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadTransactions();

    // Socket listeners
    const socket = io();
    socket.emit('agent:join', 'palta-admin');

    socket.on('palta:status', (data) => {
      setStatus(data);
    });
    socket.on('palta:match', () => {
      loadTransactions();
      loadData();
    });
    socket.on('palta:auto-approved', () => {
      loadTransactions();
      loadData();
      toast('Pago auto-aprobado por Palta', 'success');
    });

    const interval = setInterval(() => {
      loadData();
    }, 15000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (tab === 'transactions' || tab === 'matching') {
      loadTransactions();
    }
  }, [tab]);

  // ─── Actions ───
  const handleStart = async () => {
    setActionLoading('start');
    try {
      const result = await startPalta();
      toast(result.message, result.success ? 'success' : 'error');
      await loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
    setActionLoading('');
  };

  const handleStop = async () => {
    setActionLoading('stop');
    try {
      await stopPalta();
      toast('Palta Wallet detenido', 'success');
      await loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
    setActionLoading('');
  };

  const handlePoll = async () => {
    setActionLoading('poll');
    try {
      const result = await triggerPaltaPoll();
      toast(`Scan: ${result.newTransactions} nuevas, ${result.matches} matches, ${result.autoApproved} auto-aprobados`, 'success');
      await loadData();
      await loadTransactions();
    } catch (err) {
      toast(err.message, 'error');
    }
    setActionLoading('');
  };

  const handleTest = async () => {
    setActionLoading('test');
    setTestResult(null);
    try {
      const result = await testPaltaConnection();
      setTestResult(result);
      if (result.ok) {
        toast(result.message, 'success');
      } else {
        toast(result.message, 'error');
        // Si necesita iniciar, ofrecer auto-inicio
        if (result.action === 'start') {
          // Auto-iniciar
          toast('Iniciando Palta automáticamente...', 'info');
          try {
            const startResult = await startPalta();
            toast(startResult.message, startResult.success ? 'success' : 'error');
            // Re-test after starting
            const retest = await testPaltaConnection();
            setTestResult(retest);
          } catch (startErr) {
            toast('Error al iniciar: ' + startErr.message, 'error');
          }
        }
      }
      await loadData();
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
      toast('Error: ' + err.message, 'error');
    }
    setActionLoading('');
  };

  const handleTogglePolling = async () => {
    try {
      if (status?.enabled) {
        await stopPaltaPolling();
        toast('Polling desactivado', 'info');
      } else {
        await startPaltaPolling();
        toast('Polling activado', 'success');
      }
      await loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveConfig = async () => {
    try {
      const updated = await updatePaltaConfig(editConfig);
      setConfig(updated);
      setEditConfig(null);
      toast('Configuracion guardada', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleManualMatch = async (txId, paymentId, autoApprove) => {
    try {
      await matchPaltaTransaction(txId, paymentId, autoApprove);
      toast(autoApprove ? 'Match + auto-aprobado' : 'Match guardado', 'success');
      await loadTransactions();
      await loadData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading) {
    return <div style={styles.container}><div style={styles.loading}>Cargando Palta Wallet...</div></div>;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>
            <span style={{ fontSize: 28 }}>💰</span> Palta Wallet
          </h2>
          <div style={{
            ...styles.statusBadge,
            background: statusColors[status?.status] || '#666',
          }}>
            {statusLabels[status?.status] || status?.status}
          </div>
        </div>
        <div style={styles.headerActions}>
          <button
            style={{ ...styles.btn, ...styles.btnTest }}
            onClick={handleTest}
            disabled={actionLoading === 'test'}
          >
            {actionLoading === 'test' ? '⏳ Probando...' : '🧪 Probar Conexión'}
          </button>
          {status?.status === 'running' && (status?.browserOpen || status?.apiMode) ? (
            <>
              <button
                style={{ ...styles.btn, ...styles.btnSuccess }}
                onClick={handlePoll}
                disabled={actionLoading === 'poll'}
              >
                {actionLoading === 'poll' ? '⏳ Escaneando...' : '🔍 Escanear Ahora'}
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnDanger }}
                onClick={handleStop}
                disabled={actionLoading === 'stop'}
              >
                {actionLoading === 'stop' ? '⏳...' : '⏹ Detener'}
              </button>
            </>
          ) : status?.status === 'login_required' ? (
            <button
              style={{ ...styles.btn, ...styles.btnDanger }}
              onClick={handleStop}
              disabled={actionLoading === 'stop'}
            >
              {actionLoading === 'stop' ? '⏳...' : '⏹ Detener Palta'}
            </button>
          ) : (
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={handleStart}
              disabled={actionLoading === 'start'}
            >
              {actionLoading === 'start' ? '⏳ Iniciando...' : '▶ Iniciar Palta'}
            </button>
          )}
          {/* Toggle Headless */}
          <div
            style={{
              ...styles.headlessToggle,
              background: config?.headless ? '#6c5ce7' : '#374151',
            }}
            onClick={async () => {
              try {
                const newVal = !config?.headless;
                const updated = await updatePaltaConfig({ headless: newVal });
                setConfig(updated);
                const isRunning = status?.status === 'running' || status?.status === 'login_required';
                if (isRunning) {
                  // Reiniciar Palta para aplicar el cambio de headless
                  toast(newVal ? 'Cambiando a Headless... reiniciando' : 'Cambiando a Visible... reiniciando', 'info');
                  try { await stopPalta(); } catch(e) {}
                  await startPalta();
                  toast(newVal ? 'Palta reiniciado en modo INVISIBLE' : 'Palta reiniciado en modo VISIBLE', 'success');
                } else {
                  toast(newVal ? 'Headless ON — próximo inicio será invisible' : 'Headless OFF — próximo inicio será visible', 'info');
                }
                await loadData();
              } catch (err) {
                toast(err.message, 'error');
              }
            }}
            title={config?.headless ? 'Headless ON (invisible)' : 'Headless OFF (visible)'}
          >
            <span style={{ fontSize: 14 }}>{config?.headless ? '🖥️' : '👁️'}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>
              {config?.headless ? 'Oculto' : 'Visible'}
            </span>
          </div>
        </div>
      </div>

      {/* Login required banner */}
      {status?.status === 'login_required' && (
        <div style={styles.loginBanner}>
          <span style={{ fontSize: 24 }}>🔐</span>
          <div style={{ flex: 1 }}>
            <strong>Credenciales incorrectas o no configuradas</strong>
            <p style={{ margin: '4px 0 8px', opacity: 0.9, fontSize: 13 }}>
              Verifica el email y password de Palta en la seccion Config y volve a Iniciar.
            </p>
            <button
              style={{ ...styles.btn, ...styles.btnWarning, padding: '6px 16px', fontSize: 13 }}
              disabled={actionLoading === 'restart-visible'}
              onClick={async () => {
                setActionLoading('restart-visible');
                try {
                  // 1. Asegurar que headless esté OFF
                  await updatePaltaConfig({ headless: false });
                  // 2. Parar Palta (si está corriendo)
                  try { await stopPalta(); } catch(e) {}
                  // 3. Esperar un momento para que cierre el browser
                  await new Promise(r => setTimeout(r, 1500));
                  // 4. Iniciar en modo visible
                  await startPalta();
                  toast('Chrome abierto en modo VISIBLE — logueate y el sistema detectará el login', 'success');
                  await loadData();
                } catch (err) {
                  toast('Error: ' + err.message, 'error');
                }
                setActionLoading('');
              }}
            >
              {actionLoading === 'restart-visible' ? '⏳ Reiniciando...' : '👁️ Abrir Chrome para Login'}
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {status?.status === 'error' && status.errorMessage && (
        <div style={styles.errorBanner}>
          <span style={{ fontSize: 24 }}>❌</span>
          <div>
            <strong>Error</strong>
            <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 13 }}>{status.errorMessage}</p>
          </div>
        </div>
      )}

      {/* Test result banner */}
      {testResult && (
        <div style={{
          ...styles.testBanner,
          background: testResult.ok ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderColor: testResult.ok ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          color: testResult.ok ? '#4ade80' : '#f87171',
        }}>
          <span style={{ fontSize: 24 }}>{testResult.ok ? '✅' : '❌'}</span>
          <div style={{ flex: 1 }}>
            <strong>{testResult.ok ? 'Conexión OK' : 'Conexión fallida'}</strong>
            <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: 13 }}>{testResult.message}</p>
            {!testResult.ok && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                <span>Browser: {testResult.browserOpen ? '✅ Abierto' : '❌ Cerrado'}</span>
                <span style={{ marginLeft: 16 }}>Login: {testResult.loggedIn ? '✅ OK' : '❌ No'}</span>
                <span style={{ marginLeft: 16 }}>Datos: {testResult.canFetchData ? '✅ OK' : '❌ No'}</span>
              </div>
            )}
            {testResult.ok && testResult.userName && (
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>
                Usuario: {testResult.userName} | ID: {testResult.userId}
              </div>
            )}
          </div>
          <button
            onClick={() => setTestResult(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 18, opacity: 0.6 }}
          >✕</button>
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {['dashboard', 'transactions', 'matching', 'config'].map(t => (
          <button
            key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t === 'dashboard' && '📊 Dashboard'}
            {t === 'transactions' && '📋 Transacciones'}
            {t === 'matching' && '🔗 Matching'}
            {t === 'config' && '⚙️ Configuracion'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'dashboard' && (
        <DashboardTab status={status} stats={stats} />
      )}
      {tab === 'transactions' && (
        <TransactionsTab transactions={transactions} />
      )}
      {tab === 'matching' && (
        <MatchingTab
          suggestions={suggestions}
          pendingPayments={pendingPayments}
          transactions={transactions.filter(t => !t.matched)}
          onMatch={handleManualMatch}
        />
      )}
      {tab === 'config' && (
        <ConfigTab
          config={config}
          editConfig={editConfig}
          setEditConfig={setEditConfig}
          onSave={handleSaveConfig}
          status={status}
          onTogglePolling={handleTogglePolling}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Dashboard
// ═══════════════════════════════════════════
function DashboardTab({ status, stats }) {
  return (
    <div>
      {/* KPI Cards */}
      <div style={styles.kpiGrid}>
        <KpiCard icon="📥" label="Transacciones Hoy" value={stats?.todayTransactions || 0} color="#3b82f6" />
        <KpiCard icon="🔗" label="Matched" value={stats?.totalMatched || 0} color="#22c55e" />
        <KpiCard icon="✅" label="Auto-Aprobados" value={stats?.totalAutoApproved || 0} color="#10b981" />
        <KpiCard icon="❓" label="Sin Match" value={stats?.totalUnmatched || 0} color="#f59e0b" />
      </div>

      <div style={styles.kpiGrid}>
        <KpiCard icon="💵" label="Volumen Hoy" value={`$${(stats?.todayVolume || 0).toLocaleString('es-AR')}`} color="#8b5cf6" />
        <KpiCard icon="💰" label="Volumen Total" value={`$${(stats?.totalVolume || 0).toLocaleString('es-AR')}`} color="#6366f1" />
        <KpiCard icon="📡" label="Ultimo Scan" value={status?.lastPollAt ? timeAgo(status.lastPollAt) : 'Nunca'} color="#64748b" />
        <KpiCard icon={status?.mode === 'api' ? '🔥' : '🌐'} label="Modo" value={status?.mode === 'api' ? 'Firebase API' : status?.browserOpen ? 'Browser' : 'Desconectado'} color={status?.mode === 'api' ? '#f97316' : status?.browserOpen ? '#22c55e' : '#ef4444'} />
      </div>

      {/* Connection Info */}
      {status?.userName && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Cuenta Conectada</h3>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Usuario:</span>
              <span style={styles.infoValue}>{status.userName}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>User ID:</span>
              <span style={styles.infoValue}>{status.userId}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Wallet ID:</span>
              <span style={styles.infoValue}>{status.walletId}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Polling:</span>
              <span style={{ ...styles.infoValue, color: status.enabled ? '#22c55e' : '#ef4444' }}>
                {status.enabled ? `Activo (cada ${status.pollIntervalSeconds}s)` : 'Desactivado'}
              </span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Auto-Aprobar:</span>
              <span style={{ ...styles.infoValue, color: status.autoApprove ? '#22c55e' : '#f59e0b' }}>
                {status.autoApprove ? 'Si' : 'No (solo match)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Como Funciona</h3>
        <div style={styles.flowSteps}>
          <FlowStep num={1} icon="🌐" title="Scraper" desc="Se abre un navegador real que se conecta a Palta Wallet" />
          <FlowStep num={2} icon="🔄" title="Polling" desc="Cada 60 seg lee las transacciones recibidas" />
          <FlowStep num={3} icon="🔍" title="Matching" desc="Compara nombre + monto con pagos pendientes del chat" />
          <FlowStep num={4} icon="✅" title="Auto-Aprobacion" desc="Si hay match, aprueba automaticamente y carga fichas" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Transactions
// ═══════════════════════════════════════════
function TransactionsTab({ transactions }) {
  const [filter, setFilter] = useState('all');

  const filtered = transactions.filter(t => {
    if (filter === 'matched') return t.matched;
    if (filter === 'unmatched') return !t.matched;
    if (filter === 'auto') return t.autoApproved;
    return true;
  });

  return (
    <div>
      <div style={styles.filterBar}>
        {['all', 'unmatched', 'matched', 'auto'].map(f => (
          <button
            key={f}
            style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && `Todas (${transactions.length})`}
            {f === 'unmatched' && `Sin Match (${transactions.filter(t => !t.matched).length})`}
            {f === 'matched' && `Matched (${transactions.filter(t => t.matched).length})`}
            {f === 'auto' && `Auto (${transactions.filter(t => t.autoApproved).length})`}
          </button>
        ))}
      </div>

      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <div style={{ flex: 2 }}>Nombre</div>
          <div style={{ flex: 1 }}>Monto</div>
          <div style={{ flex: 1.5 }}>CUIT</div>
          <div style={{ flex: 1.5 }}>Fecha</div>
          <div style={{ flex: 1 }}>Estado</div>
        </div>
        {filtered.length === 0 && (
          <div style={styles.emptyRow}>No hay transacciones</div>
        )}
        {filtered.map(tx => (
          <div key={tx.id} style={styles.tableRow}>
            <div style={{ flex: 2, fontWeight: 600 }}>{tx.counterpartyName}</div>
            <div style={{ flex: 1, color: '#22c55e', fontWeight: 700 }}>
              ${tx.amount.toLocaleString('es-AR')}
            </div>
            <div style={{ flex: 1.5, fontSize: 12, opacity: 0.7 }}>{tx.counterpartyCuit}</div>
            <div style={{ flex: 1.5, fontSize: 12 }}>
              {new Date(tx.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={{ flex: 1 }}>
              {tx.autoApproved ? (
                <span style={{ ...styles.badge, background: '#22c55e' }}>Auto ✅</span>
              ) : tx.matched ? (
                <span style={{ ...styles.badge, background: '#3b82f6' }}>Match 🔗</span>
              ) : (
                <span style={{ ...styles.badge, background: '#64748b' }}>Pendiente</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Matching
// ═══════════════════════════════════════════
function MatchingTab({ suggestions, pendingPayments, transactions, onMatch }) {
  return (
    <div>
      {/* Auto suggestions */}
      {suggestions.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>🎯 Sugerencias de Match ({suggestions.length})</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
            Estas transacciones de Palta coinciden con pagos pendientes:
          </p>
          {suggestions.map((s, i) => (
            <div key={i} style={styles.suggestionCard}>
              <div style={styles.suggestionInfo}>
                <div style={styles.suggestionRow}>
                  <span style={styles.suggestionLabel}>Palta:</span>
                  <strong>{s.paltaName}</strong>
                  <span style={{ color: '#22c55e', fontWeight: 700 }}>${s.transactionAmount.toLocaleString('es-AR')}</span>
                </div>
                <div style={styles.suggestionRow}>
                  <span style={styles.suggestionLabel}>Cliente:</span>
                  <strong>{s.clientName}</strong>
                  <span style={{ color: '#3b82f6', fontWeight: 700 }}>${s.paymentAmount.toLocaleString('es-AR')}</span>
                </div>
                <div style={styles.suggestionRow}>
                  <span style={styles.suggestionLabel}>Confianza:</span>
                  <span style={{
                    color: s.confidence >= 90 ? '#22c55e' : s.confidence >= 75 ? '#f59e0b' : '#ef4444',
                    fontWeight: 700,
                  }}>
                    {s.confidence}% ({s.nameMatchType})
                  </span>
                </div>
              </div>
              <div style={styles.suggestionActions}>
                <button
                  style={{ ...styles.btn, ...styles.btnSuccess, fontSize: 12, padding: '6px 12px' }}
                  onClick={() => onMatch(s.transactionId, s.paymentId, true)}
                >
                  ✅ Aprobar
                </button>
                <button
                  style={{ ...styles.btn, ...styles.btnOutline, fontSize: 12, padding: '6px 12px' }}
                  onClick={() => onMatch(s.transactionId, s.paymentId, false)}
                >
                  🔗 Solo Match
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {suggestions.length === 0 && (
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p>No hay sugerencias de match en este momento</p>
            <p style={{ fontSize: 13, opacity: 0.7 }}>
              Las sugerencias aparecen cuando hay transacciones de Palta que coinciden con pagos pendientes
            </p>
          </div>
        </div>
      )}

      {/* Pending payments */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📋 Pagos Pendientes ({pendingPayments.length})</h3>
        {pendingPayments.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>No hay pagos pendientes</p>
        ) : (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <div style={{ flex: 0.5 }}>#</div>
              <div style={{ flex: 2 }}>Cliente</div>
              <div style={{ flex: 1 }}>Monto</div>
              <div style={{ flex: 1 }}>Tipo</div>
              <div style={{ flex: 1.5 }}>Fecha</div>
            </div>
            {pendingPayments.map(p => (
              <div key={p.id} style={styles.tableRow}>
                <div style={{ flex: 0.5 }}>#{p.id}</div>
                <div style={{ flex: 2 }}>{p.clientId || '-'}</div>
                <div style={{ flex: 1, color: '#22c55e', fontWeight: 700 }}>
                  ${p.amount.toLocaleString('es-AR')}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ ...styles.badge, background: p.type === 'deposit' ? '#22c55e' : '#ef4444' }}>
                    {p.type === 'deposit' ? 'Deposito' : 'Retiro'}
                  </span>
                </div>
                <div style={{ flex: 1.5, fontSize: 12 }}>
                  {new Date(p.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unmatched transactions */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>❓ Transacciones Sin Match ({transactions.length})</h3>
        {transactions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Todas las transacciones tienen match</p>
        ) : (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <div style={{ flex: 2 }}>Nombre</div>
              <div style={{ flex: 1 }}>Monto</div>
              <div style={{ flex: 1.5 }}>Fecha</div>
            </div>
            {transactions.map(tx => (
              <div key={tx.id} style={styles.tableRow}>
                <div style={{ flex: 2 }}>{tx.counterpartyName}</div>
                <div style={{ flex: 1, color: '#22c55e', fontWeight: 700 }}>
                  ${tx.amount.toLocaleString('es-AR')}
                </div>
                <div style={{ flex: 1.5, fontSize: 12 }}>
                  {new Date(tx.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: Config
// ═══════════════════════════════════════════
function ConfigTab({ config, editConfig, setEditConfig, onSave, status, onTogglePolling }) {
  const editing = editConfig || config;

  return (
    <div>
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Credenciales Palta Wallet</h3>
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              value={editing?.email || ''}
              onChange={e => setEditConfig({ ...editing, email: e.target.value })}
              placeholder="email@ejemplo.com"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={editing?.password || ''}
              onChange={e => setEditConfig({ ...editing, password: e.target.value })}
              placeholder="********"
            />
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Configuracion de Polling</h3>
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Intervalo de Polling (segundos)</label>
            <input
              style={styles.input}
              type="number"
              min={30}
              max={300}
              value={editing?.pollIntervalSeconds || 60}
              onChange={e => setEditConfig({ ...editing, pollIntervalSeconds: parseInt(e.target.value) })}
            />
            <span style={styles.hint}>Min: 30s, Max: 300s (5 min)</span>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Auto-Aprobar Pagos</label>
            <div
              style={{ ...styles.toggle, ...(editing?.autoApprove ? styles.toggleActive : {}) }}
              onClick={() => setEditConfig({ ...editing, autoApprove: !editing?.autoApprove })}
            >
              <div style={{ ...styles.toggleDot, ...(editing?.autoApprove ? styles.toggleDotActive : {}) }} />
            </div>
            <span style={styles.hint}>
              {editing?.autoApprove
                ? 'Si: Cuando hay match automatico, aprueba el pago y carga fichas'
                : 'No: Solo marca el match, el admin debe aprobar manualmente'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {editConfig && (
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={onSave}>
              💾 Guardar Configuracion
            </button>
          )}
          <button
            style={{ ...styles.btn, ...(status?.enabled ? styles.btnDanger : styles.btnSuccess) }}
            onClick={onTogglePolling}
          >
            {status?.enabled ? '⏸ Pausar Polling' : '▶ Activar Polling'}
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🔥 Modo de Conexion</h3>
        <div style={{
          padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.7,
          background: 'rgba(249, 115, 22, 0.1)',
          border: '1px solid rgba(249, 115, 22, 0.2)',
          color: '#fb923c',
        }}>
          <strong>Firebase API Mode (Recomendado)</strong><br/>
          Palta se conecta directamente via Firebase Auth usando email y password.<br/>
          <strong>No necesita Chrome ni browser.</strong> Funciona en Railway y cualquier servidor.<br/>
          El token se renueva automaticamente cada 50 minutos.<br/><br/>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>
            Solo necesitas configurar email y password de Palta en la seccion de arriba y darle <strong>Iniciar</strong>.
          </span>
        </div>
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Modo Servidor (Headless) - Fallback</label>
            <div
              style={{ ...styles.toggle, ...(editing?.headless ? styles.toggleActive : {}) }}
              onClick={() => setEditConfig({ ...editing, headless: !editing?.headless })}
            >
              <div style={{ ...styles.toggleDot, ...(editing?.headless ? styles.toggleDotActive : {}) }} />
            </div>
            <span style={styles.hint}>
              Solo se usa si Firebase falla. Headless ON = browser invisible (servidor). OFF = visible (local).
            </span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Notas Tecnicas</h3>
        <ul style={styles.notesList}>
          <li><strong>Modo API (Firebase):</strong> Login directo con Firebase SDK, sin browser ni Chrome. Token se renueva solo.</li>
          <li><strong>Modo Browser (fallback):</strong> Usa Puppeteer si Firebase falla. Requiere Chrome instalado.</li>
          <li>Las transacciones se obtienen de la API de Palta (<code>prod-api.palta.app</code>).</li>
          <li>El matching compara <strong>nombre parcial + monto exacto</strong>.</li>
          <li>Auto-aprobacion requiere <strong>confianza &gt;= 75%</strong>.</li>
        </ul>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════
function KpiCard({ icon, label, value, color }) {
  return (
    <div style={styles.kpiCard}>
      <div style={{ ...styles.kpiIcon, background: color + '22', color }}>{icon}</div>
      <div>
        <div style={styles.kpiValue}>{value}</div>
        <div style={styles.kpiLabel}>{label}</div>
      </div>
    </div>
  );
}

function FlowStep({ num, icon, title, desc }) {
  return (
    <div style={styles.flowStep}>
      <div style={styles.flowNum}>{num}</div>
      <div style={styles.flowIcon}>{icon}</div>
      <div style={styles.flowTitle}>{title}</div>
      <div style={styles.flowDesc}>{desc}</div>
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const styles = {
  container: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  loading: { textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  headerActions: { display: 'flex', gap: 10 },
  title: { margin: 0, fontSize: 24, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 },
  statusBadge: {
    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
    color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  loginBanner: {
    display: 'flex', alignItems: 'center', gap: 16, padding: 16,
    background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: 12, marginBottom: 20, color: '#fbbf24',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 16, padding: 16,
    background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 12, marginBottom: 20, color: '#f87171',
  },
  tabs: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4 },
  tab: {
    padding: '10px 20px', background: 'transparent', border: 'none', color: '#94a3b8',
    cursor: 'pointer', fontSize: 14, borderRadius: '8px 8px 0 0', transition: 'all 0.2s',
  },
  tabActive: { background: 'rgba(108, 92, 231, 0.2)', color: '#a78bfa', fontWeight: 600 },
  // KPI
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 },
  kpiCard: {
    background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 20,
    display: 'flex', alignItems: 'center', gap: 16, border: '1px solid rgba(255,255,255,0.08)',
  },
  kpiIcon: { width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 },
  kpiValue: { fontSize: 22, fontWeight: 700, color: '#e2e8f0' },
  kpiLabel: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  // Card
  card: {
    background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 24,
    border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16,
  },
  cardTitle: { margin: '0 0 16px', fontSize: 16, color: '#e2e8f0' },
  // Info
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  infoItem: { display: 'flex', gap: 8, alignItems: 'center' },
  infoLabel: { color: '#64748b', fontSize: 13, minWidth: 100 },
  infoValue: { color: '#e2e8f0', fontSize: 13, fontWeight: 500 },
  // Flow
  flowSteps: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 },
  flowStep: { textAlign: 'center', padding: 16 },
  flowNum: {
    width: 28, height: 28, borderRadius: '50%', background: '#6c5ce7', color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, marginBottom: 8,
  },
  flowIcon: { fontSize: 32, marginBottom: 8 },
  flowTitle: { fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 },
  flowDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 1.4 },
  // Table
  table: { borderRadius: 8, overflow: 'hidden' },
  tableHeader: {
    display: 'flex', padding: '10px 16px', background: 'rgba(255,255,255,0.08)',
    fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
  },
  tableRow: {
    display: 'flex', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    alignItems: 'center', fontSize: 14, color: '#e2e8f0',
  },
  emptyRow: { padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 },
  badge: { padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#fff' },
  // Filter
  filterBar: { display: 'flex', gap: 8, marginBottom: 16 },
  filterBtn: {
    padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#94a3b8', borderRadius: 8, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s',
  },
  filterBtnActive: { background: 'rgba(108, 92, 231, 0.2)', borderColor: '#6c5ce7', color: '#a78bfa' },
  // Suggestions
  suggestionCard: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', marginBottom: 8,
  },
  suggestionInfo: { flex: 1 },
  suggestionRow: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, fontSize: 14, color: '#e2e8f0' },
  suggestionLabel: { color: '#64748b', fontSize: 12, minWidth: 70 },
  suggestionActions: { display: 'flex', gap: 8, flexDirection: 'column' },
  // Buttons
  btn: {
    padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
  },
  btnPrimary: { background: '#6c5ce7', color: '#fff' },
  btnSuccess: { background: '#22c55e', color: '#fff' },
  btnDanger: { background: '#ef4444', color: '#fff' },
  btnTest: { background: '#0ea5e9', color: '#fff' },
  btnWarning: { background: '#f59e0b', color: '#000', fontWeight: 700 },
  powerToggle: {
    width: 58, height: 30, borderRadius: 15, position: 'relative',
    transition: 'background 0.3s', display: 'flex', alignItems: 'center',
    justifyContent: 'center',
  },
  powerToggleDot: {
    width: 22, height: 22, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 4, transition: 'left 0.3s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  powerToggleLabel: {
    fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 1,
    zIndex: 1, userSelect: 'none', pointerEvents: 'none',
  },
  headlessToggle: {
    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
    borderRadius: 8, cursor: 'pointer', transition: 'background 0.3s',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  btnOutline: { background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.2)' },
  testBanner: {
    display: 'flex', alignItems: 'center', gap: 16, padding: 16,
    border: '1px solid', borderRadius: 12, marginBottom: 20,
  },
  // Form
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 },
  formGroup: { marginBottom: 4 },
  label: { display: 'block', marginBottom: 6, color: '#94a3b8', fontSize: 13, fontWeight: 600 },
  input: {
    width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#e2e8f0',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  },
  hint: { display: 'block', marginTop: 4, color: '#64748b', fontSize: 11 },
  // Toggle
  toggle: {
    width: 48, height: 26, borderRadius: 13, background: '#374151', cursor: 'pointer',
    position: 'relative', transition: 'background 0.2s',
  },
  toggleActive: { background: '#22c55e' },
  toggleDot: {
    width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute',
    top: 3, left: 3, transition: 'left 0.2s',
  },
  toggleDotActive: { left: 25 },
  // Notes
  notesList: { color: '#94a3b8', fontSize: 13, lineHeight: 1.8, paddingLeft: 20 },
};
