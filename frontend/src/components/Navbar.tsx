import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="container">
        <Link to="/" className="navbar-brand">
          Studio<span> Capilar</span>
        </Link>
        <ul className="navbar-links">
          {!user && (
            <>
              <li><NavLink to="/ingreso">Ingresar</NavLink></li>
              <li>
                <NavLink to="/registro">
                  <span className="btn btn-accent btn-sm">Registrarse</span>
                </NavLink>
              </li>
            </>
          )}
          {user?.role === 'cliente' && (
            <>
              <li><NavLink to="/reservar">Reservar turno</NavLink></li>
              <li><NavLink to="/mis-turnos">Mis turnos</NavLink></li>
            </>
          )}
          {user?.role === 'profesional' && (
            <li><NavLink to="/agenda">Mi agenda</NavLink></li>
          )}
          {user?.role === 'administrador' && (
            <li><NavLink to="/admin">Administración</NavLink></li>
          )}
          {user && (
            <>
              <li>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '.85rem' }}>
                  {user.name.split(' ')[0]}
                </span>
              </li>
              <li>
                <button className="btn btn-ghost btn-sm" style={{ color: 'rgba(255,255,255,.7)' }} onClick={handleLogout}>
                  Salir
                </button>
              </li>
            </>
          )}
        </ul>
      </div>
    </nav>
  );
}
