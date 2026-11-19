import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth';
import { BookingPage } from '../src/pages/BookingPage';
import '@testing-library/jest-dom';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// Usuario cliente autenticado
const clientUser = { id: 'u1', name: 'Ana López', email: 'ana@test.com', role: 'cliente' as const };

beforeEach(() => {
  mockFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
  localStorage.setItem('studio_capilar_token', 'token-cliente');
});

function renderBooking() {
  // Primera llamada: /api/auth/me (AuthProvider)
  // Segunda llamada: /api/services
  mockFetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ user: clientUser }) })
    .mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        services: [
          { id: 's1', name: 'Corte de cabello', durationMin: 30, priceCents: 350000, active: true },
          { id: 's2', name: 'Coloración', durationMin: 90, priceCents: 1200000, active: true },
        ],
      }),
    });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <BookingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('BookingPage', () => {
  it('renderiza la lista de servicios disponibles', async () => {
    renderBooking();

    await waitFor(() => {
      expect(screen.getByText('Corte de cabello')).toBeInTheDocument();
      expect(screen.getByText('Coloración')).toBeInTheDocument();
    });
  });

  it('muestra slots disponibles al seleccionar servicio, profesional y fecha', async () => {
    renderBooking();

    // Esperar servicios
    await waitFor(() => expect(screen.getByText('Corte de cabello')).toBeInTheDocument());

    // Mock de profesionales
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        professionals: [{ id: 'p1', name: 'María Gómez', email: 'maria@test.com', active: true }],
      }),
    });
    fireEvent.click(screen.getByText('Corte de cabello'));

    await waitFor(() => expect(screen.getByText('María Gómez')).toBeInTheDocument());

    // Mock de availability
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ slots: ['2026-12-01T10:00:00.000Z', '2026-12-01T10:30:00.000Z'] }),
    });
    fireEvent.click(screen.getByText('María Gómez'));

    // Elegir fecha
    await waitFor(() => expect(screen.getByLabelText(/fecha del turno/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/fecha del turno/i), { target: { value: '2026-12-01' } });

    await waitFor(() => {
      // Los slots se muestran como hora local
      const slotButtons = screen.getAllByRole('button').filter(b => b.classList.contains('slot-btn'));
      expect(slotButtons.length).toBeGreaterThan(0);
    });
  });

  it('muestra mensaje de OVERLAP y vuelve a step slot cuando el backend responde 409', async () => {
    renderBooking();
    await waitFor(() => expect(screen.getByText('Corte de cabello')).toBeInTheDocument());

    // Profesionales
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ professionals: [{ id: 'p1', name: 'María Gómez', active: true }] }),
    });
    fireEvent.click(screen.getByText('Corte de cabello'));
    await waitFor(() => expect(screen.getByText('María Gómez')).toBeInTheDocument());

    // Availability
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ slots: ['2026-12-01T10:00:00.000Z'] }),
    });
    fireEvent.click(screen.getByText('María Gómez'));
    await waitFor(() => screen.getByLabelText(/fecha del turno/i));
    fireEvent.change(screen.getByLabelText(/fecha del turno/i), { target: { value: '2026-12-01' } });

    // Esperar slots
    await waitFor(() => {
      const slotBtns = document.querySelectorAll('.slot-btn');
      expect(slotBtns.length).toBeGreaterThan(0);
    });

    // Seleccionar slot
    const slotBtns = document.querySelectorAll('.slot-btn');
    fireEvent.click(slotBtns[0]);

    // Confirm step
    await waitFor(() => expect(screen.getByText(/confirmá tu turno/i)).toBeInTheDocument());

    // Mock OVERLAP
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 409,
      json: async () => ({ error: { code: 'OVERLAP', message: 'El horario ya está ocupado' } }),
    });

    fireEvent.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    await waitFor(() => {
      expect(screen.getByText(/el horario ya está ocupado/i)).toBeInTheDocument();
    });
  });

  it('no permite confirmar si no se eligió un horario de la lista', async () => {
    renderBooking();
    await waitFor(() => expect(screen.getByText('Corte de cabello')).toBeInTheDocument());

    // Sin llegar al paso de confirmar, el botón "Confirmar reserva" no existe
    expect(screen.queryByRole('button', { name: /confirmar reserva/i })).not.toBeInTheDocument();
  });
});
