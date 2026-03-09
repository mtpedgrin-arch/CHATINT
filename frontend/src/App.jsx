import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Chats from './pages/Chats';
import Users from './pages/Users';
import Clients from './pages/Clients';
import Commands from './pages/Commands';
import AutoMessages from './pages/AutoMessages';
import ApiConfig from './pages/ApiConfig';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Events from './pages/Events';
import Analytics from './pages/Analytics';
import PaltaWallet from './pages/PaltaWallet';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/chats" replace />} />
        <Route path="chats" element={<Chats />} />
        <Route path="usuarios" element={<Users />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="comandos" element={<Commands />} />
        <Route path="mensajes" element={<AutoMessages />} />
        <Route path="apis" element={<ApiConfig />} />
        <Route path="cuentas" element={<Accounts />} />
        <Route path="notificaciones" element={<Notifications />} />
        <Route path="eventos" element={<Events />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="palta" element={<PaltaWallet />} />
        <Route path="ajustes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
