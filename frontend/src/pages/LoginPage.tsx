import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../auth';
import { ErrorMessage } from '../components/ErrorMessage';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await authApi.login({ email: email.trim(), password });
      await login(token, user);
      if (from) {
        navigate(from, { replace: true });
      } else {
        // Redirigir según rol
        if (user.role === 'administrador') navigate('/admin');
        else if (user.role === 'profesional') navigate('/agenda');
        else navigate('/');
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>Studio <span>Capilar</span></h1>
          <p>Ingresá a tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          <div className="form-group">
            <label className="form-label">Correo electrónico</label>
            <input
              className="form-input"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              placeholder="Tu contraseña"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <ErrorMessage error={error} />

          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-3 text-muted" style={{ textAlign: 'center' }}>
          ¿No tenés cuenta?{' '}
          <Link to="/registro" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            Registrate aquí
          </Link>
        </p>
      </div>
    </div>
  );
}
