import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { icon: '💬', label: 'Chats', path: '/chats' },
  { icon: '👤', label: 'Usuarios', path: '/usuarios' },
  { icon: '🎰', label: 'Clientes', path: '/clientes' },
  { icon: '⌨️', label: 'Comandos', path: '/comandos' },
  { icon: '📨', label: 'Mensajes', path: '/mensajes' },
  { icon: '🔗', label: 'APIs', path: '/apis' },
  { icon: '🏦', label: 'Cuentas', path: '/cuentas' },
  { icon: '🔔', label: 'Notificaciones', path: '/notificaciones' },
  { icon: '📲', label: 'Push Auto', path: '/push-auto' },
  { icon: '🎲', label: 'Eventos', path: '/eventos' },
  { icon: '📊', label: 'Analytics', path: '/analytics' },
  { icon: '💰', label: 'Palta Wallet', path: '/palta' },
  { icon: '⚙️', label: 'Ajustes', path: '/ajustes' },
];

const sectionTitles = {
  chats: 'Chats',
  usuarios: 'Usuarios',
  clientes: 'Clientes',
  comandos: 'Comandos',
  mensajes: 'Mensajes Automaticos',
  apis: 'Configuracion APIs',
  cuentas: 'Cuentas Bancarias',
  notificaciones: 'Notificaciones',
  'push-auto': 'Push Autom\u00e1ticos',
  eventos: 'Eventos y Sorteos',
  analytics: 'Analytics',
  palta: 'Palta Wallet',
  ajustes: 'Ajustes',
};

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const currentSection = location.pathname.split('/')[1] || 'chats';
  const pageTitle = sectionTitles[currentSection] || 'Dashboard';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo" onClick={() => navigate('/chats')}>
          <div className="diamond"><span>463</span></div>
        </div>

        <nav className="nav-items">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <div
                key={item.path}
                className={`nav-item${isActive ? ' active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-avatar">
            {user?.usuario?.charAt(0)?.toUpperCase() || 'A'}
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout} title="Cerrar Sesion">
            <span className="logout-icon">⏻</span>
            <span>Salir</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="top-bar">
          <h1>{pageTitle}</h1>
          <div className="top-bar-right">
            <div className="notif-bell">🔔</div>
            <div className="user-pill">
              <div className="up-avatar">
                {user?.usuario?.charAt(0)?.toUpperCase() || 'A'}
              </div>
              <span>{user?.nombre || user?.usuario || 'Admin'}</span>
            </div>
          </div>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default Layout;
