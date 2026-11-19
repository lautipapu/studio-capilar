import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import {
  appointmentsApi,
  professionalsApi,
  formatDateTime,
  WEEKDAY_NAMES,
  ApiError,
  type Appointment,
  type ScheduleEntry,
  type Block,
} from '../api';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';

type Tab = 'turnos' | 'horario' | 'bloqueos';

function getFromTo() {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 60);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export function AgendaPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('turnos');

  // Turnos
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [apptError, setApptError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  // Horario
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedError, setSchedError] = useState<unknown>(null);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedDraft, setSchedDraft] = useState<ScheduleEntry[]>([]);
  const [schedSaved, setSchedSaved] = useState(false);

  // Bloqueos
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blockLoading, setBlockLoading] = useState(false);
  const [blockError, setBlockError] = useState<unknown>(null);
  const [blockForm, setBlockForm] = useState({ startAt: '', endAt: '', reason: '' });
  const [blockSaving, setBlockSaving] = useState(false);

  const profId = user?.id ?? '';

  useEffect(() => {
    if (!profId) return;
    appointmentsApi
      .list()
      .then(r => setAppointments(r.appointments))
      .catch(setApptError)
      .finally(() => setApptLoading(false));
  }, [profId]);

  const loadSchedule = () => {
    if (!profId) return;
    setSchedLoading(true);
    professionalsApi
      .get(profId)
      .then(r => {
        const s = r.professional.schedule ?? [];
        setSchedule(s);
        setSchedDraft(
          [0, 1, 2, 3, 4, 5, 6].map(wd => {
            const existing = s.find(e => e.weekday === wd);
            return existing ?? { weekday: wd, startTime: '', endTime: '' };
          }),
        );
      })
      .catch(setSchedError)
      .finally(() => setSchedLoading(false));
  };

  const loadBlocks = () => {
    if (!profId) return;
    setBlockLoading(true);
    const { from, to } = getFromTo();
    professionalsApi
      .listBlocks(profId, from, to)
      .then(r => setBlocks(r.blocks))
      .catch(setBlockError)
      .finally(() => setBlockLoading(false));
  };

  useEffect(() => {
    if (tab === 'horario') loadSchedule();
    if (tab === 'bloqueos') loadBlocks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, profId]);

  const handleAction = async (id: string, action: 'complete' | 'no-show') => {
    setActionError(null);
    try {
      const { appointment } = action === 'complete'
        ? await appointmentsApi.complete(id)
        : await appointmentsApi.noShow(id);
      setAppointments(prev => prev.map(a => a.id === id ? appointment : a));
    } catch (err) {
      setActionError(err);
    }
  };

  const saveSchedule = async () => {
    setSchedSaving(true);
    setSchedError(null);
    setSchedSaved(false);
    try {
      const payload = schedDraft.filter(e => e.startTime && e.endTime);
      await professionalsApi.setSchedule(profId, payload);
      setSchedule(payload);
      setSchedSaved(true);
      setTimeout(() => setSchedSaved(false), 3000);
    } catch (err) {
      setSchedError(err);
    } finally {
      setSchedSaving(false);
    }
  };

  const updateDraftEntry = (wd: number, field: 'startTime' | 'endTime', value: string) => {
    setSchedDraft(prev => prev.map(e => e.weekday === wd ? { ...e, [field]: value } : e));
  };

  const addBlock = async () => {
    setBlockSaving(true);
    setBlockError(null);
    try {
      const { block } = await professionalsApi.createBlock(profId, {
        startAt: new Date(blockForm.startAt).toISOString(),
        endAt: new Date(blockForm.endAt).toISOString(),
        reason: blockForm.reason || undefined,
      });
      setBlocks(prev => [...prev, block]);
      setBlockForm({ startAt: '', endAt: '', reason: '' });
    } catch (err) {
      setBlockError(err);
    } finally {
      setBlockSaving(false);
    }
  };

  const deleteBlock = async (blockId: string) => {
    setBlockError(null);
    try {
      await professionalsApi.deleteBlock(profId, blockId);
      setBlocks(prev => prev.filter(b => b.id !== blockId));
    } catch (err) {
      setBlockError(err);
    }
  };

  const isPast = (iso: string) => new Date(iso) < new Date();

  return (
    <div className="page">
      <h1 style={{ marginBottom: '.5rem' }}>Mi agenda</h1>
      <p className="mb-2">Gestioná tus turnos, horario semanal y bloqueos.</p>

      <div className="tabs">
        {(['turnos', 'horario', 'bloqueos'] as Tab[]).map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* TAB: Turnos */}
      {tab === 'turnos' && (
        <div>
          {apptLoading && <LoadingSpinner />}
          {apptError && <ErrorMessage error={apptError} />}
          {actionError && <ErrorMessage error={actionError} />}
          {!apptLoading && appointments.length === 0 && (
            <div className="empty-state"><p>No tenés turnos asignados.</p></div>
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
                      <p className="text-muted text-sm">{a.clientName ?? 'Cliente'}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="text-muted text-sm">{formatDateTime(a.startAt)}</p>
                  {a.status === 'reservado' && isPast(a.startAt) && (
                    <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => handleAction(a.id, 'complete')}>
                        Completar
                      </button>
                      <button className="btn btn-sm btn-outline" onClick={() => handleAction(a.id, 'no-show')}>
                        Ausente
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB: Horario */}
      {tab === 'horario' && (
        <div>
          {schedLoading && <LoadingSpinner />}
          {schedError && <ErrorMessage error={schedError} />}
          {schedSaved && <div className="alert alert-success mb-2">Horario guardado correctamente.</div>}
          {!schedLoading && (
            <>
              <div className="card form-stack">
                {schedDraft.map(entry => (
                  <div key={entry.weekday} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: '.75rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '.93rem' }}>{WEEKDAY_NAMES[entry.weekday]}</span>
                    <input
                      className="form-input"
                      type="time"
                      value={entry.startTime}
                      onChange={e => updateDraftEntry(entry.weekday, 'startTime', e.target.value)}
                      placeholder="Inicio"
                    />
                    <input
                      className="form-input"
                      type="time"
                      value={entry.endTime}
                      onChange={e => updateDraftEntry(entry.weekday, 'endTime', e.target.value)}
                      placeholder="Fin"
                    />
                  </div>
                ))}
              </div>
              <button className="btn btn-primary mt-3" onClick={saveSchedule} disabled={schedSaving}>
                {schedSaving ? 'Guardando…' : 'Guardar horario'}
              </button>
            </>
          )}
        </div>
      )}

      {/* TAB: Bloqueos */}
      {tab === 'bloqueos' && (
        <div>
          {blockError && <ErrorMessage error={blockError} />}

          <div className="card form-stack mb-2" style={{ maxWidth: 480 }}>
            <h4>Nuevo bloqueo</h4>
            <div className="form-group">
              <label className="form-label">Desde</label>
              <input
                className="form-input"
                type="datetime-local"
                value={blockForm.startAt}
                onChange={e => setBlockForm(p => ({ ...p, startAt: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Hasta</label>
              <input
                className="form-input"
                type="datetime-local"
                value={blockForm.endAt}
                onChange={e => setBlockForm(p => ({ ...p, endAt: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Motivo (opcional)</label>
              <input
                className="form-input"
                type="text"
                value={blockForm.reason}
                onChange={e => setBlockForm(p => ({ ...p, reason: e.target.value }))}
                placeholder="Ej.: Vacaciones"
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={!blockForm.startAt || !blockForm.endAt || blockSaving}
              onClick={addBlock}
            >
              {blockSaving ? 'Guardando…' : 'Crear bloqueo'}
            </button>
          </div>

          {blockLoading && <LoadingSpinner />}
          {!blockLoading && blocks.length === 0 && (
            <div className="empty-state"><p>No hay bloqueos registrados.</p></div>
          )}
          <div className="form-stack">
            {blocks
              .slice()
              .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
              .map(b => (
                <div className="card flex-between" key={b.id}>
                  <div>
                    <p className="font-bold" style={{ fontSize: '.95rem' }}>
                      {formatDateTime(b.startAt)} — {formatDateTime(b.endAt)}
                    </p>
                    {b.reason && <p className="text-muted text-sm">{b.reason}</p>}
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteBlock(b.id)}>
                    Eliminar
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
