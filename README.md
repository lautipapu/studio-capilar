# Studio Capilar

Aplicación web para consultar servicios de peluquería, reservar turnos y administrar la agenda de un local.

## Funcionalidades

- Registro e inicio de sesión para clientes.
- Consulta pública de servicios, profesionales y horarios disponibles.
- Reserva, consulta y cancelación de turnos.
- Agenda profesional para editar horarios, crear bloqueos y cerrar turnos.
- Administración de servicios, profesionales, clientes y turnos.

## Tecnologías

React, TypeScript, Vite y React Router en el frontend; Node.js, Express, TypeScript y PostgreSQL (`pg`) en el backend. Autenticación JWT, contraseñas con bcryptjs y validación de solicitudes con Zod.

## Requisitos

- Node.js 22 o superior y npm.
- PostgreSQL disponible y una base configurada para la aplicación.
- Docker Compose es opcional para iniciar el PostgreSQL local definido en `docker-compose.yml`.

## Inicio rápido

1. Prepará las variables del backend en `backend/.env` a partir de `.env.example`. Configurá `DATABASE_URL` y `JWT_SECRET` como mínimo.
2. Para PostgreSQL local, ejecutá `docker compose up -d` desde la raíz. El servicio crea `studio_capilar`; la base de pruebas `studio_capilar_test` no se crea automáticamente.
3. Instalá dependencias y aplicá el esquema:

   ```bash
   npm install
   npm run migrate
   ```

4. Opcionalmente, definí `ADMIN_PASSWORD` (y para datos de muestra `DEMO_PASSWORD`) en `backend/.env` y ejecutá `npm run seed`.
5. En terminales separadas, iniciá:

   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```

La interfaz local se sirve en `http://localhost:5173` y la API en `http://localhost:4000`.

## Guías

- [Manual de usuario](manual-usuario.md)
- [Manual técnico](manual-tecnico.md)

## Publicación

El proyecto **no está publicado**. No hay URLs públicas confirmadas para el frontend o el backend.
