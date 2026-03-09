import { useState, useEffect } from 'react';
import { getCommands, createCommand, updateCommand, deleteCommand } from '../api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

const emptyForm = {
  nombre: '',
  comando: '/',
  mensaje: '',
  estatus: 'active',
};

export default function Commands() {
  const { toast } = useToast();
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirm, setConfirm] = useState({ show: false, id: null });
  const [saving, setSaving] = useState(false);

  const fetchCommands = async () => {
    try {
      setLoading(true);
      const data = await getCommands();
      setCommands(Array.isArray(data) ? data : data.commands || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommands();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (cmd) => {
    setEditing(cmd);
    setForm({
      nombre: cmd.nombre || '',
      comando: cmd.comando || '/',
      mensaje: cmd.mensaje || '',
      estatus: cmd.estatus || 'active',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'comando' && !value.startsWith('/')) {
      setForm(prev => ({ ...prev, comando: '/' + value }));
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateCommand(editing._id || editing.id, form);
        toast('Comando actualizado correctamente');
      } else {
        await createCommand(form);
        toast('Comando creado correctamente');
      }
      closeModal();
      fetchCommands();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCommand(confirm.id);
      toast('Comando eliminado correctamente');
      setConfirm({ show: false, id: null });
      fetchCommands();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="section-padded">
      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span>Listado de Comandos</span>
          <button className="btn btn-gold" onClick={openCreate}>+ Nuevo Comando</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nombre</th>
                <th>Comando</th>
                <th>Mensaje</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Cargando...</td></tr>
              ) : commands.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>No hay comandos registrados</td></tr>
              ) : (
                commands.map((cmd, i) => (
                  <tr key={cmd._id || cmd.id || i}>
                    <td>{i + 1}</td>
                    <td>{cmd.nombre}</td>
                    <td><code>{cmd.comando}</code></td>
                    <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cmd.mensaje}
                    </td>
                    <td>
                      <span className={`badge ${cmd.estatus === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {cmd.estatus === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-sm btn-blue" onClick={() => openEdit(cmd)}>Editar</button>
                        <button className="btn btn-sm btn-red" onClick={() => setConfirm({ show: true, id: cmd._id || cmd.id })}>Eliminar</button>
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
      <Modal show={showModal} onClose={closeModal} title={editing ? 'Editar Comando' : 'Nuevo Comando'} width={480}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nombre</label>
            <input className="form-input" name="nombre" value={form.nombre} onChange={handleChange} required placeholder="Ej: Bienvenida" />
          </div>
          <div className="form-group">
            <label>Comando (debe iniciar con /)</label>
            <input className="form-input" name="comando" value={form.comando} onChange={handleChange} required placeholder="/bienvenida" />
          </div>
          <div className="form-group">
            <label>Mensaje</label>
            <textarea className="form-input" name="mensaje" value={form.mensaje} onChange={handleChange} required rows={4} placeholder="Texto del mensaje..." />
          </div>
          <div className="form-group">
            <label>Estatus</label>
            <select className="form-input" name="estatus" value={form.estatus} onChange={handleChange}>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
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
        message="Estas seguro de que deseas eliminar este comando? Esta accion no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ show: false, id: null })}
      />
    </div>
  );
}
