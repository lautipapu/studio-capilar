import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { servicesApi, professionalsApi, formatPrice, type Service, type Professional } from '../api';
import { useAuth } from '../auth';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([servicesApi.list(), professionalsApi.list()])
      .then(([sRes, pRes]) => {
        setServices(sRes.services.filter(s => s.active));
        setProfessionals(pRes.professionals.filter(p => p.active));
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  const handleReservar = () => {
    if (!user) navigate('/ingreso');
    else if (user.role === 'cliente') navigate('/reservar');
    else navigate('/');
  };

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <h1>Tu <span>estilo</span>, tu turno.</h1>
        <p>
          Reservá online en segundos. Studio Capilar — peluquería profesional en Buenos Aires.
        </p>
        <div className="hero-actions">
          <button className="btn btn-accent btn-lg" onClick={handleReservar}>
            Reservar turno
          </button>
          {!user && (
            <Link to="/registro" className="btn btn-outline btn-lg" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>
              Crear cuenta
            </Link>
          )}
        </div>
      </section>

      <div className="container">
        {/* Services */}
        <section className="section">
          <div className="section-title">Nuestros servicios</div>
          <p className="section-subtitle">Elegí el servicio que más te gusta.</p>

          {loading && <LoadingSpinner />}
          {error && <ErrorMessage error={error} />}

          {!loading && !error && services.length === 0 && (
            <div className="empty-state"><p>No hay servicios disponibles por el momento.</p></div>
          )}

          <div className="card-grid">
            {services.map(s => (
              <div className="card" key={s.id} style={{ cursor: 'pointer' }} onClick={handleReservar}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                  <h3 className="card-title">{s.name}</h3>
                  <span style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '1.1rem' }}>
                    {formatPrice(s.priceCents)}
                  </span>
                </div>
                <p className="card-subtitle">{s.durationMin} minutos</p>
              </div>
            ))}
          </div>
        </section>

        {/* Professionals */}
        {professionals.length > 0 && (
          <section className="section" style={{ paddingTop: 0 }}>
            <div className="section-title">Nuestro equipo</div>
            <p className="section-subtitle">Profesionales dedicados a realzar tu estilo.</p>
            <div className="card-grid">
              {professionals.map(p => (
                <div className="card" key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: 'var(--color-surface-alt)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-accent)',
                      flexShrink: 0,
                    }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="card-title" style={{ fontSize: '1rem' }}>{p.name}</div>
                    <div className="card-subtitle">Estilista</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
