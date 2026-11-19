import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth';
import { RegisterPage } from '../src/pages/RegisterPage';
import { LoginPage } from '../src/pages/LoginPage';
import '@testing-library/jest-dom';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

beforeEach(() => {
  mockFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
}

// ── Tests de registro ─────────────────────────────────────

describe('RegisterPage', () => {
  it('renderiza el formulario de registro', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByPlaceholderText(/tu nombre/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/correo@ejemplo\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
  });

  it('guarda el token bajo studio_capilar_token al registrarse exitosamente', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'test-token-123',
        user: { id: '1', name: 'Ana López', email: 'ana@test.com', role: 'cliente' },
      }),
    });

    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByPlaceholderText(/tu nombre/i), { target: { value: 'Ana López' } });
    fireEvent.change(screen.getByPlaceholderText(/correo@ejemplo\.com/i), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText(/mínimo 8 caracteres/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(localStorage.getItem('studio_capilar_token')).toBe('test-token-123');
    });
  });

  it('muestra error de validación si la contraseña es corta', async () => {
    renderWithProviders(<RegisterPage />);

    fireEvent.change(screen.getByPlaceholderText(/tu nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByPlaceholderText(/correo@ejemplo\.com/i), { target: { value: 'ana@test.com' } });
    fireEvent.change(screen.getByPlaceholderText(/mínimo 8 caracteres/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText(/al menos 8 caracteres/i)).toBeInTheDocument();
    });
  });
});

// ── Tests de login ────────────────────────────────────────

describe('LoginPage', () => {
  it('renderiza el formulario de ingreso', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByPlaceholderText(/correo@ejemplo\.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/tu contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ingresar/i })).toBeInTheDocument();
  });

  it('muestra error cuando las credenciales son inválidas', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } }),
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/correo@ejemplo\.com/i), { target: { value: 'x@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/tu contraseña/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByText(/credenciales inválidas/i)).toBeInTheDocument();
    });
  });

  it('guarda el token bajo studio_capilar_token al ingresar exitosamente', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        token: 'login-token-456',
        user: { id: '2', name: 'Carlos García', email: 'carlos@test.com', role: 'cliente' },
      }),
    });

    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText(/correo@ejemplo\.com/i), { target: { value: 'carlos@test.com' } });
    fireEvent.change(screen.getByPlaceholderText(/tu contraseña/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => {
      expect(localStorage.getItem('studio_capilar_token')).toBe('login-token-456');
    });
  });
});
