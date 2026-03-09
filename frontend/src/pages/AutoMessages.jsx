import { useState, useEffect } from 'react';
import { getAutoMessages, createAutoMessage, updateAutoMessage, deleteAutoMessage } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const CATEGORIES = [
  { value: 'bienvenida', label: 'Bienvenida', color: 'var(--green)' },
  { value: 'carga', label: 'Carga', color: 'var(--gold)' },
  { value: 'retiro', label: 'Retiro', color: 'var(--blue)' },
  { value: 'soporte', label: 'Soporte', color: 'var(--purple)' },
  { value: 'cuponera', label: 'Cuponera', color: 'var(--orange)' },
  { value: 'error', label: 'Error', color: 'var(--red)' },
  { value: 'manual', label: 'Manual', color: 'var(--yellow)' },
  { value: 'general', label: 'General', color: 'var(--text-sec)' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const emptyForm = {
  tipo: '',
  categoria: '',
  mensaje: '',
};

function highlightVariables(text) {
  if (!text) return text;
  const parts = text.split(/({{[^}]+}})/g);
  return parts.map((part, i) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      return (
        <span key={i} style={{ color: 'var(--gold)', fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

function getCategoryStyle(categoria) {
  const cat = CATEGORY_MAP[categoria];
  if (!cat) return {};
  return {
    background: cat.color,
    color: '#111',
    fontWeight: 600,
    fontSize: '0.72rem',
    padding: '2px 10px',
    borderRadius: '999px',
    display: 'inline-block',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };
}

export default function AutoMessages() {
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState({ show: false, id: null });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('todos');

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const data = await getAutoMessages();
      setMessages(Array.isArray(data) ? data : data.messages || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  const filteredMessages = activeTab === 'todos'
    ? messages
    : messages.filter(msg => msg.categoria === activeTab);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (msg) => {
    setEditing(msg);
    setForm({
      tipo: msg.tipo || '',
      categoria: msg.categoria || '',
      mensaje: msg.mensaje || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateAutoMessage(editing._id || editing.id, form);
        toast('Mensaje actualizado correctamente');
      } else {
        await createAutoMessage(form);
        toast('Mensaje creado correctamente');
      }
      closeModal();
      fetchMessages();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAutoMessage(confirm.id);
      toast('Mensaje eliminado correctamente');
      setConfirm({ show: false, id: null });
      fetchMessages();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  // Count per category for badge numbers
  const categoryCounts = {};
  messages.forEach(msg => {
    const cat = msg.categoria || 'general';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  return (
    <div className="section-padded">
      {/* Header */}
      <div className="card-header" style={{ marginBottom: '1.2rem' }}>
        <span>Mensajes Automaticos</span>
        <button className="btn btn-gold" onClick={openCreate}>+ Nuevo Mensaje</button>
      </div>

      {/* Category Filter Tabs */}
      <div className="tab-group" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          className={`tab-btn${activeTab === 'todos' ? ' active' : ''}`}
          onClick={() => setActiveTab('todos')}
        >
          Todos
          <span className="tag" style={{ marginLeft: 6 }}>{messages.length}</span>
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            className={`tab-btn${activeTab === cat.value ? ' active' : ''}`}
            onClick={() => setActiveTab(cat.value)}
            style={activeTab === cat.value ? { borderBottomColor: cat.color } : {}}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: cat.color,
                display: 'inline-block',
                marginRight: 6,
              }}
            />
            {cat.label}
            {categoryCounts[cat.value] > 0 && (
              <span className="tag" style={{ marginLeft: 6 }}>{categoryCounts[cat.value]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Grid of cards */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>Cargando mensajes...</div>
      ) : filteredMessages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>
          {activeTab === 'todos'
            ? 'No hay mensajes automaticos configurados'
            : `No hay mensajes en la categoria "${CATEGORY_MAP[activeTab]?.label || activeTab}"`}
        </div>
      ) : (
        <div className="auto-msg-grid">
          {filteredMessages.map((msg) => {
            const cat = CATEGORY_MAP[msg.categoria] || CATEGORY_MAP['general'];
            return (
              <div className="auto-msg-card" key={msg._id || msg.id}>
                <div className="auto-msg-card-top">
                  <span style={getCategoryStyle(msg.categoria || 'general')}>
                    {cat?.label || msg.categoria || 'General'}
                  </span>
                  <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>{msg.tipo}</span>
                </div>
                <div className="msg-text">
                  {highlightVariables(msg.mensaje)}
                </div>
                <div className="auto-msg-card-actions">
                  <button className="btn btn-sm btn-blue" onClick={() => openEdit(msg)}>Editar</button>
                  <button className="btn btn-sm btn-red" onClick={() => setConfirm({ show: true, id: msg._id || msg.id })}>Eliminar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal show={showModal} onClose={closeModal} title={editing ? 'Editar Mensaje' : 'Nuevo Mensaje'} width={520}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Categoria</label>
            <select
              className="form-input"
              name="categoria"
              value={form.categoria}
              onChange={handleChange}
              required
            >
              <option value="">-- Seleccionar categoria --</option>
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Tipo (identificador)</label>
            <input
              className="form-input"
              name="tipo"
              value={form.tipo}
              onChange={handleChange}
              required
              placeholder="Ej: bienvenida_nuevo, deposito_ok, retiro_pendiente"
            />
          </div>
          <div className="form-group">
            <label>Mensaje</label>
            <textarea
              className="form-input"
              name="mensaje"
              value={form.mensaje}
              onChange={handleChange}
              required
              rows={6}
              placeholder="Usa {{variable}} para valores dinamicos. Ej: Hola {{nombre}}, tu deposito de {{monto}} fue recibido."
            />
          </div>
          {form.mensaje && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4, textTransform: 'uppercase' }}>Vista previa</div>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#ccc' }}>
                {highlightVariables(form.mensaje)}
              </div>
            </div>
          )}
          <div className="modal-footer">
            <button type="button" className="btn btn-gray" onClick={closeModal}>Cancelar</button>
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        show={confirm.show}
        message="Estas seguro de que deseas eliminar este mensaje automatico?"
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ show: false, id: null })}
      />
    </div>
  );
}
