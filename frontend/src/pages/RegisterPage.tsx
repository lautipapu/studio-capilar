import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, ApiError } from '../api';
import { useAuth } from '../auth';
import { ErrorMessage } from '../components/ErrorMessage';

export function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const validate = (): string | null => {
    if (!form.name.trim()) return 'El nombre es obligatorio.';
    if (!form.email.trim()) return 'El correo es obligatorio.';
    if (form.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password))
      return 'La contraseña debe incluir al menos una letra y un número.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clientError = validate();
    if (clientError) { setError(new Error(clientError)); return; }
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await authApi.register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
      login(token, user);
      navigate('/');
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
          <p>Creá tu cuenta para reservar turnos</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack" noValidate>
          <div className="form-group">
            <label className="form-label">Nombre completo</label>
            <input
              className="form-input"
              type="text"
              placeholder="Tu nombre"
              value={form.name}
              onChange={set('name')}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Correo electrónico</label>
            <input
              className="form-input"
              type="email"
              placeholder="correo@ejemplo.com"
              value={form.email}
              onChange={set('email')}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              placeholder="Mínimo 8 caracteres con letra y número"
              value={form.password}
              onChange={set('password')}
              required
            />
            <span className="form-hint">Al menos 8 caracteres, una letra y un número.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Teléfono (opcional)</label>
            <input
              className="form-input"
              type="tel"
              placeholder="+54 9 11 1234-5678"
              value={form.phone}
              onChange={set('phone')}
            />
          </div>

          <ErrorMessage error={error} />

          <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
            {loading ? 'Registrando…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-3 text-muted" style={{ textAlign: 'center' }}>
          ¿Ya tenés cuenta?{' '}
          <Link to="/ingreso" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            Ingresá aquí
          </Link>
        </p>
      </div>
    </div>
  );
}
