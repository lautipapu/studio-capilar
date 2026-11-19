import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth';
import { AdminPage } from '../src/pages/AdminPage';
import '@testing-library/jest-dom';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const adminUser = { id: 'a1', name: 'Admin', email: 'admin@test.com', role: 'administrador' as const };
const clientUser = { id: 'u1', name: 'Ana', email: 'ana@test.com', role: 'cliente' as const };

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

function renderAsAdmin() {
  localStorage.setItem('studio_capilar_token', 'token-admin');
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: adminUser }) })
    // Servicios (tab inicial)
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ services: [] }) });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <AdminPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  it('muestra las 4 secciones de administración', async () => {
    renderAsAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /servicios/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /profesionales/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /clientes/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /turnos/i })).toBeInTheDocument();
    });
  });

  it('la sección de servicios llama al endpoint GET /api/services?includeInactive=true', async () => {
    renderAsAdmin();
    await waitFor(() => expect(screen.getByRole('button', { name: /servicios/i })).toBeInTheDocument());

    // Verificar que fetch fue llamado con la URL correcta
    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const serviceCall = calls.find(([url]: [string]) =>
        typeof url === 'string' && url.includes('/api/services'),
      );
      expect(serviceCall).toBeTruthy();
      expect(serviceCall[0]).toContain('includeInactive=true');
    });
  });

  it('muestra el formulario de creación de servicio', async () => {
    renderAsAdmin();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /crear servicio/i })).toBeInTheDocument();
    });
  });

  it('un usuario sin rol de admin recibe error 403 al intentar listar servicios', async () => {
    // Simular que el backend responde 403 para un cliente
    localStorage.setItem('studio_capilar_token', 'token-cliente');
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: clientUser }) })
      .mockResolvedValueOnce({
        ok: false, status: 403,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'No autorizado' } }),
      });

    render(
      <MemoryRouter>
        <AuthProvider>
          <AdminPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no autorizado/i)).toBeInTheDocument();
    });
  });
});
