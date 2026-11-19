import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  servicesApi,
  professionalsApi,
  appointmentsApi,
  formatPrice,
  formatTime,
  ApiError,
  type Service,
  type Professional,
} from '../api';
import { useAuth } from '../auth';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

type Step = 'service' | 'professional' | 'date' | 'slot' | 'confirm' | 'done';

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'service', label: 'Servicio' },
    { key: 'professional', label: 'Profesional' },
    { key: 'date', label: 'Fecha' },
    { key: 'slot', label: 'Horario' },
    { key: 'confirm', label: 'Confirmar' },
  ];
  const idx = steps.findIndex(s => s.key === current);
  return (
    <div className="steps">
      {steps.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'active' : '';
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
            <div className={`step ${state}`}>
              <span className="step-num">{i + 1}</span>
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="step-sep" />}
          </div>
        );
      })}
    </div>
  );
}

export function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [createdId, setCreatedId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Max date: 30 days from now
  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);
  const minDateStr = today.toISOString().split('T')[0];
  const maxDateStr = maxDate.toISOString().split('T')[0];

  useEffect(() => {
    if (!user || user.role !== 'cliente') { navigate('/ingreso'); return; }
    setLoading(true);
    servicesApi
      .list()
      .then(r => setServices(r.services.filter(s => s.active)))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [user, navigate]);

  const selectService = (s: Service) => {
    setSelectedService(s);
    setSelectedProfessional(null);
    setSelectedDate('');
    setSelectedSlot('');
    setError(null);
    setLoading(true);
    professionalsApi
      .list()
      .then(r => setProfessionals(r.professionals.filter(p => p.active)))
      .catch(setError)
      .finally(() => setLoading(false));
    setStep('professional');
  };

  const selectProfessional = (p: Professional) => {
    setSelectedProfessional(p);
    setSelectedDate('');
    setSelectedSlot('');
    setError(null);
    setStep('date');
  };

  const selectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot('');
    setError(null);
    setLoading(true);
    professionalsApi
      .availability(selectedProfessional!.id, selectedService!.id, date)
      .then(r => { setSlots(r.slots); setStep('slot'); })
      .catch(setError)
      .finally(() => setLoading(false));
  };

  const selectSlot = (slot: string) => {
    setSelectedSlot(slot);
    setError(null);
    setStep('confirm');
  };

  const confirm = async () => {
    setError(null);
    setLoading(true);
    try {
      const { appointment } = await appointmentsApi.create({
        professionalId: selectedProfessional!.id,
        serviceId: selectedService!.id,
        startAt: selectedSlot,
      });
      setCreatedId(appointment.id);
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OVERLAP') {
        setError(err);
        setSelectedSlot('');
        setStep('slot'); // back to slot selection
      } else {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="page" style={{ maxWidth: 500 }}>
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h2>¡Turno confirmado!</h2>
          <p className="mt-2">Tu turno fue reservado exitosamente. Podés verlo en Mis turnos.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
            <button className="btn btn-primary" onClick={() => navigate('/mis-turnos')}>
              Ver mis turnos
            </button>
            <button className="btn btn-outline" onClick={() => {
              setStep('service');
              setSelectedService(null);
              setSelectedProfessional(null);
              setSelectedDate('');
              setSelectedSlot('');
              setCreatedId('');
              setError(null);
            }}>
              Reservar otro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 style={{ marginBottom: '.5rem' }}>Reservar turno</h1>
      <p className="mb-2">Seguí los pasos para elegir tu servicio y horario.</p>

      <StepIndicator current={step} />

      {loading && <LoadingSpinner />}
      {error && !loading && (
        <div style={{ marginBottom: '1rem' }}>
          <ErrorMessage error={error} />
          {step === 'slot' && (
            <p className="text-muted mt-1">Elegí otro horario disponible.</p>
          )}
        </div>
      )}

      {/* Step: Service */}
      {step === 'service' && !loading && (
        <div>
          <h3 className="mb-2">Elegí el servicio</h3>
          <div className="card-grid">
            {services.map(s => (
              <div
                key={s.id}
                className="card"
                style={{ cursor: 'pointer', transition: 'box-shadow .2s' }}
                onClick={() => selectService(s)}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
              >
                <div className="flex-between">
                  <h3 className="card-title">{s.name}</h3>
                  <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{formatPrice(s.priceCents)}</span>
                </div>
                <p className="card-subtitle mt-1">{s.durationMin} minutos</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step: Professional */}
      {step === 'professional' && !loading && (
        <div>
          <div className="flex-between mb-2">
            <h3>Elegí el profesional</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep('service')}>← Volver</button>
          </div>
          <div className="card-grid">
            {professionals.map(p => (
              <div
                key={p.id}
                className="card"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}
                onClick={() => selectProfessional(p)}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'var(--color-surface-alt)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '1.2rem', color: 'var(--color-accent)', flexShrink: 0,
                }}>
                  {p.name.charAt(0)}
                </div>
                <div>
                  <div className="card-title" style={{ fontSize: '1rem' }}>{p.name}</div>
                  <div className="card-subtitle">Estilista</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step: Date */}
      {step === 'date' && !loading && (
        <div style={{ maxWidth: 420 }}>
          <div className="flex-between mb-2">
            <h3>Elegí la fecha</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep('professional')}>← Volver</button>
          </div>
          <div className="form-group">
            <label className="form-label">Fecha del turno</label>
            <input
              className="form-input"
              type="date"
              min={minDateStr}
              max={maxDateStr}
              value={selectedDate}
              onChange={e => e.target.value && selectDate(e.target.value)}
            />
            <span className="form-hint">Podés reservar con hasta 30 días de anticipación.</span>
          </div>
        </div>
      )}

      {/* Step: Slot */}
      {step === 'slot' && !loading && (
        <div>
          <div className="flex-between mb-2">
            <h3>Elegí el horario</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep('date')}>← Volver</button>
          </div>
          {slots.length === 0 ? (
            <div className="empty-state">
              <p>No hay horarios disponibles para ese día. Probá con otra fecha.</p>
              <button className="btn btn-outline mt-2" onClick={() => setStep('date')}>Elegir otra fecha</button>
            </div>
          ) : (
            <div className="slots-grid">
              {slots.map(slot => (
                <button
                  key={slot}
                  className={`slot-btn ${selectedSlot === slot ? 'selected' : ''}`}
                  onClick={() => selectSlot(slot)}
                >
                  {formatTime(slot)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && !loading && (
        <div style={{ maxWidth: 480 }}>
          <div className="flex-between mb-2">
            <h3>Confirmá tu turno</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep('slot')}>← Volver</button>
          </div>
          <div className="card form-stack">
            <div className="flex-between">
              <span className="text-muted">Servicio</span>
              <span className="font-bold">{selectedService?.name}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">Profesional</span>
              <span className="font-bold">{selectedProfessional?.name}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">Horario</span>
              <span className="font-bold">{selectedDate} — {formatTime(selectedSlot)}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">Precio</span>
              <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
                {formatPrice(selectedService?.priceCents ?? 0)}
              </span>
            </div>
            <div className="divider" />
            <button className="btn btn-accent btn-full btn-lg" onClick={confirm} disabled={loading}>
              Confirmar reserva
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
