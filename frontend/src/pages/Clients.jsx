import { useState, useEffect } from 'react';
import { getClients, createClient, updateClient, deleteClient } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  casinoUsername: '',
  cuit: '',
  saldo: '',
  wager: '',
  saldoCobrable: '',
  estatus: 'active',
};

export default function Clients() {
  const { toast } = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState({ show: false, id: null });
  const [saving, setSaving] = useState(false);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const data = await getClients();
      setClients(Array.isArray(data) ? data : data.clients || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const stats = {
    total: clients.length,
    activos: clients.filter(c => c.estatus === 'active').length,
    vip: clients.filter(c => c.vip || c.esVip).length,
    conDeposito: clients.filter(c => Number(c.saldo) > 0).length,
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (client) => {
    setEditing(client);
    setForm({
      nombre: client.nombre || '',
      apellido: client.apellido || '',
      email: client.email || '',
      telefono: client.telefono || '',
      casinoUsername: client.casinoUsername || '',
      cuit: client.cuit || '',
      saldo: client.saldo ?? '',
      wager: client.wager ?? '',
      saldoCobrable: client.saldoCobrable ?? '',
      estatus: client.estatus || 'active',
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
        await updateClient(editing._id || editing.id, form);
        toast('Cliente actualizado correctamente');
      } else {
        await createClient(form);
        toast('Cliente creado correctamente');
      }
      closeModal();
      fetchClients();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteClient(confirm.id);
      toast('Cliente eliminado correctamente');
      setConfirm({ show: false, id: null });
      fetchClients();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const formatMoney = (val) => {
    const num = Number(val);
    return isNaN(num) ? '$0' : `$${num.toLocaleString('es-AR')}`;
  };

  return (
    <div className="section-padded">
      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total Clientes</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Activos</span>
          <span className="stat-value">{stats.activos}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">VIP</span>
          <span className="stat-value">{stats.vip}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Con Deposito</span>
          <span className="stat-value">{stats.conDeposito}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span>Listado de Clientes</span>
          <button className="btn btn-gold" onClick={openCreate}>+ Nuevo Cliente</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Usuario Casino</th>
                <th>Telefono</th>
                <th>Saldo</th>
                <th>Wager</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No hay clientes registrados</td></tr>
              ) : (
                clients.map((c, i) => (
                  <tr key={c._id || c.id || i}>
                    <td>{i + 1}</td>
                    <td>{c.nombre} {c.apellido}</td>
                    <td>{c.casinoUsername || '-'}</td>
                    <td>{c.telefono || '-'}</td>
                    <td>{formatMoney(c.saldo)}</td>
                    <td>{formatMoney(c.wager)}</td>
                    <td>
                      <span className={`badge ${c.estatus === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {c.estatus === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-blue" onClick={() => openEdit(c)}>Editar</button>
                        <button className="btn btn-sm btn-red" onClick={() => setConfirm({ show: true, id: c._id || c.id })}>Eliminar</button>
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
      <Modal show={showModal} onClose={closeModal} title={editing ? 'Editar Cliente' : 'Nuevo Cliente'} width={520}>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Nombre</label>
              <input className="form-input" name="nombre" value={form.nombre} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Apellido</label>
              <input className="form-input" name="apellido" value={form.apellido} onChange={handleChange} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Email</label>
              <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Telefono</label>
              <input className="form-input" name="telefono" value={form.telefono} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Usuario Casino</label>
              <input className="form-input" name="casinoUsername" value={form.casinoUsername} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>CUIT</label>
              <input className="form-input" name="cuit" value={form.cuit} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Saldo</label>
              <input className="form-input" type="number" name="saldo" value={form.saldo} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Wager</label>
              <input className="form-input" type="number" name="wager" value={form.wager} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Saldo Cobrable</label>
              <input className="form-input" type="number" name="saldoCobrable" value={form.saldoCobrable} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Estatus</label>
              <select className="form-input" name="estatus" value={form.estatus} onChange={handleChange}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
                <option value="suspended">Suspendido</option>
                <option value="banned">Baneado</option>
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
        message="Estas seguro de que deseas eliminar este cliente? Esta accion no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ show: false, id: null })}
      />
    </div>
  );
}
