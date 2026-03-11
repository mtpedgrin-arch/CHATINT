import { useState, useEffect } from 'react';
import { getAccounts, createAccount, updateAccount, deleteAccount, getPaltaStatus, getProcessingMode, updateProcessingMode } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  tipo: 'manual',
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
  const [activeTab, setActiveTab] = useState('palta');
  const [showPassword, setShowPassword] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);

  // Palta live data
  const [paltaStatus, setPaltaStatus] = useState(null);
  const [accountMode, setAccountMode] = useState('auto');

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

  const fetchPaltaStatus = async () => {
    try {
      const data = await getPaltaStatus();
      setPaltaStatus(data);
    } catch {
      // silently fail
    }
  };

  const fetchAccountMode = async () => {
    try {
      const data = await getProcessingMode();
      setAccountMode(data.mode || 'auto');
    } catch {}
  };

  const toggleAccountMode = async (mode) => {
    try {
      await updateProcessingMode(mode);
      setAccountMode(mode);
      if (mode === 'manual') setActiveTab('manual');
      if (mode === 'auto') setActiveTab('palta');
      toast(mode === 'auto' ? 'Modo automatico (Palta) activado' : 'Modo manual activado');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchPaltaStatus();
    fetchAccountMode();
    const interval = setInterval(fetchPaltaStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  // Manual accounts only
  const manualAccounts = accounts.filter(acc => acc.tipo === 'manual');

  const stats = {
    total: accounts.length,
    manuales: manualAccounts.length,
    activas: accounts.filter(a => a.estatus === 'active').length,
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, tipo: 'manual' });
    setShowFormPassword(false);
    setShowModal(true);
  };

  const openEdit = (account) => {
    setEditing(account);
    setForm({
      tipo: account.tipo || 'manual',
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

  const paltaConnected = paltaStatus?.status === 'running' && paltaStatus?.apiMode;
  const paltaAccount = paltaStatus?.accountInfo;

  return (
    <div className="section-padded">
      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Palta</span>
          <span className="stat-value" style={{ color: paltaConnected ? '#22c55e' : '#ef4444' }}>
            {paltaConnected ? 'Conectada' : 'Desconectada'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Cuentas Manuales</span>
          <span className="stat-value">{stats.manuales}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Activas</span>
          <span className="stat-value">{stats.activas}</span>
        </div>
      </div>

      {/* Account Mode Switch */}
      <div className="card" style={{ padding: '1rem 1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>Modo de procesamiento</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-sec)', marginTop: 2 }}>
            {accountMode === 'auto'
              ? 'Los datos de cuenta se obtienen automaticamente de Palta.'
              : 'Se usa la primera cuenta manual activa para depositos.'}
          </div>
        </div>
        <div className="toggle-group">
          <button
            type="button"
            className={`toggle-btn ${accountMode === 'manual' ? 'active' : ''}`}
            onClick={() => toggleAccountMode('manual')}
          >
            Manual
          </button>
          <button
            type="button"
            className={`toggle-btn ${accountMode === 'auto' ? 'active' : ''}`}
            onClick={() => toggleAccountMode('auto')}
          >
            Automatica (Palta)
          </button>
        </div>
      </div>

      {/* Tabs: PALTA / MANUALES */}
      <div className="card">
        <div className="card-header">
          <div className="tab-group">
            <button
              className={`tab-btn${activeTab === 'palta' ? ' active' : ''}`}
              onClick={() => setActiveTab('palta')}
            >
              PALTA
            </button>
            <button
              className={`tab-btn${activeTab === 'manual' ? ' active' : ''}`}
              onClick={() => setActiveTab('manual')}
            >
              MANUALES
              <span className="tag" style={{ marginLeft: 6 }}>{stats.manuales}</span>
            </button>
          </div>
          {activeTab === 'manual' && (
            <button className="btn btn-gold" onClick={openCreate}>+ Nueva Cuenta</button>
          )}
        </div>

        {activeTab === 'palta' ? (
          /* Palta Tab — Live account data from API */
          <div style={{ padding: '1.5rem' }}>
            {paltaConnected && paltaAccount ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginBottom: 4 }}>TITULAR</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{paltaAccount.titular}</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginBottom: 4 }}>CUIT</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, fontFamily: 'monospace' }}>{paltaAccount.cuit}</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginBottom: 4 }}>CVU (CBU)</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>{paltaAccount.cvu}</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginBottom: 4 }}>ALIAS</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{paltaAccount.alias}</div>
                </div>
                <div style={{ gridColumn: '1 / -1', padding: '0.75rem 1rem', background: 'rgba(34,197,94,0.05)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.15)', fontSize: '0.85rem', color: 'var(--text-sec)' }}>
                  Estos datos se obtienen automaticamente de la cuenta Palta conectada ({paltaStatus.userName}). Cuando un jugador elige CBU o ALIAS en el chat, se le muestran estos datos.
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-sec)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💰</div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Palta no esta conectada</div>
                <div style={{ fontSize: '0.85rem' }}>
                  Conecta Palta en la seccion <strong>Palta Wallet</strong> para ver los datos de la cuenta automaticamente.
                  Mientras tanto, se usara la primera cuenta manual activa como fallback.
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Manual Tab — CRUD table */
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
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
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      Cargando...
                    </td>
                  </tr>
                ) : manualAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                      No hay cuentas manuales registradas
                    </td>
                  </tr>
                ) : (
                  manualAccounts.map((acc, i) => (
                    <tr key={acc._id || acc.id || i}>
                      <td>{i + 1}</td>
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
        )}
      </div>

      {/* Create / Edit Modal (manual accounts only) */}
      <Modal show={showModal} onClose={closeModal} title={editing ? 'Editar Cuenta' : 'Nueva Cuenta Manual'} width={520}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
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
