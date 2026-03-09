import { useState, useEffect, useRef } from 'react';
import { getApiConfig, updateApiConfig } from '../api';
import { useToast } from '../context/ToastContext';

const defaultConfig = {
  casino: { token: '', url: '', user: '', password: '', cajaId: '' },
  openai: { apiKey: '', model: 'gpt-4o-mini' },
};

const sectionLabels = {
  casino: 'Casino 463',
  openai: 'OpenAI',
};

// Fields that are masked by the backend (contain ••••••)
// We track which fields the user has actually edited
const SENSITIVE_FIELDS = {
  casino: ['token', 'password'],
  openai: ['apiKey'],
};

export default function ApiConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  // Track which fields user has actually edited (to avoid sending masked values back)
  const editedFields = useRef({});
  const [visibility, setVisibility] = useState({
    casinoToken: false,
    casinoPassword: false,
    openaiApiKey: false,
  });

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const data = await getApiConfig();
      setConfig({
        casino: {
          token: data.casino?.token || '',
          url: data.casino?.url || '',
          user: data.casino?.user || '',
          password: data.casino?.password || '',
          cajaId: data.casino?.cajaId || '',
        },
        openai: {
          apiKey: data.openai?.apiKey || '',
          model: data.openai?.model || 'gpt-4o-mini',
        },
      });
      // Reset edited fields tracking
      editedFields.current = {};
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleChange = (section, field, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
    // Track that this field was edited by the user
    if (!editedFields.current[section]) editedFields.current[section] = {};
    editedFields.current[section][field] = true;
  };

  const toggleVisibility = (field) => {
    setVisibility(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSave = async (section) => {
    setSaving(prev => ({ ...prev, [section]: true }));
    try {
      // Only send fields that the user actually edited for sensitive fields
      // For non-sensitive fields, always send them
      const dataToSend = {};
      const sensitiveForSection = SENSITIVE_FIELDS[section] || [];

      for (const [key, value] of Object.entries(config[section])) {
        if (sensitiveForSection.includes(key)) {
          // Only include sensitive field if user actually edited it
          if (editedFields.current[section]?.[key]) {
            dataToSend[key] = value;
          }
          // Otherwise skip it (backend keeps the existing value)
        } else {
          dataToSend[key] = value;
        }
      }

      await updateApiConfig(section, dataToSend);
      toast(`Configuracion de ${sectionLabels[section] || section} guardada`);
      // Re-fetch config to show masked values (visual confirmation that it saved)
      await fetchConfig();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(prev => ({ ...prev, [section]: false }));
    }
  };

  // Helper to check if a value is masked
  const isMasked = (value) => typeof value === 'string' && value.includes('••••••');

  // Helper to render a sensitive input with eye toggle
  const renderSensitiveInput = (section, field, visKey, placeholder, label, hint) => (
    <div className="form-group">
      <label>{label}</label>
      <div className="input-toggle-wrap">
        <input
          className="form-input"
          type={visibility[visKey] ? 'text' : 'password'}
          value={config[section][field]}
          onChange={(e) => handleChange(section, field, e.target.value)}
          placeholder={placeholder}
          style={isMasked(config[section][field]) && !editedFields.current[section]?.[field]
            ? { color: '#6b7280', fontStyle: 'italic' }
            : {}
          }
          onFocus={(e) => {
            // When user focuses a masked field, clear it so they can type the new value
            if (isMasked(e.target.value)) {
              handleChange(section, field, '');
            }
          }}
        />
        <button
          type="button"
          className="btn-eye"
          onClick={() => toggleVisibility(visKey)}
          title={visibility[visKey] ? 'Ocultar' : 'Mostrar'}
        >
          {visibility[visKey] ? '\uD83D\uDE48' : '\uD83D\uDC41\uFE0F'}
        </button>
      </div>
      {hint && (
        <small style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: '4px', display: 'block' }}>
          {hint}
        </small>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="section-padded">
        <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Cargando configuracion...</div>
      </div>
    );
  }

  return (
    <div className="section-padded">
      <div className="api-grid">
        {/* Casino 463 */}
        <div className="card">
          <div className="card-header">
            <span><span style={{ marginRight: '0.5rem' }}>{'\uD83C\uDFB0'}</span> Casino 463</span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginLeft: 'auto' }}>admin.463.life</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label>URL del Admin</label>
              <input
                className="form-input"
                type="text"
                value={config.casino.url}
                onChange={(e) => handleChange('casino', 'url', e.target.value)}
                placeholder="https://admin.463.life"
              />
            </div>
            <div className="form-group">
              <label>Usuario Admin</label>
              <input
                className="form-input"
                type="text"
                value={config.casino.user}
                onChange={(e) => handleChange('casino', 'user', e.target.value)}
                placeholder="admin"
              />
            </div>
            {renderSensitiveInput('casino', 'password', 'casinoPassword', 'Password del admin', 'Password Admin', null)}
            {renderSensitiveInput('casino', 'token', 'casinoToken', 'Token de acceso (opcional)', 'Token', null)}
            <div className="form-group">
              <label>ID de Caja</label>
              <input
                className="form-input"
                type="text"
                value={config.casino.cajaId}
                onChange={(e) => handleChange('casino', 'cajaId', e.target.value)}
                placeholder="12345"
              />
              <small style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: '4px', display: 'block' }}>
                ID de la caja/terminal donde se crean usuarios y manejan balances
              </small>
            </div>
            <button className="btn btn-gold" onClick={() => handleSave('casino')} disabled={saving.casino} style={{ width: '100%', marginTop: '0.5rem' }}>
              {saving.casino ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* OpenAI — OCR de comprobantes */}
        <div className="card">
          <div className="card-header">
            <span><span style={{ marginRight: '0.5rem' }}>{'\uD83E\uDDE0'}</span> OpenAI</span>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginLeft: 'auto' }}>OCR de comprobantes</span>
          </div>
          <div className="card-body">
            {renderSensitiveInput('openai', 'apiKey', 'openaiApiKey', 'sk-proj-...', 'API Key', 'Se usa para leer comprobantes de pago con Vision AI')}
            <div className="form-group">
              <label>Modelo</label>
              <select
                className="form-input"
                value={config.openai.model}
                onChange={(e) => handleChange('openai', 'model', e.target.value)}
              >
                <option value="gpt-4o-mini">gpt-4o-mini (rapido y barato)</option>
                <option value="gpt-4o">gpt-4o (mas preciso)</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
              </select>
            </div>
            <button className="btn btn-gold" onClick={() => handleSave('openai')} disabled={saving.openai} style={{ width: '100%', marginTop: '0.5rem' }}>
              {saving.openai ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
