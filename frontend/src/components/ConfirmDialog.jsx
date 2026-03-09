export default function ConfirmDialog({ show, message, onConfirm, onCancel }) {
  return (
    <div className={`confirm-overlay ${show ? 'show' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="confirm-box">
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-gray" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-red" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
