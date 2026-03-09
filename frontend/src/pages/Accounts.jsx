import { useState, useEffect } from 'react';
import { getAccounts, createAccount, updateAccount, deleteAccount, getProcessingMode, updateProcessingMode } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  tipo: 'telepagos',
  email: '',
  password: '',
  cuit: '',
  alias: '',
  cbu: '',
  titular: '',
  estatus: 'active',
};

export default function Accounts() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState({ show: false, id: null });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('telepagos');
  const [showPassword, setShowPassword] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);

  // Processing mode toggle
  const [processingMode, setProcessingMode] = useState('telepagos');
  const [modeLoading, setModeLoading] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const data = await getAccounts();
      setAccounts(Array.isArray(data) ? data : data.accounts || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchProcessingMode = async () => {
    try {
      const data = await getProcessingMode();
      setProcessingMode(data.mode || 'telepagos');
    } catch {
      // silently default
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchProcessingMode();
  }, []);

  const handleModeToggle = async () => {
    const newMode = processingMode === 'telepagos' ? 'manual' : 'telepagos';
    setModeLoading(true);
    try {
      await updateProcessingMode(newMode);
      setProcessingMode(newMode);
      toast(`Modo cambiado a: ${newMode === 'telepagos' ? 'Telepagos AI' : 'Manual'}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setModeLoading(false);
    }
  };

  // Filtered accounts by tab
  const filteredAccounts = accounts.filter(acc => (acc.tipo || 'telepagos') === activeTab);

  const stats = {
    total: accounts.length,
    telepagos: accounts.filter(a => (a.tipo || 'telepagos') === 'telepagos').length,
    manuales: accounts.filter(a => (a.tipo || 'telepagos') === 'manual').length,
    activas: accounts.filter(a => a.estatus === 'active').length,
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, tipo: activeTab });
    setShowFormPassword(false);
    setShowModal(true);
  };

  const openEdit = (account) => {
    setEditing(account);
    setForm({
      tipo: account.tipo || 'telepagos',
      email: account.email || '',
      password: account.password || '',
      cuit: account.cuit || '',
      alias: account.alias || '',
      cbu: account.cbu || '',
      titular: account.titular || '',
      estatus: account.estatus || 'active',
    });
    setShowFormPassword(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
    setShowFormPassword(false);
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateAccount(editing._id || editing.id, form);
        toast('Cuenta actualizada correctamente');
      } else {
        await createAccount(form);
        toast('Cuenta creada correctamente');
      }
      closeModal();
      fetchAccounts();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount(confirm.id);
      toast('Cuenta eliminada correctamente');
      setConfirm({ show: false, id: null });
      fetchAccounts();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const maskPassword = (pw) => {
    if (!pw) return '---';
    return '\u2022'.repeat(Math.min(pw.length, 12));
  };

  return (
    <div className="section-padded">
      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total Cuentas</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Telepagos</span>
          <span className="stat-value">{stats.telepagos}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Manuales</span>
          <span className="stat-value">{stats.manuales}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Activas</span>
          <span className="stat-value">{stats.activas}</span>
        </div>
      </div>

      {/* Processing Mode Toggle */}
      <div className="card" style={{ marginBottom: '1.2rem', padding: '1rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 2 }}>Modo de procesamiento</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-sec)' }}>
              {processingMode === 'telepagos'
                ? 'Telepagos AI esta procesando las transacciones automaticamente'
                : 'Las transacciones se procesan manualmente por los operadores'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: processingMode === 'manual' ? 'var(--gold)' : 'var(--text-sec)',
            }}>
              Manual
            </span>
            <label className="toggle-switch" style={{ opacity: modeLoading ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={processingMode === 'telepagos'}
                onChange={handleModeToggle}
                disabled={modeLoading}
              />
              <span className="toggle-slider"></span>
            </label>
            <span style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: processingMode === 'telepagos' ? 'var(--gold)' : 'var(--text-sec)',
            }}>
              Telepagos AI
            </span>
          </div>
        </div>
      </div>

      {/* Tabs: TELEPAGOS / MANUALES */}
      <div className="card">
        <div className="card-header">
          <div className="tab-group">
            <button
              className={`tab-btn${activeTab === 'telepagos' ? ' active' : ''}`}
              onClick={() => setActiveTab('telepagos')}
            >
              TELEPAGOS
              <span className="tag" style={{ marginLeft: 6 }}>{stats.telepagos}</span>
            </button>
            <button
              className={`tab-btn${activeTab === 'manual' ? ' active' : ''}`}
              onClick={() => setActiveTab('manual')}
            >
              MANUALES
              <span className="tag" style={{ marginLeft: 6 }}>{stats.manuales}</span>
            </button>
          </div>
          <button className="btn btn-gold" onClick={openCreate}>+ Nueva Cuenta</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Email</th>
                {activeTab === 'telepagos' && <th>Password</th>}
                <th>CUIT</th>
                <th>Alias</th>
                <th>CBU</th>
                <th>Titular</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={activeTab === 'telepagos' ? 9 : 8} style={{ textAlign: 'center', padding: '2rem' }}>
                    Cargando...
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'telepagos' ? 9 : 8} style={{ textAlign: 'center', padding: '2rem' }}>
                    No hay cuentas {activeTab === 'telepagos' ? 'de Telepagos' : 'manuales'} registradas
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc, i) => (
                  <tr key={acc._id || acc.id || i}>
                    <td>{i + 1}</td>
                    <td>{acc.email || '---'}</td>
                    {activeTab === 'telepagos' && (
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontSize: '0.85rem' }}>
                            {showPassword ? (acc.password || '---') : maskPassword(acc.password)}
                          </code>
                          <button
                            type="button"
                            className="btn btn-sm"
                            style={{ padding: '2px 6px', fontSize: '0.7rem', minWidth: 'auto' }}
                            onClick={() => setShowPassword(!showPassword)}
                            title={showPassword ? 'Ocultar' : 'Mostrar'}
                          >
                            {showPassword ? '🙈' : '👁'}
                          </button>
                        </span>
                      </td>
                    )}
                    <td>{acc.cuit || '---'}</td>
                    <td>{acc.alias || '---'}</td>
                    <td><code>{acc.cbu || '---'}</code></td>
                    <td>{acc.titular || '---'}</td>
                    <td>
                      <span className={`badge ${acc.estatus === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {acc.estatus === 'active' ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-blue" onClick={() => openEdit(acc)}>Editar</button>
                        <button className="btn btn-sm btn-red" onClick={() => setConfirm({ show: true, id: acc._id || acc.id })}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal show={showModal} onClose={closeModal} title={editing ? 'Editar Cuenta' : 'Nueva Cuenta'} width={520}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Tipo de Cuenta</label>
            <select className="form-input" name="tipo" value={form.tipo} onChange={handleChange} required>
              <option value="telepagos">Telepagos</option>
              <option value="manual">Manual</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="form-group">
              <label>Email</label>
              <input
                className="form-input"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="cuenta@email.com"
              />
            </div>

            {form.tipo === 'telepagos' && (
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    name="password"
                    type={showFormPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={handleChange}
                    required={form.tipo === 'telepagos'}
                    placeholder="Contrasena de Telepagos"
                    style={{ paddingRight: '2.5rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword(!showFormPassword)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '2px 4px',
                      color: 'var(--text-sec)',
                    }}
                    title={showFormPassword ? 'Ocultar' : 'Mostrar'}
                  >
                    {showFormPassword ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>CUIT</label>
              <input
                className="form-input"
                name="cuit"
                value={form.cuit}
                onChange={handleChange}
                placeholder="20-12345678-9"
              />
            </div>

            <div className="form-group">
              <label>Alias</label>
              <input
                className="form-input"
                name="alias"
                value={form.alias}
                onChange={handleChange}
                required
                placeholder="Ej: cuenta.principal.mp"
              />
            </div>
          </div>

          <div className="form-group">
            <label>CBU</label>
            <input
              className="form-input"
              name="cbu"
              value={form.cbu}
              onChange={handleChange}
              required
              placeholder="0000000000000000000000"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <div className="form-group">
              <label>Titular</label>
              <input
                className="form-input"
                name="titular"
                value={form.titular}
                onChange={handleChange}
                required
                placeholder="Nombre del titular"
              />
            </div>

            <div className="form-group">
              <label>Estado</label>
              <select className="form-input" name="estatus" value={form.estatus} onChange={handleChange}>
                <option value="active">Activa</option>
                <option value="inactive">Inactiva</option>
              </select>
            </div>
          </div>

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
        message="Estas seguro de que deseas eliminar esta cuenta? Esta accion no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ show: false, id: null })}
      />
    </div>
  );
}
