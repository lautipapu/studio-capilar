import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth';
import { MyAppointmentsPage } from '../src/pages/MyAppointmentsPage';
import '@testing-library/jest-dom';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const clientUser = { id: 'u1', name: 'Ana López', email: 'ana@test.com', role: 'cliente' as const };

const appointments = [
  {
    id: 'a1',
    clientId: 'u1',
    clientName: 'Ana López',
    professionalId: 'p1',
    professionalName: 'María Gómez',
    serviceId: 's1',
    serviceName: 'Corte de cabello',
    startAt: '2026-12-01T10:00:00.000Z',
    endAt: '2026-12-01T10:30:00.000Z',
    status: 'reservado' as const,
    priceCents: 350000,
  },
];

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
  localStorage.setItem('studio_capilar_token', 'token-cliente');
});

function renderPage() {
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: clientUser }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ appointments }) });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <MyAppointmentsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('MyAppointmentsPage', () => {
  it('lista los turnos del cliente', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Corte de cabello')).toBeInTheDocument();
      expect(screen.getByText('María Gómez')).toBeInTheDocument();
    });
  });

  it('quita el turno de la lista al cancelar exitosamente', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Corte de cabello')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /cancelar turno/i }));

    // Modal de confirmación
    await waitFor(() => expect(screen.getByText(/¿cancelar turno\?/i)).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ appointment: { ...appointments[0], status: 'cancelado' } }),
    });

    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }));

    await waitFor(() => {
      expect(screen.queryByText('Corte de cabello')).not.toBeInTheDocument();
    });
  });

  it('muestra el mensaje de LATE_CANCEL cuando el backend lo devuelve', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Corte de cabello')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /cancelar turno/i }));
    await waitFor(() => expect(screen.getByText(/¿cancelar turno\?/i)).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({
      ok: false, status: 422,
      json: async () => ({ error: { code: 'LATE_CANCEL', message: 'No se puede cancelar con menos de 24 hs de anticipación' } }),
    });

    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }));

    await waitFor(() => {
      expect(screen.getByText(/no se puede cancelar con menos de 24 hs/i)).toBeInTheDocument();
    });
  });
});
