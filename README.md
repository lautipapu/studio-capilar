# Studio Capilar

Sistema web de turnos para una peluquería. Un cliente reserva un servicio con un profesional disponible. El profesional arma su semana y bloquea horarios. Un administrador mantiene el catálogo, las personas y los turnos.

El comportamiento está en `spec.md`. Las decisiones cerradas, en `decisiones.md`. El diseño, en `plan.md`. El trabajo pendiente, en `tasks.md`.

## Estado

La aplicación de backend y frontend está implementada. El build de producción pasó y la suite de interfaz aprobó 21 pruebas. La suite backend aprobó 12 pruebas; 50 pruebas que requieren PostgreSQL se omitieron porque no había una base disponible en este entorno.

- La integración completa contra una API conectada a PostgreSQL todavía no se verificó en navegador.
- No hay versión desplegada.
- No hay URL pública.

Cuando alguien publique el sistema, esta sección debe reemplazarse por las URLs reales de Netlify y Render, recién después de abrirlas en un navegador.

## Requisitos locales

- Node.js 22 o superior
- Docker, para PostgreSQL 16

La contraseña `studio` del archivo `docker-compose.yml` sirve solo para esa base local.

## Cómo levantarlo

Con las variables de entorno cargadas y PostgreSQL disponible, estos comandos levantan el sistema local:

```bash
docker compose up -d
docker compose exec db psql -U studio -d studio_capilar -c "CREATE DATABASE studio_capilar_test"
cp .env.example .env
```

Completar `.env` con un `JWT_SECRET` y un `ADMIN_PASSWORD` propios. No commitear ese archivo.

```bash
npm install
npm run migrate
npm run seed
npm run dev:backend
npm run dev:frontend
```

- API local: `http://localhost:4000`
- Interfaz local: `http://localhost:5173`
- En local el frontend llama a `/api` y Vite redirige ese prefijo al puerto 4000.

`npm run seed` crea el administrador de `ADMIN_EMAIL`. Si además definís `DEMO_PASSWORD`, crea el profesional y los tres servicios descritos en `spec.md`.

## Pruebas

Cuando las tareas correspondientes estén hechas:

```bash
npm test
npm run test:frontend
```

`npm test` corre Vitest y Supertest en el backend, contra `DATABASE_URL_TEST`. El frontend usa Vitest y Testing Library. Una tarea no está terminada si su suite no pasó.

## Despliegue previsto

Todavía no se desplegó. El destino elegido es:

| Parte | Servicio | Notas |
| --- | --- | --- |
| Frontend | Netlify | Base directory `frontend`, build `npm run build`, publish `dist`. Variable `VITE_API_URL` con la URL pública de la API. |
| Backend | Render | Root directory `backend`, build `npm install && npm run build`, start `npm start`. |
| Base | Neon | PostgreSQL. Correr `npm run migrate` y `npm run seed` contra esa `DATABASE_URL` antes de usar la API. |

Variables del backend en Render: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (origen de Netlify), `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` y, si se quiere la muestra, `DEMO_PASSWORD`. Los secretos se cargan en el panel del proveedor, no en el repositorio.

Pasos detallados y criterio para anotar las URLs: tarea T19 y sección 10 de `plan.md`.

## Repositorio

El remoto previsto es GitHub. Este árbol todavía no fija una URL de remoto en la documentación para no inventarla.
