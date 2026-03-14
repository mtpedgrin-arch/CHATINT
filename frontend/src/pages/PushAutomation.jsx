import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import {
  getPushAutomationConfig,
  savePushAutomationConfig,
  getPushSubscribersStats,
  getPushAutomationStats,
  startPushAutomation,
  stopPushAutomation,
  getPushAutomationStatus,
} from '../api';

function getDefaultInactivityRules() {
  return [
    { daysInactive: 1, title: '🎰 Te extra\u00f1amos!', body: 'Tu suerte te espera. Volv\u00e9 a jugar!', icon: '🎰', url: '/widget', onlyOnce: false, enabled: true },
    { daysInactive: 3, title: '💰 Ten\u00e9s un BONO esper\u00e1ndote', body: 'Volv\u00e9 hoy y aprovech\u00e1 tu bono!', icon: '💰', url: '/widget', onlyOnce: false, enabled: true },
    { daysInactive: 7, title: '🎁 BONO EXCLUSIVO 50%', body: 'Solo por volver. Vence hoy!', icon: '🎁', url: '/widget', onlyOnce: true, enabled: true },
    { daysInactive: 14, title: '😢 Tu lugar VIP te espera', body: 'Te lo guardamos. \u00daltimas 48hs!', icon: '😢', url: '/widget', onlyOnce: true, enabled: true },
    { daysInactive: 30, title: '🔥 \u00daLTIMA OPORTUNIDAD', body: 'Bono 100% de recarga. No te lo pierdas!', icon: '🔥', url: '/widget', onlyOnce: true, enabled: true },
  ];
}

function getDefaultReconsumoRules() {
  return [
    { id: 'balance_zero', enabled: true, triggerType: 'balance_zero', title: '💸 Se te acabaron las fichas!', body: 'Carg\u00e1 y segu\u00ed jugando 🎰', icon: '💸', url: '/widget', onlyOnce: false },
    { id: 'balance_low', enabled: true, triggerType: 'balance_low', title: '\u26A1 Te quedan pocas fichas', body: 'Carg\u00e1 ahora y recib\u00ed 20% extra', icon: '\u26A1', url: '/widget', threshold: 500, onlyOnce: false },
    { id: 'big_win', enabled: true, triggerType: 'big_win', title: '🏆 Ganaste!', body: 'La racha sigue, no pares ahora 🔥', icon: '🏆', url: '/widget', onlyOnce: false },
    { id: 'big_loss', enabled: true, triggerType: 'big_loss', title: '🍀 La suerte cambia', body: 'Carg\u00e1 $1000 y te damos $200 extra', icon: '🍀', url: '/widget', onlyOnce: false },
    { id: 'no_deposit_3d', enabled: true, triggerType: 'no_deposit_days', title: '💳 Hace d\u00edas que no carg\u00e1s', body: 'Bono 30% en tu pr\u00f3xima carga!', icon: '💳', url: '/widget', daysThreshold: 3, onlyOnce: false },
  ];
}

function getDefaultUrgenciaRules() {
  return [
    { id: 'sorteo_ending', enabled: true, triggerType: 'fomo_sorteo_ending', title: '\u23F0 Quedan 30 min para el sorteo!', body: '\u00bfYa cargaste? No te lo pierdas!', icon: '\u23F0', url: '/widget', minutesBefore: 30 },
    { id: 'bono_expiring', enabled: true, triggerType: 'fomo_bono_expiring', title: '\u26A0\uFE0F Tu bono vence en 2 horas', body: 'Usalo o se pierde!', icon: '\u26A0\uFE0F', url: '/widget', hoursBefore: 2 },
    { id: 'players_online', enabled: true, triggerType: 'fomo_players_online', title: '🔥 Muchos jugadores online!', body: 'Unite a la acci\u00f3n ahora!', icon: '🔥', url: '/widget', threshold: 50 },
    { id: 'someone_won', enabled: true, triggerType: 'fomo_someone_won', title: '🏆 Un jugador acaba de ganar!', body: '\u00bfEl pr\u00f3ximo sos vos? 🎰', icon: '🏆', url: '/widget' },
  ];
}

function getDefaultOnboardingSteps() {
  return [
    { id: 'day0', day: 0, condition: 'always', enabled: true, title: '🎰 Bienvenido!', body: 'Carg\u00e1 y recib\u00ed 100% extra en tu primera carga', icon: '🎰', url: '/widget' },
    { id: 'day1_loaded', day: 1, condition: 'deposited', enabled: true, title: '\u2705 Genial tu primera carga!', body: 'Conoc\u00e9 los eventos y gan\u00e1 m\u00e1s premios 🎁', icon: '\u2705', url: '/widget' },
    { id: 'day1_noload', day: 1, condition: 'not_deposited', enabled: true, title: '💰 Todav\u00eda no cargaste', body: 'Tu bono de bienvenida te espera!', icon: '💰', url: '/widget' },
    { id: 'day3', day: 3, condition: 'always', enabled: true, title: '🎲 Probaste los juegos?', body: 'Los jugadores los aman. Entr\u00e1 y jug\u00e1!', icon: '🎲', url: '/widget' },
    { id: 'day5', day: 5, condition: 'always', enabled: true, title: '🏆 Este finde hay SORTEO', body: 'Carg\u00e1 y particip\u00e1 por premios!', icon: '🏆', url: '/widget' },
    { id: 'day7', day: 7, condition: 'always', enabled: true, title: '🎉 1 semana con nosotros!', body: 'Bono especial de fidelidad. Aprovech\u00e1 hoy!', icon: '🎉', url: '/widget' },
  ];
}

export default function PushAutomation() {
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('retencion');
  const [stats, setStats] = useState(null);
  const [subStats, setSubStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [cfg, st, sub, sts] = await Promise.all([
        getPushAutomationConfig(),
        getPushAutomationStatus().catch(() => null),
        getPushSubscribersStats().catch(() => ({ totalClients: 0, clientsWithPush: 0, adoptionRate: 0 })),
        getPushAutomationStats().catch(() => null),
      ]);

      // Ensure new sections exist with defaults
      if (!cfg.reconsumo) cfg.reconsumo = { enabled: false, rules: getDefaultReconsumoRules() };
      if (!cfg.urgencia) cfg.urgencia = { enabled: false, rules: getDefaultUrgenciaRules() };
      if (!cfg.onboarding) cfg.onboarding = { enabled: false, steps: getDefaultOnboardingSteps() };
      if (!cfg.inactivity?.rules?.length) cfg.inactivity = { enabled: false, rules: getDefaultInactivityRules() };

      setConfig(cfg);
      setStatus(st);
      setSubStats(sub);
      setStats(sts);
    } catch (err) {
      toast('Error al cargar configuraci\u00f3n', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await savePushAutomationConfig(config);
      toast('Configuraci\u00f3n guardada exitosamente', 'success');
    } catch (err) {
      toast('Error al guardar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateSection = (section, data) => {
    setConfig(prev => ({ ...prev, [section]: { ...prev[section], ...data } }));
  };

  const updateRule = (section, ruleIndex, field, value) => {
    setConfig(prev => {
      const items = section === 'onboarding' ? [...prev[section].steps] : [...prev[section].rules];
      items[ruleIndex] = { ...items[ruleIndex], [field]: value };
      const key = section === 'onboarding' ? 'steps' : 'rules';
      return { ...prev, [section]: { ...prev[section], [key]: items } };
    });
  };

  const updateInactivityRule = (index, field, value) => {
    setConfig(prev => {
      const rules = [...prev.inactivity.rules];
      rules[index] = { ...rules[index], [field]: value };
      return { ...prev, inactivity: { ...prev.inactivity, rules } };
    });
  };

  // --- Inline Components ---

  const Toggle = ({ checked, onChange, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
          background: checked ? '#22c55e' : 'rgba(255,255,255,0.15)',
          position: 'relative', transition: 'background 0.2s',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 22 : 2, transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label && <span style={{ fontSize: '0.85rem', color: '#ccc' }}>{label}</span>}
    </div>
  );

  const StatCard = ({ label, value, icon, color }) => (
    <div className="card" style={{ padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem' }}>{icon}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: color || '#fff' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: '#999' }}>{label}</div>
    </div>
  );

  const SectionCard = ({ title, enabled, onToggle, children }) => (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#D4A843' }}>{title}</span>
        <Toggle checked={enabled} onChange={onToggle} label={enabled ? 'Activo' : 'Inactivo'} />
      </div>
      <div style={{ padding: 18, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        {children}
      </div>
    </div>
  );

  const RuleRow = ({ label, enabled, onToggle, title, onTitleChange, body, onBodyChange, extra }) => (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Toggle checked={enabled} onChange={onToggle} />
        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: enabled ? '#D4A843' : '#666' }}>{label}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, paddingLeft: 56 }}>
        <input className="form-input" value={title} onChange={(e) => onTitleChange(e.target.value)}
          placeholder="T\u00edtulo" style={{ fontSize: '0.8rem' }} />
        <input className="form-input" value={body} onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Mensaje" style={{ fontSize: '0.8rem' }} />
      </div>
      {extra && <div style={{ paddingLeft: 56, marginTop: 6 }}>{extra}</div>}
    </div>
  );

  // --- Tab Renderers ---

  const tabs = [
    { key: 'retencion', label: '🛡\uFE0F Retenci\u00f3n' },
    { key: 'reconsumo', label: '💰 Reconsumo' },
    { key: 'engagement', label: '🎯 Engagement' },
    { key: 'urgencia', label: '🔥 Urgencia' },
    { key: 'segmentos', label: '👥 VIP' },
    { key: 'onboarding', label: '🚀 Onboarding' },
    { key: 'ajustes', label: '\u2699\uFE0F Ajustes' },
  ];

  const renderRetencion = () => (
    <SectionCard title="🛡\uFE0F Retenci\u00f3n por Inactividad" enabled={config.inactivity.enabled}
      onToggle={(v) => updateSection('inactivity', { enabled: v })}>
      {config.inactivity.rules.map((rule, i) => (
        <RuleRow key={i}
          label={`Inactivo ${rule.daysInactive} d\u00eda${rule.daysInactive > 1 ? 's' : ''}`}
          enabled={rule.enabled !== false}
          onToggle={(v) => updateInactivityRule(i, 'enabled', v)}
          title={rule.title}
          onTitleChange={(v) => updateInactivityRule(i, 'title', v)}
          body={rule.body}
          onBodyChange={(v) => updateInactivityRule(i, 'body', v)}
        />
      ))}
    </SectionCard>
  );

  const renderReconsumo = () => {
    const labels = {
      balance_zero: '💸 Balance = $0',
      balance_low: '\u26A1 Balance Bajo',
      big_win: '🏆 Gan\u00f3 Premio Grande',
      big_loss: '🍀 Perdi\u00f3 Mucho',
      no_deposit_days: '💳 Sin Dep\u00f3sito',
    };
    return (
      <SectionCard title="💰 Reconsumo" enabled={config.reconsumo.enabled}
        onToggle={(v) => updateSection('reconsumo', { enabled: v })}>
        {config.reconsumo.rules.map((rule, i) => (
          <RuleRow key={rule.id}
            label={labels[rule.triggerType] || rule.triggerType}
            enabled={rule.enabled}
            onToggle={(v) => updateRule('reconsumo', i, 'enabled', v)}
            title={rule.title}
            onTitleChange={(v) => updateRule('reconsumo', i, 'title', v)}
            body={rule.body}
            onBodyChange={(v) => updateRule('reconsumo', i, 'body', v)}
            extra={rule.triggerType === 'balance_low' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>Umbral: $</span>
                <input className="form-input" type="number" value={rule.threshold || 500}
                  onChange={(e) => updateRule('reconsumo', i, 'threshold', Number(e.target.value))}
                  style={{ width: 100, fontSize: '0.8rem' }} />
              </div>
            ) : rule.triggerType === 'no_deposit_days' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>D\u00edas sin dep\u00f3sito:</span>
                <input className="form-input" type="number" value={rule.daysThreshold || 3}
                  onChange={(e) => updateRule('reconsumo', i, 'daysThreshold', Number(e.target.value))}
                  style={{ width: 80, fontSize: '0.8rem' }} />
              </div>
            ) : null}
          />
        ))}
      </SectionCard>
    );
  };

  const renderEngagement = () => (
    <SectionCard title="🎯 Engagement Programado" enabled={config.scheduled.enabled}
      onToggle={(v) => updateSection('scheduled', { enabled: v })}>
      {config.scheduled.campaigns.length === 0 ? (
        <p style={{ color: '#999', fontSize: '0.85rem' }}>No hay campa\u00f1as configuradas. Se crear\u00e1n por defecto al guardar.</p>
      ) : config.scheduled.campaigns.map((camp, i) => (
        <div key={camp.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Toggle checked={camp.enabled} onChange={(v) => {
              const campaigns = [...config.scheduled.campaigns];
              campaigns[i] = { ...campaigns[i], enabled: v };
              updateSection('scheduled', { campaigns });
            }} />
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: camp.enabled ? '#D4A843' : '#666' }}>{camp.name}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, paddingLeft: 56 }}>
            <input className="form-input" value={camp.title}
              onChange={(e) => { const c = [...config.scheduled.campaigns]; c[i] = {...c[i], title: e.target.value}; updateSection('scheduled', {campaigns: c}); }}
              placeholder="T\u00edtulo" style={{ fontSize: '0.8rem' }} />
            <input className="form-input" value={camp.body}
              onChange={(e) => { const c = [...config.scheduled.campaigns]; c[i] = {...c[i], body: e.target.value}; updateSection('scheduled', {campaigns: c}); }}
              placeholder="Mensaje" style={{ fontSize: '0.8rem' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, paddingLeft: 56, marginTop: 6, flexWrap: 'wrap' }}>
            {['lunes','martes','mi\u00e9rcoles','jueves','viernes','s\u00e1bado','domingo'].map(d => {
              const dayEn = {lunes:'monday',martes:'tuesday','mi\u00e9rcoles':'wednesday',jueves:'thursday',viernes:'friday','s\u00e1bado':'saturday',domingo:'sunday'}[d];
              const active = camp.days?.includes(dayEn);
              return (
                <button key={d} onClick={() => {
                  const c = [...config.scheduled.campaigns];
                  const days = active ? c[i].days.filter(x => x !== dayEn) : [...(c[i].days||[]), dayEn];
                  c[i] = {...c[i], days};
                  updateSection('scheduled', {campaigns: c});
                }}
                  style={{
                    padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    fontSize: '0.7rem', fontWeight: 600,
                    background: active ? '#D4A843' : 'rgba(255,255,255,0.08)',
                    color: active ? '#000' : '#888',
                  }}>
                  {d.slice(0,3)}
                </button>
              );
            })}
            <input className="form-input" type="time" value={camp.time || '20:00'}
              onChange={(e) => { const c = [...config.scheduled.campaigns]; c[i] = {...c[i], time: e.target.value}; updateSection('scheduled', {campaigns: c}); }}
              style={{ width: 100, fontSize: '0.75rem' }} />
          </div>
        </div>
      ))}
    </SectionCard>
  );

  const renderUrgencia = () => {
    const labels = {
      fomo_sorteo_ending: '\u23F0 Sorteo por Terminar',
      fomo_bono_expiring: '\u26A0\uFE0F Bono por Vencer',
      fomo_players_online: '🔥 Muchos Jugadores Online',
      fomo_someone_won: '🏆 Alguien Gan\u00f3 un Premio',
    };
    return (
      <SectionCard title="🔥 Urgencia / FOMO" enabled={config.urgencia.enabled}
        onToggle={(v) => updateSection('urgencia', { enabled: v })}>
        {config.urgencia.rules.map((rule, i) => (
          <RuleRow key={rule.id}
            label={labels[rule.triggerType] || rule.triggerType}
            enabled={rule.enabled}
            onToggle={(v) => updateRule('urgencia', i, 'enabled', v)}
            title={rule.title}
            onTitleChange={(v) => updateRule('urgencia', i, 'title', v)}
            body={rule.body}
            onBodyChange={(v) => updateRule('urgencia', i, 'body', v)}
            extra={rule.triggerType === 'fomo_sorteo_ending' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>Minutos antes:</span>
                <input className="form-input" type="number" value={rule.minutesBefore || 30}
                  onChange={(e) => updateRule('urgencia', i, 'minutesBefore', Number(e.target.value))}
                  style={{ width: 80, fontSize: '0.8rem' }} />
              </div>
            ) : rule.triggerType === 'fomo_bono_expiring' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>Horas antes:</span>
                <input className="form-input" type="number" value={rule.hoursBefore || 2}
                  onChange={(e) => updateRule('urgencia', i, 'hoursBefore', Number(e.target.value))}
                  style={{ width: 80, fontSize: '0.8rem' }} />
              </div>
            ) : rule.triggerType === 'fomo_players_online' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>Umbral jugadores:</span>
                <input className="form-input" type="number" value={rule.threshold || 50}
                  onChange={(e) => updateRule('urgencia', i, 'threshold', Number(e.target.value))}
                  style={{ width: 80, fontSize: '0.8rem' }} />
              </div>
            ) : null}
          />
        ))}
      </SectionCard>
    );
  };

  const renderSegmentos = () => {
    const segmentos = [
      { key: 'ballena', label: '🐳 Ballena', desc: 'Depositan mucho', filter: 'ballena', field: 'minDeposits', defaultVal: 50000, unit: '$' },
      { key: 'regular', label: '💎 Regular', desc: 'Depositan $5K-$50K', filter: 'regular' },
      { key: 'casual', label: '🎲 Casual', desc: 'Depositan $1K-$5K', filter: 'casual' },
      { key: 'nuevo', label: '🆕 Nuevo', desc: 'Menos de N d\u00edas', filter: 'nuevo', field: 'maxDays', defaultVal: 7, unit: 'd\u00edas' },
      { key: 'dormido', label: '😴 Dormido', desc: 'Inactivo m\u00e1s de N d\u00edas', filter: 'dormido', field: 'minDays', defaultVal: 14, unit: 'd\u00edas' },
    ];

    const segments = config.segments || {};

    return (
      <SectionCard title="👥 VIP / Segmentaci\u00f3n" enabled={true} onToggle={() => {}}>
        {segmentos.map(seg => (
          <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#D4A843', minWidth: 120 }}>{seg.label}</span>
            <span style={{ fontSize: '0.8rem', color: '#999', flex: 1 }}>{seg.desc}</span>
            {seg.field && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '0.75rem', color: '#999' }}>{seg.unit === '$' ? '$' : ''}</span>
                <input className="form-input" type="number"
                  value={segments[seg.key]?.[seg.field] || seg.defaultVal}
                  onChange={(e) => {
                    const newSegments = { ...segments, [seg.key]: { ...segments[seg.key], filter: seg.filter, description: seg.desc, [seg.field]: Number(e.target.value) } };
                    setConfig(prev => ({ ...prev, segments: newSegments }));
                  }}
                  style={{ width: 100, fontSize: '0.8rem' }} />
                {seg.unit !== '$' && <span style={{ fontSize: '0.75rem', color: '#999' }}>{seg.unit}</span>}
              </div>
            )}
          </div>
        ))}
      </SectionCard>
    );
  };

  const renderOnboarding = () => {
    const condLabels = { always: 'Siempre', deposited: 'Si carg\u00f3', not_deposited: 'Si NO carg\u00f3' };

    return (
      <SectionCard title="🚀 Onboarding (Primeros 7 d\u00edas)" enabled={config.onboarding.enabled}
        onToggle={(v) => updateSection('onboarding', { enabled: v })}>
        {config.onboarding.steps.map((step, i) => (
          <div key={step.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Toggle checked={step.enabled} onChange={(v) => updateRule('onboarding', i, 'enabled', v)} />
              <span style={{
                background: 'rgba(212,168,67,0.2)', color: '#D4A843', padding: '2px 8px',
                borderRadius: 4, fontSize: '0.75rem', fontWeight: 700,
              }}>
                D\u00eda {step.day}
              </span>
              <span style={{
                background: step.condition === 'deposited' ? 'rgba(34,197,94,0.2)' : step.condition === 'not_deposited' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.08)',
                color: step.condition === 'deposited' ? '#22c55e' : step.condition === 'not_deposited' ? '#f87171' : '#999',
                padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
              }}>
                {condLabels[step.condition]}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, paddingLeft: 56 }}>
              <input className="form-input" value={step.title}
                onChange={(e) => updateRule('onboarding', i, 'title', e.target.value)}
                placeholder="T\u00edtulo" style={{ fontSize: '0.8rem' }} />
              <input className="form-input" value={step.body}
                onChange={(e) => updateRule('onboarding', i, 'body', e.target.value)}
                placeholder="Mensaje" style={{ fontSize: '0.8rem' }} />
            </div>
          </div>
        ))}
      </SectionCard>
    );
  };

  const renderAjustes = () => (
    <SectionCard title="\u2699\uFE0F Ajustes Globales" enabled={true} onToggle={() => {}}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Horario Silencioso (inicio)</label>
          <input className="form-input" type="number" min={0} max={23}
            value={config.global.quietHoursStart}
            onChange={(e) => updateSection('global', { quietHoursStart: Number(e.target.value) })} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Horario Silencioso (fin)</label>
          <input className="form-input" type="number" min={0} max={23}
            value={config.global.quietHoursEnd}
            onChange={(e) => updateSection('global', { quietHoursEnd: Number(e.target.value) })} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Max pushes por usuario/dia</label>
          <input className="form-input" type="number" min={1} max={20}
            value={config.global.maxPushesPerUserPerDay}
            onChange={(e) => updateSection('global', { maxPushesPerUserPerDay: Number(e.target.value) })} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Intervalo de chequeo (min)</label>
          <input className="form-input" type="number" min={1} max={120}
            value={config.global.checkIntervalMinutes}
            onChange={(e) => updateSection('global', { checkIntervalMinutes: Number(e.target.value) })} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: '0.8rem', color: '#999', display: 'block', marginBottom: 4 }}>Zona Horaria</label>
        <select className="form-input" value={config.global.timezone}
          onChange={(e) => updateSection('global', { timezone: e.target.value })}>
          <option value="America/Argentina/Buenos_Aires">Argentina (Buenos Aires)</option>
          <option value="America/Sao_Paulo">Brasil (S\u00e3o Paulo)</option>
          <option value="America/Santiago">Chile (Santiago)</option>
          <option value="America/Bogota">Colombia (Bogot\u00e1)</option>
          <option value="America/Mexico_City">M\u00e9xico (CDMX)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>
    </SectionCard>
  );

  // --- Main Render ---

  if (loading) return <div className="section-padded" style={{color:'#ccc',textAlign:'center',padding:40}}>Cargando...</div>;
  if (!config) return <div className="section-padded" style={{color:'#f87171',textAlign:'center',padding:40}}>Error al cargar configuraci\u00f3n</div>;

  return (
    <div className="section-padded" style={{ paddingBottom: 80 }}>
      {/* STATS BAR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Clientes" value={subStats?.totalClients || 0} icon="👥" />
        <StatCard label="Con Push" value={subStats?.clientsWithPush || 0} icon="🔔" color="#22c55e" />
        <StatCard label="Adopci\u00f3n" value={`${subStats?.adoptionRate || 0}%`} icon="📊" color="#D4A843" />
        <StatCard label="Pushes Hoy" value={stats?.totalToday || 0} icon="📤" color="#60a5fa" />
        <StatCard label="Esta Semana" value={stats?.totalThisWeek || 0} icon="📅" color="#a78bfa" />
      </div>

      {/* MASTER ON/OFF + START/STOP */}
      <div className="card" style={{ marginBottom: 20, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Toggle checked={config.global.enabled} onChange={(v) => updateSection('global', { enabled: v })} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: config.global.enabled ? '#22c55e' : '#f87171' }}>
            {config.global.enabled ? '\u2705 SISTEMA ACTIVO' : '\u274C SISTEMA DESACTIVADO'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: '#22c55e', color: '#000', fontSize: '0.8rem', padding: '6px 14px', borderRadius: 6 }}
            onClick={async () => { await startPushAutomation(); toast('Push automation iniciado', 'success'); loadAll(); }}>
            \u25B6 Iniciar
          </button>
          <button className="btn" style={{ background: '#f87171', color: '#fff', fontSize: '0.8rem', padding: '6px 14px', borderRadius: 6 }}
            onClick={async () => { await stopPushAutomation(); toast('Push automation detenido', 'info'); loadAll(); }}>
            \u23F9 Detener
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600,
              background: activeTab === t.key ? '#D4A843' : 'rgba(255,255,255,0.08)',
              color: activeTab === t.key ? '#000' : '#ccc',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'retencion' && renderRetencion()}
      {activeTab === 'reconsumo' && renderReconsumo()}
      {activeTab === 'engagement' && renderEngagement()}
      {activeTab === 'urgencia' && renderUrgencia()}
      {activeTab === 'segmentos' && renderSegmentos()}
      {activeTab === 'onboarding' && renderOnboarding()}
      {activeTab === 'ajustes' && renderAjustes()}

      {/* SAVE BUTTON - sticky bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 20px',
        background: 'linear-gradient(transparent, rgba(15,12,8,0.95) 20%)',
        display: 'flex', justifyContent: 'center', zIndex: 100,
      }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 40px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(90deg, #D4A843, #FFD700, #D4A843)',
            color: '#000', fontWeight: 800, fontSize: '1rem',
            opacity: saving ? 0.6 : 1,
          }}>
          {saving ? '\u23F3 Guardando...' : '💾 Guardar Configuraci\u00f3n'}
        </button>
      </div>
    </div>
  );
}
