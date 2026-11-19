import { useEffect, useState } from 'react';
import { appointmentsApi, formatDateTime, formatPrice, ApiError, type Appointment } from '../api';
import { useAuth } from '../auth';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';

export function MyAppointmentsPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    appointmentsApi
      .list()
      .then(r => setAppointments(r.appointments))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const canCancel = (a: Appointment) => a.status === 'reservado';

  const doCancel = async () => {
    if (!cancelTarget) return;
    setCancelError(null);
    setCancelling(true);
    try {
      await appointmentsApi.cancel(cancelTarget.id);
      setAppointments(prev =>
        prev.map(a => a.id === cancelTarget.id ? { ...a, status: 'cancelado' } : a),
      );
      setCancelTarget(null);
    } catch (err) {
      setCancelError(err);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page">
      <h1 style={{ marginBottom: '.5rem' }}>Mis turnos</h1>
      <p className="mb-2">Hola, {user?.name?.split(' ')[0]}. Acá están todos tus turnos.</p>

      {error && <ErrorMessage error={error} />}

      {appointments.length === 0 && !error && (
        <div className="empty-state">
          <p>No tenés turnos registrados todavía.</p>
        </div>
      )}

      <div className="form-stack">
        {appointments
          .slice()
          .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
          .map(a => (
            <div className="card" key={a.id}>
              <div className="flex-between" style={{ marginBottom: '.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', marginBottom: '.15rem' }}>{a.serviceName ?? 'Servicio'}</h3>
                  <p className="text-muted text-sm">{a.professionalName ?? 'Profesional'}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              <div className="flex-between">
                <span className="text-muted text-sm">{formatDateTime(a.startAt)}</span>
                {a.priceCents != null && (
                  <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                    {formatPrice(a.priceCents)}
                  </span>
                )}
              </div>
              {canCancel(a) && (
                <div className="mt-2">
                  <button className="btn btn-outline btn-sm" onClick={() => { setCancelTarget(a); setCancelError(null); }}>
                    Cancelar turno
                  </button>
                </div>
              )}
              {a.status === 'cancelado' && a.cancelReason && (
                <p className="text-muted text-sm mt-1">Motivo: {a.cancelReason}</p>
              )}
            </div>
          ))}
      </div>

      {cancelTarget && (
        <ConfirmModal
          title="¿Cancelar turno?"
          message={`¿Querés cancelar tu turno del ${formatDateTime(cancelTarget.startAt)}?`}
          confirmLabel={cancelling ? 'Cancelando…' : 'Sí, cancelar'}
          onConfirm={doCancel}
          onCancel={() => { setCancelTarget(null); setCancelError(null); }}
          dangerous
        >
          {cancelError && <ErrorMessage error={cancelError} />}
        </ConfirmModal>
      )}
    </div>
  );
}
