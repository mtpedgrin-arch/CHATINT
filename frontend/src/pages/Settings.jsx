import { useState, useEffect } from 'react';
import { getSettings, updateSettings, getButtonOptions, updateButtonOptions, getBonus, updateBonus, getPrizeTransactions } from '../api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';

const defaultSettings = {
  general: {
    siteName: '',
    siteUrl: '',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  chat: {
    chatMode: 'manual',
    accountMode: 'auto',
  },
  limits: {
    minRetiro: '',
    minDeposito: '',
    bonoBienvenida: '',
  },
};

const argentinaTimezones = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Salta',
  'America/Argentina/Tucuman',
  'America/Argentina/Jujuy',
  'America/Argentina/Catamarca',
  'America/Argentina/La_Rioja',
  'America/Argentina/San_Juan',
  'America/Argentina/Mendoza',
  'America/Argentina/San_Luis',
  'America/Argentina/Rio_Gallegos',
  'America/Argentina/Ushuaia',
];

export default function Settings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [confirmClean, setConfirmClean] = useState(false);
  const [btnOpts, setBtnOpts] = useState({
    carga: { type: 'option', link: '', enabled: true },
    retiro: { type: 'option', link: '', enabled: true },
    soporte: { type: 'option', link: '', enabled: true },
    cuponera: { type: 'option', link: '', enabled: true },
  });
  const [bonus, setBonus] = useState({ enabled: false, percentage: 0, name: 'Sin bono' });
  const [recentTx, setRecentTx] = useState([]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await getSettings();
      setSettings({
        general: {
          siteName: data.general?.siteName || data.siteName || '',
          siteUrl: data.general?.siteUrl || data.siteUrl || '',
          timezone: data.general?.timezone || data.timezone || 'America/Argentina/Buenos_Aires',
        },
        chat: {
          chatMode: data.chat?.chatMode || data.chatMode || 'manual',
          accountMode: data.chat?.accountMode || data.accountMode || 'auto',
        },
        limits: {
          minRetiro: data.limits?.minRetiro ?? data.minRetiro ?? '',
          minDeposito: data.limits?.minDeposito ?? data.minDeposito ?? '',
          bonoBienvenida: data.limits?.bonoBienvenida || data.bonoBienvenida || '',
        },
      });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchBtnOpts = async () => {
    try {
      const data = await getButtonOptions();
      setBtnOpts(prev => ({ ...prev, ...data }));
    } catch (e) {}
  };

  const fetchBonus = async () => {
    try {
      const data = await getBonus();
      setBonus(data);
      const txs = await getPrizeTransactions(10);
      setRecentTx(txs);
    } catch (e) {}
  };

  useEffect(() => {
    fetchSettings();
    fetchBtnOpts();
    fetchBonus();
  }, []);

  const handleChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const handleSave = async (section) => {
    setSaving(prev => ({ ...prev, [section]: true }));
    try {
      await updateSettings({ [section]: settings[section] });
      toast('Configuracion guardada correctamente');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(prev => ({ ...prev, [section]: false }));
    }
  };

  const handleBtnOptType = (key, type) => {
    setBtnOpts(prev => ({ ...prev, [key]: { ...prev[key], type } }));
  };
  const handleBtnOptLink = (key, link) => {
    setBtnOpts(prev => ({ ...prev, [key]: { ...prev[key], link } }));
  };
  const handleBtnOptEnabled = (key) => {
    setBtnOpts(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key]?.enabled } }));
  };
  const handleSaveBtnOpts = async () => {
    setSaving(prev => ({ ...prev, btnOpts: true }));
    try {
      await updateButtonOptions(btnOpts);
      toast('Opciones de botones guardadas');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(prev => ({ ...prev, btnOpts: false }));
    }
  };

  const handleSaveBonus = async () => {
    setSaving(prev => ({ ...prev, bonus: true }));
    try {
      const result = await updateBonus(bonus);
      setBonus(result);
      toast(result.enabled ? `Bono activado: ${result.name} (${result.percentage}%)` : 'Bono desactivado');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(prev => ({ ...prev, bonus: false }));
    }
  };

  const handleExport = async () => {
    try {
      const data = await getSettings();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `casino463-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Datos exportados correctamente');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleCleanChats = async () => {
    try {
      await updateSettings({ action: 'cleanChats' });
      toast('Chats limpiados correctamente');
      setConfirmClean(false);
    } catch (err) {
      toast(err.message, 'error');
      setConfirmClean(false);
    }
  };

  if (loading) {
    return (
      <div className="section-padded">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Cargando configuracion...</div>
      </div>
    );
  }

  return (
    <div className="section-padded">
      <div className="settings-grid">
        {/* Card 1: General */}
        <div className="card">
          <div className="card-header">
            <span>Configuracion General</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Nombre del Sitio</label>
              <input
                className="form-input"
                value={settings.general.siteName}
                onChange={(e) => handleChange('general', 'siteName', e.target.value)}
                placeholder="Casino 463"
              />
            </div>
            <div className="form-group">
              <label>URL del Sitio</label>
              <input
                className="form-input"
                value={settings.general.siteUrl}
                onChange={(e) => handleChange('general', 'siteUrl', e.target.value)}
                placeholder="https://casino463.com"
              />
            </div>
            <div className="form-group">
              <label>Zona Horaria</label>
              <select
                className="form-input"
                value={settings.general.timezone}
                onChange={(e) => handleChange('general', 'timezone', e.target.value)}
              >
                {argentinaTimezones.map(tz => (
                  <option key={tz} value={tz}>{tz.replace('America/Argentina/', 'Argentina/')}</option>
                ))}
              </select>
            </div>
            <button
              className="btn btn-gold"
              onClick={() => handleSave('general')}
              disabled={saving.general}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {saving.general ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>

        {/* Card 2: Chat y Automatizacion */}
        <div className="card">
          <div className="card-header">
            <span>Chat y Automatizacion</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Modo de Chat</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${settings.chat.chatMode === 'manual' ? 'active' : ''}`}
                  onClick={() => handleChange('chat', 'chatMode', 'manual')}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${settings.chat.chatMode === 'auto' ? 'active' : ''}`}
                  onClick={() => handleChange('chat', 'chatMode', 'auto')}
                >
                  Auto
                </button>
              </div>
              <span className="form-hint">
                {settings.chat.chatMode === 'manual'
                  ? 'Los operadores responden manualmente a cada mensaje.'
                  : 'La IA responde automaticamente a los mensajes entrantes.'}
              </span>
            </div>
            <div className="form-group">
              <label>Modo de cuenta</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${settings.chat.accountMode === 'manual' ? 'active' : ''}`}
                  onClick={() => handleChange('chat', 'accountMode', 'manual')}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${settings.chat.accountMode === 'auto' ? 'active' : ''}`}
                  onClick={() => handleChange('chat', 'accountMode', 'auto')}
                >
                  Automatica (Palta)
                </button>
              </div>
            </div>
            <button
              className="btn btn-gold"
              onClick={() => handleSave('chat')}
              disabled={saving.chat}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {saving.chat ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>

        {/* Card 3: Limites y Bonos */}
        <div className="card">
          <div className="card-header">
            <span>Limites y Bonos</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>Minimo Retiro</label>
              <input
                className="form-input"
                type="number"
                value={settings.limits.minRetiro}
                onChange={(e) => handleChange('limits', 'minRetiro', e.target.value)}
                placeholder="1000"
              />
            </div>
            <div className="form-group">
              <label>Minimo Deposito</label>
              <input
                className="form-input"
                type="number"
                value={settings.limits.minDeposito}
                onChange={(e) => handleChange('limits', 'minDeposito', e.target.value)}
                placeholder="500"
              />
            </div>
            <div className="form-group">
              <label>Bono de Bienvenida</label>
              <input
                className="form-input"
                value={settings.limits.bonoBienvenida}
                onChange={(e) => handleChange('limits', 'bonoBienvenida', e.target.value)}
                placeholder="200%"
              />
            </div>
            <button
              className="btn btn-gold"
              onClick={() => handleSave('limits')}
              disabled={saving.limits}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {saving.limits ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>

        {/* Card 4: Bono Activo para Premios */}
        <div className="card" style={{ border: bonus.enabled ? '1px solid #D4A843' : undefined }}>
          <div className="card-header">
            <span>{bonus.enabled ? '🔥' : '💰'} Bono Activo para Premios</span>
            {bonus.enabled && (
              <span style={{ background: '#D4A843', color: '#111', padding: '2px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>
                {bonus.percentage}% ACTIVO
              </span>
            )}
          </div>
          <div className="card-body">
            <p style={{ color: '#aaa', marginBottom: '1rem', fontSize: '0.85rem' }}>
              Cuando hay bono activo, los premios se ajustan automáticamente. Ej: premio de $500 con bono 100% → se acreditan $250 (el casino duplica a $500).
            </p>
            <div className="form-group">
              <label>Estado del Bono</label>
              <div className="toggle-group">
                <button
                  type="button"
                  className={`toggle-btn ${!bonus.enabled ? 'active' : ''}`}
                  onClick={() => setBonus(prev => ({ ...prev, enabled: false }))}
                >
                  Desactivado
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${bonus.enabled ? 'active' : ''}`}
                  onClick={() => setBonus(prev => ({ ...prev, enabled: true }))}
                  style={bonus.enabled ? { background: '#D4A843', color: '#111' } : {}}
                >
                  Activado
                </button>
              </div>
            </div>
            {bonus.enabled && (
              <>
                <div className="form-group">
                  <label>Nombre del Bono</label>
                  <input
                    className="form-input"
                    value={bonus.name}
                    onChange={(e) => setBonus(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Bono 100%"
                  />
                </div>
                <div className="form-group">
                  <label>Porcentaje del Bono (%)</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {[30, 50, 100, 200].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        className={`toggle-btn ${bonus.percentage === pct ? 'active' : ''}`}
                        onClick={() => setBonus(prev => ({ ...prev, percentage: pct, name: `Bono ${pct}%` }))}
                        style={{ fontSize: '0.8rem', padding: '4px 12px', ...(bonus.percentage === pct ? { background: '#D4A843', color: '#111' } : {}) }}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <input
                    className="form-input"
                    type="number"
                    value={bonus.percentage}
                    onChange={(e) => setBonus(prev => ({ ...prev, percentage: Number(e.target.value) }))}
                    placeholder="100"
                    min="1"
                    max="500"
                  />
                  <span className="form-hint">
                    Ejemplo: premio $1000, bono {bonus.percentage}% → se acreditan ${Math.round(1000 / (1 + bonus.percentage / 100))} fichas (casino agrega {bonus.percentage}% = $1000 total)
                  </span>
                </div>
              </>
            )}
            <button
              className="btn btn-gold"
              onClick={handleSaveBonus}
              disabled={saving.bonus}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              {saving.bonus ? 'Guardando...' : bonus.enabled ? `Activar Bono ${bonus.percentage}%` : 'Guardar (Bono Desactivado)'}
            </button>

            {/* Recent prize transactions */}
            {recentTx.length > 0 && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>Últimas acreditaciones:</div>
                <div style={{ maxHeight: 200, overflow: 'auto' }}>
                  {recentTx.map(tx => (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ color: '#ccc' }}>
                        {tx.source === 'scratch' ? '🎫' : tx.source === 'roulette' ? '🎰' : tx.source === 'quiz' ? '❓' : tx.source === 'event' ? '🏆' : '🎯'}
                        {' '}{tx.clientName || `#${tx.clientId}`}
                      </span>
                      <span>
                        {tx.bonusActive ? (
                          <span style={{ color: '#D4A843' }}>
                            ${tx.creditedAmount.toLocaleString()} <span style={{ fontSize: '0.7rem', color: '#888' }}>(de ${tx.originalAmount.toLocaleString()}, bono {tx.bonusPercentage}%)</span>
                          </span>
                        ) : (
                          <span style={{ color: '#4ade80' }}>${tx.originalAmount.toLocaleString()}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 5: Opciones de Botones */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <span>Opciones de Botones del Widget</span>
          </div>
          <div className="card-body">
            <p style={{ color: '#aaa', marginBottom: '1rem', fontSize: '0.85rem' }}>
              Configura cada botón del menú del widget. Puede ser una opción del flujo o un link externo.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[
                { key: 'carga', label: 'Botón de Cargar' },
                { key: 'retiro', label: 'Botón de Retirar' },
                { key: 'soporte', label: 'Botón de Soporte' },
                { key: 'cuponera', label: 'Botón de Cuponera' },
              ].map(({ key, label }) => (
                <div key={key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)', opacity: btnOpts[key]?.enabled === false ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</div>
                    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={btnOpts[key]?.enabled !== false}
                        onChange={() => handleBtnOptEnabled(key)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: btnOpts[key]?.enabled !== false ? '#D4A843' : '#444',
                        borderRadius: 11, transition: 'background 0.2s',
                      }}>
                        <span style={{
                          position: 'absolute', left: btnOpts[key]?.enabled !== false ? 20 : 2, top: 2,
                          width: 18, height: 18, background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
                        }} />
                      </span>
                    </label>
                  </div>
                  {btnOpts[key]?.enabled !== false && (
                    <>
                      <div className="toggle-group" style={{ marginBottom: 8 }}>
                        <button
                          type="button"
                          className={`toggle-btn ${btnOpts[key]?.type === 'link' ? 'active' : ''}`}
                          onClick={() => handleBtnOptType(key, 'link')}
                          style={{ fontSize: 11, padding: '4px 12px' }}
                        >
                          LINK
                        </button>
                        <button
                          type="button"
                          className={`toggle-btn ${btnOpts[key]?.type === 'option' ? 'active' : ''}`}
                          onClick={() => handleBtnOptType(key, 'option')}
                          style={{ fontSize: 11, padding: '4px 12px' }}
                        >
                          OPCIÓN
                        </button>
                      </div>
                      {btnOpts[key]?.type === 'link' && (
                        <input
                          className="form-input"
                          value={btnOpts[key]?.link || ''}
                          onChange={(e) => handleBtnOptLink(key, e.target.value)}
                          placeholder={`Link ${key}`}
                          style={{ fontSize: '0.85rem' }}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <button
              className="btn btn-gold"
              onClick={handleSaveBtnOpts}
              disabled={saving.btnOpts}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {saving.btnOpts ? 'Guardando...' : 'Guardar Opciones'}
            </button>
          </div>
        </div>

        {/* Card 5: Danger Zone */}
        <div className="card danger-zone">
          <div className="card-header">
            <span>Zona Peligrosa</span>
          </div>
          <div className="card-body">
            <p style={{ color: '#aaa', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Estas acciones pueden afectar datos importantes. Procede con precaucion.
            </p>
            <div className="danger-actions">
              <button className="btn btn-blue" onClick={handleExport}>
                Exportar Datos
              </button>
              <button className="btn btn-red" onClick={() => setConfirmClean(true)}>
                Limpiar Chats
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialog for Clean Chats */}
      <ConfirmDialog
        show={confirmClean}
        message="Estas seguro de que deseas limpiar todos los chats? Esta accion eliminara todo el historial de conversaciones y no se puede deshacer."
        onConfirm={handleCleanChats}
        onCancel={() => setConfirmClean(false)}
      />
    </div>
  );
}
