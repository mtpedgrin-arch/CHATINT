import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PARTICLE_COUNT = 28;

function generateParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 6 + 6,
    delay: Math.random() * 8,
    opacity: Math.random() * 0.5 + 0.1,
  }));
}

const particles = generateParticles();

export default function Login() {
  const { loginUser, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chats', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!usuario.trim() || !password.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }

    try {
      await loginUser(usuario.trim(), password);
      navigate('/chats', { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Error al iniciar sesion. Verifica tus credenciales.'
      );
    }
  };

  return (
    <>
      <style>{`
        *, *::before, *::after {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        @keyframes orbFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(80px, -120px) scale(1.1); }
          50% { transform: translate(-60px, -60px) scale(0.95); }
          75% { transform: translate(40px, 80px) scale(1.05); }
        }

        @keyframes orbFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-100px, 60px) scale(1.08); }
          50% { transform: translate(70px, 100px) scale(0.92); }
          75% { transform: translate(-40px, -80px) scale(1.04); }
        }

        @keyframes orbFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(60px, 100px) scale(0.96); }
          50% { transform: translate(-90px, -40px) scale(1.1); }
          75% { transform: translate(50px, -70px) scale(1.02); }
        }

        @keyframes particleRise {
          0% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          10% {
            opacity: var(--particle-opacity, 0.3);
          }
          90% {
            opacity: var(--particle-opacity, 0.3);
          }
          100% {
            transform: translateY(-100vh) translateX(30px);
            opacity: 0;
          }
        }

        @keyframes cardFadeIn {
          0% {
            opacity: 0;
            transform: translateY(30px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        @keyframes spinLoader {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes diamondPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(212, 168, 67, 0.3), 0 0 40px rgba(212, 168, 67, 0.1); }
          50% { box-shadow: 0 0 30px rgba(212, 168, 67, 0.5), 0 0 60px rgba(212, 168, 67, 0.2); }
        }

        @keyframes errorShake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-4px); }
          30%, 70% { transform: translateX(4px); }
        }

        .login-page {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #0a0a0f;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        .login-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          will-change: transform;
        }

        .login-bg-orb--1 {
          width: 500px;
          height: 500px;
          top: -10%;
          left: -5%;
          background: radial-gradient(circle, rgba(212, 168, 67, 0.15) 0%, rgba(30, 25, 10, 0.05) 70%, transparent 100%);
          animation: orbFloat1 20s ease-in-out infinite;
        }

        .login-bg-orb--2 {
          width: 400px;
          height: 400px;
          bottom: -8%;
          right: -3%;
          background: radial-gradient(circle, rgba(212, 168, 67, 0.12) 0%, rgba(20, 18, 8, 0.06) 70%, transparent 100%);
          animation: orbFloat2 25s ease-in-out infinite;
        }

        .login-bg-orb--3 {
          width: 350px;
          height: 350px;
          top: 40%;
          right: 25%;
          background: radial-gradient(circle, rgba(244, 228, 160, 0.08) 0%, rgba(212, 168, 67, 0.03) 70%, transparent 100%);
          animation: orbFloat3 22s ease-in-out infinite;
        }

        .login-particle {
          position: absolute;
          bottom: -10px;
          border-radius: 50%;
          background: #D4A843;
          pointer-events: none;
          animation: particleRise linear infinite;
          will-change: transform, opacity;
        }

        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 420px;
          margin: 0 20px;
          padding: 48px 40px 40px;
          background: rgba(17, 18, 24, 0.85);
          border: 1px solid #1e1f2e;
          border-radius: 24px;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          animation: cardFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .login-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(212, 168, 67, 0.3), transparent);
          border-radius: 24px 24px 0 0;
        }

        .login-logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
        }

        .login-diamond {
          width: 68px;
          height: 68px;
          transform: rotate(45deg);
          background: linear-gradient(135deg, #D4A843 0%, #a07830 50%, #D4A843 100%);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: diamondPulse 3s ease-in-out infinite;
          position: relative;
        }

        .login-diamond::after {
          content: '';
          position: absolute;
          inset: 2px;
          border-radius: 12px;
          border: 1px solid rgba(244, 228, 160, 0.25);
        }

        .login-diamond-text {
          transform: rotate(-45deg);
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 1px;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
          user-select: none;
        }

        .login-title {
          text-align: center;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 1px;
          margin-bottom: 6px;
          background: linear-gradient(135deg, #F4E4A0, #D4A843, #F4E4A0);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }

        .login-subtitle {
          text-align: center;
          font-size: 14px;
          color: #9ca3af;
          margin-bottom: 36px;
          font-weight: 400;
          letter-spacing: 0.5px;
        }

        .login-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: errorShake 0.4s ease-in-out;
        }

        .login-error-icon {
          flex-shrink: 0;
          width: 18px;
          height: 18px;
          color: #ef4444;
        }

        .login-error-text {
          font-size: 13px;
          color: #ef4444;
          line-height: 1.4;
        }

        .login-field {
          margin-bottom: 20px;
        }

        .login-field-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #9ca3af;
          margin-bottom: 8px;
          letter-spacing: 0.3px;
        }

        .login-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid #1e1f2e;
          border-radius: 12px;
          transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
        }

        .login-input-wrap--focused {
          border-color: rgba(212, 168, 67, 0.5);
          box-shadow: 0 0 0 3px rgba(212, 168, 67, 0.08);
          background: rgba(255, 255, 255, 0.06);
        }

        .login-input-icon {
          position: absolute;
          left: 14px;
          width: 18px;
          height: 18px;
          color: #9ca3af;
          pointer-events: none;
          transition: color 0.3s;
        }

        .login-input-wrap--focused .login-input-icon {
          color: #D4A843;
        }

        .login-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 14px 14px 14px 44px;
          font-size: 15px;
          color: #ffffff;
          font-family: inherit;
          letter-spacing: 0.3px;
        }

        .login-input::placeholder {
          color: rgba(156, 163, 175, 0.5);
        }

        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 1000px rgba(17, 18, 24, 1) inset;
          transition: background-color 5000s ease-in-out 0s;
        }

        .login-eye-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px 14px 8px 8px;
          color: #9ca3af;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .login-eye-btn:hover {
          color: #D4A843;
        }

        .login-eye-btn svg {
          width: 18px;
          height: 18px;
        }

        .login-submit {
          width: 100%;
          margin-top: 8px;
          padding: 15px 24px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #D4A843, #a07830);
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0.8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: transform 0.2s, box-shadow 0.2s, opacity 0.2s;
          font-family: inherit;
          position: relative;
          overflow: hidden;
        }

        .login-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(244, 228, 160, 0.2), transparent, rgba(244, 228, 160, 0.1));
          opacity: 0;
          transition: opacity 0.3s;
        }

        .login-submit:hover:not(:disabled)::before {
          opacity: 1;
        }

        .login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(212, 168, 67, 0.3);
        }

        .login-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .login-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spinLoader 0.7s linear infinite;
        }

        .login-footer {
          margin-top: 32px;
          text-align: center;
          font-size: 12px;
          color: rgba(156, 163, 175, 0.4);
          letter-spacing: 0.3px;
        }
      `}</style>

      <div className="login-page">
        {/* Floating gradient orbs */}
        <div className="login-bg-orb login-bg-orb--1" />
        <div className="login-bg-orb login-bg-orb--2" />
        <div className="login-bg-orb login-bg-orb--3" />

        {/* Gold particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="login-particle"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              '--particle-opacity': p.opacity,
            }}
          />
        ))}

        {/* Login card */}
        <div className="login-card">
          {/* Diamond logo */}
          <div className="login-logo-wrap">
            <div className="login-diamond">
              <span className="login-diamond-text">463</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="login-title">Casino 463</h1>
          <p className="login-subtitle">Panel de Administracion</p>

          {/* Error message */}
          {error && (
            <div className="login-error">
              <svg className="login-error-icon" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="login-error-text">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Username field */}
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-usuario">
                Usuario
              </label>
              <div
                className={`login-input-wrap${focusedField === 'usuario' ? ' login-input-wrap--focused' : ''}`}
              >
                <svg className="login-input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                </svg>
                <input
                  id="login-usuario"
                  className="login-input"
                  type="text"
                  placeholder="Ingresa tu usuario"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  onFocus={() => setFocusedField('usuario')}
                  onBlur={() => setFocusedField(null)}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="login-field">
              <label className="login-field-label" htmlFor="login-password">
                Contrasena
              </label>
              <div
                className={`login-input-wrap${focusedField === 'password' ? ' login-input-wrap--focused' : ''}`}
              >
                <svg className="login-input-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <input
                  id="login-password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingresa tu contrasena"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showPassword ? (
                    /* Eye-off icon */
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    /* Eye icon */
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading && <div className="login-spinner" />}
              {loading ? 'Iniciando sesion...' : 'Iniciar Sesion'}
            </button>
          </form>

          <div className="login-footer">
            Casino 463 &mdash; Panel de Administracion
          </div>
        </div>
      </div>
    </>
  );
}
