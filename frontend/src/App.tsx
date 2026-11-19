import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { PrivateRoute } from './components/PrivateRoute';
import { HomePage } from './pages/HomePage';
import { RegisterPage } from './pages/RegisterPage';
import { LoginPage } from './pages/LoginPage';
import { BookingPage } from './pages/BookingPage';
import { MyAppointmentsPage } from './pages/MyAppointmentsPage';
import { AgendaPage } from './pages/AgendaPage';
import { AdminPage } from './pages/AdminPage';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        {/* Públicas */}
        <Route path="/" element={<HomePage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/ingreso" element={<LoginPage />} />

        {/* Cliente */}
        <Route
          path="/reservar"
          element={
            <PrivateRoute role="cliente">
              <BookingPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/mis-turnos"
          element={
            <PrivateRoute role="cliente">
              <MyAppointmentsPage />
            </PrivateRoute>
          }
        />

        {/* Profesional */}
        <Route
          path="/agenda"
          element={
            <PrivateRoute role="profesional">
              <AgendaPage />
            </PrivateRoute>
          }
        />

        {/* Administrador */}
        <Route
          path="/admin"
          element={
            <PrivateRoute role="administrador">
              <AdminPage />
            </PrivateRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
