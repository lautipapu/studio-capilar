import { useEffect, useState } from 'react';
import {
  servicesApi,
  professionalsApi,
  clientsApi,
  appointmentsApi,
  formatPrice,
  formatDateTime,
  WEEKDAY_NAMES,
  type Service,
  type Professional,
  type Client,
  type Appointment,
  type ScheduleEntry,
} from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';

type Tab = 'servicios' | 'profesionales' | 'clientes' | 'turnos';

// ── Servicios ─────────────────────────────────────────────

function ServicesTab() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({ name: '', durationMin: '', priceCents: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);

  useEffect(() => {
    servicesApi.list(true)
      .then(r => setServices(r.services))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const { service } = await servicesApi.create({
        name: form.name.trim(),
        durationMin: Number(form.durationMin),
        priceCents: Math.round(Number(form.priceCents) * 100),
      });
      setServices(prev => [...prev, service]);
      setForm({ name: '', durationMin: '', priceCents: '' });
    } catch (err) { setFormError(err); }
    finally { setSaving(false); }
  };

  const toggleActive = async (s: Service) => {
    try {
      const { service } = await servicesApi.update(s.id, { active: !s.active });
      setServices(prev => prev.map(x => x.id === s.id ? service : x));
    } catch (err) { setError(err); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {error && <ErrorMessage error={error} />}
      <div className="card form-stack mb-2" style={{ maxWidth: 480 }}>
        <h4>Nuevo servicio</h4>
        {formError && <ErrorMessage error={formError} />}
        <div className="form-group">
          <label className="form-label">Nombre</label>
          <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
          <div className="form-group">
            <label className="form-label">Duración (min)</label>
            <input className="form-input" type="number" min="1" value={form.durationMin} onChange={e => setForm(p => ({ ...p, durationMin: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Precio (ARS)</label>
            <input className="form-input" type="number" min="0" step="0.01" value={form.priceCents} onChange={e => setForm(p => ({ ...p, priceCents: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={!form.name || !form.durationMin || !form.priceCents || saving} onClick={create}>
          {saving ? 'Creando…' : 'Crear servicio'}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Duración</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {services.map(s => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.durationMin} min</td>
                <td>{formatPrice(s.priceCents)}</td>
                <td><span className={`badge ${s.active ? 'badge-active' : 'badge-inactive'}`}>{s.active ? 'Activo' : 'Inactivo'}</span></td>
                <td><button className="btn btn-outline btn-sm" onClick={() => toggleActive(s)}>{s.active ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Profesionales ─────────────────────────────────────────

function ProfessionalsTab() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [editSched, setEditSched] = useState<string | null>(null); // professional id
  const [schedDraft, setSchedDraft] = useState<ScheduleEntry[]>([]);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedError, setSchedError] = useState<unknown>(null);
  const [schedSaved, setSchedSaved] = useState(false);

  useEffect(() => {
    professionalsApi.list()
      .then(r => setProfessionals(r.professionals))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    setSaving(true); setFormError(null);
    try {
      const { professional } = await professionalsApi.create({
        name: form.name.trim(), email: form.email.trim(),
        password: form.password, phone: form.phone.trim() || undefined,
      });
      setProfessionals(prev => [...prev, professional]);
      setForm({ name: '', email: '', password: '', phone: '' });
    } catch (err) { setFormError(err); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p: Professional) => {
    try {
      const { professional } = await professionalsApi.update(p.id, { active: !p.active });
      setProfessionals(prev => prev.map(x => x.id === p.id ? professional : x));
    } catch (err) { setError(err); }
  };

  const openSched = (p: Professional) => {
    setEditSched(p.id);
    setSchedError(null); setSchedSaved(false);
    professionalsApi.get(p.id).then(r => {
      const s = r.professional.schedule ?? [];
      setSchedDraft(
        [0,1,2,3,4,5,6].map(wd => s.find(e => e.weekday === wd) ?? { weekday: wd, startTime: '', endTime: '' }),
      );
    });
  };

  const saveSched = async () => {
    if (!editSched) return;
    setSchedSaving(true); setSchedError(null); setSchedSaved(false);
    try {
      await professionalsApi.setSchedule(editSched, schedDraft.filter(e => e.startTime && e.endTime));
      setSchedSaved(true); setTimeout(() => setSchedSaved(false), 3000);
    } catch (err) { setSchedError(err); }
    finally { setSchedSaving(false); }
  };

  if (loading) return <LoadingSpinner />;

  const editingProf = editSched ? professionals.find(p => p.id === editSched) : null;

  return (
    <div>
      {error && <ErrorMessage error={error} />}

      {editSched && editingProf && (
        <div className="card form-stack mb-2" style={{ maxWidth: 480 }}>
          <div className="flex-between mb-1">
            <h4>Horario de {editingProf.name}</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditSched(null)}>✕ Cerrar</button>
          </div>
          {schedError && <ErrorMessage error={schedError} />}
          {schedSaved && <div className="alert alert-success">Horario guardado.</div>}
          {schedDraft.map(entry => (
            <div key={entry.weekday} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: '.5rem', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{WEEKDAY_NAMES[entry.weekday]}</span>
              <input className="form-input" type="time" value={entry.startTime}
                onChange={e => setSchedDraft(prev => prev.map(x => x.weekday === entry.weekday ? { ...x, startTime: e.target.value } : x))} />
              <input className="form-input" type="time" value={entry.endTime}
                onChange={e => setSchedDraft(prev => prev.map(x => x.weekday === entry.weekday ? { ...x, endTime: e.target.value } : x))} />
            </div>
          ))}
          <button className="btn btn-primary" disabled={schedSaving} onClick={saveSched}>
            {schedSaving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      <div className="card form-stack mb-2" style={{ maxWidth: 480 }}>
        <h4>Nuevo profesional</h4>
        {formError && <ErrorMessage error={formError} />}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input className="form-input" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={!form.name || !form.email || !form.password || saving} onClick={create}>
          {saving ? 'Creando…' : 'Crear profesional'}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {professionals.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.email}</td>
                <td><span className={`badge ${p.active ? 'badge-active' : 'badge-inactive'}`}>{p.active ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: '.5rem' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openSched(p)}>Horario</button>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleActive(p)}>{p.active ? 'Desactivar' : 'Activar'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Clientes ──────────────────────────────────────────────

function ClientsTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    clientsApi.list()
      .then(r => setClients(r.clients))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (c: Client) => {
    try {
      const { client } = await clientsApi.update(c.id, { active: !c.active });
      setClients(prev => prev.map(x => x.id === c.id ? client : x));
    } catch (err) { setError(err); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {error && <ErrorMessage error={error} />}
      {clients.length === 0 && <div className="empty-state"><p>No hay clientes registrados.</p></div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.phone ?? '—'}</td>
                <td><span className={`badge ${c.active ? 'badge-active' : 'badge-inactive'}`}>{c.active ? 'Activo' : 'Inactivo'}</span></td>
                <td><button className="btn btn-outline btn-sm" onClick={() => toggle(c)}>{c.active ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Turnos ────────────────────────────────────────────────

function AppointmentsTab() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    appointmentsApi.list()
      .then(r => setAppointments(r.appointments))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const cancel = async (id: string) => {
    try {
      const { appointment } = await appointmentsApi.cancel(id);
      setAppointments(prev => prev.map(a => a.id === id ? appointment : a));
    } catch (err) { setError(err); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {error && <ErrorMessage error={error} />}
      {appointments.length === 0 && <div className="empty-state"><p>No hay turnos.</p></div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Cliente</th><th>Profesional</th><th>Servicio</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {appointments
              .slice()
              .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
              .map(a => (
                <tr key={a.id}>
                  <td>{formatDateTime(a.startAt)}</td>
                  <td>{a.clientName ?? '—'}</td>
                  <td>{a.professionalName ?? '—'}</td>
                  <td>{a.serviceName ?? '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    {a.status === 'reservado' && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancel(a.id)}>Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('servicios');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'servicios', label: 'Servicios' },
    { key: 'profesionales', label: 'Profesionales' },
    { key: 'clientes', label: 'Clientes' },
    { key: 'turnos', label: 'Turnos' },
  ];

  return (
    <div className="page">
      <h1 style={{ marginBottom: '.5rem' }}>Panel de administración</h1>
      <p className="mb-2">Gestión completa del sistema.</p>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'servicios' && <ServicesTab />}
      {tab === 'profesionales' && <ProfessionalsTab />}
      {tab === 'clientes' && <ClientsTab />}
      {tab === 'turnos' && <AppointmentsTab />}
    </div>
  );
}
