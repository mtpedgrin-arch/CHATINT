import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  nombre: '',
  apellido: '',
  usuario: '',
  email: '',
  password: '',
  rol: 'operator',
  estatus: 'active',
  restriccion: '',
  inicio: '',
  fin: '',
};

export default function Users() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState({ show: false, id: null });
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const stats = {
    total: users.length,
    activos: users.filter(u => u.estatus === 'active').length,
    admins: users.filter(u => u.rol === 'admin').length,
    operadores: users.filter(u => u.rol === 'operator').length,
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditing(user);
    setForm({
      nombre: user.nombre || '',
      apellido: user.apellido || '',
      usuario: user.usuario || '',
      email: user.email || '',
      password: '',
      rol: user.rol || 'operator',
      estatus: user.estatus || 'active',
      restriccion: user.restriccion || '',
      inicio: user.inicio || '',
      fin: user.fin || '',
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
      const payload = { ...form };
      if (editing && !payload.password) delete payload.password;

      if (editing) {
        await updateUser(editing._id || editing.id, payload);
        toast('Usuario actualizado correctamente');
      } else {
        await createUser(payload);
        toast('Usuario creado correctamente');
      }
      closeModal();
      fetchUsers();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteUser(confirm.id);
      toast('Usuario eliminado correctamente');
      setConfirm({ show: false, id: null });
      fetchUsers();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="section-padded">
      {/* Stat Cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-label">Total Usuarios</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Activos</span>
          <span className="stat-value">{stats.activos}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Admins</span>
          <span className="stat-value">{stats.admins}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Operadores</span>
          <span className="stat-value">{stats.operadores}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="card">
        <div className="card-header">
          <span>Listado de Usuarios</span>
          <button className="btn btn-gold" onClick={openCreate}>+ Nuevo Usuario</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Restriccion</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>No hay usuarios registrados</td></tr>
              ) : (
                users.map((u, i) => (
                  <tr key={u._id || u.id || i}>
                    <td>{i + 1}</td>
                    <td>{u.nombre} {u.apellido}</td>
                    <td>{u.usuario}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.rol === 'admin' ? 'badge-gold' : u.rol === 'operator' ? 'badge-blue' : 'badge-gray'}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.estatus === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {u.estatus === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{u.restriccion || '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-blue" onClick={() => openEdit(u)}>Editar</button>
                        <button className="btn btn-sm btn-red" onClick={() => setConfirm({ show: true, id: u._id || u.id })}>Eliminar</button>
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
      <Modal show={showModal} onClose={closeModal} title={editing ? 'Editar Usuario' : 'Nuevo Usuario'} width={520}>
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
              <label>Usuario</label>
              <input className="form-input" name="usuario" value={form.usuario} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
          </div>
          <div className="form-group">
            <label>Password {editing && '(dejar vacio para no cambiar)'}</label>
            <input className="form-input" type="password" name="password" value={form.password} onChange={handleChange} {...(!editing && { required: true })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Rol</label>
              <select className="form-input" name="rol" value={form.rol} onChange={handleChange}>
                <option value="admin">Admin</option>
                <option value="operator">Operador</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="form-group">
              <label>Estatus</label>
              <select className="form-input" name="estatus" value={form.estatus} onChange={handleChange}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Restriccion</label>
            <input className="form-input" name="restriccion" value={form.restriccion} onChange={handleChange} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Inicio (hora)</label>
              <input className="form-input" type="time" name="inicio" value={form.inicio} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Fin (hora)</label>
              <input className="form-input" type="time" name="fin" value={form.fin} onChange={handleChange} />
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
        message="Estas seguro de que deseas eliminar este usuario? Esta accion no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ show: false, id: null })}
      />
    </div>
  );
}
