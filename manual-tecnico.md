# Manual técnico

## Descripción y arquitectura

Studio Capilar es un monorepo npm con dos workspaces: `backend` y `frontend`. El navegador usa una SPA React que consume una API REST Express. La API contiene validación, reglas de negocio y acceso SQL a PostgreSQL; no hay ORM. `createApp()` exporta la aplicación sin abrir un puerto, mientras `src/index.ts` carga la configuración e inicia el servidor.

El backend organiza cada módulo en router, servicio y repositorio. Los routers validan las solicitudes y aplican autenticación/autorización; los servicios aplican reglas; los repositorios consultan PostgreSQL. Los módulos son `auth`, `services`, `professionals`, `appointments` y `clients`. Los cambios de agenda usan transacciones y la base tiene una restricción GiST para impedir turnos reservados solapados.

## Tecnologías

- Node.js 22 o superior, npm workspaces y TypeScript.
- Backend: Express, `pg`, Zod, `jsonwebtoken`, `bcryptjs`, Helmet, CORS, Luxon, dotenv y tsx.
- Frontend: React, React DOM, React Router, Vite y TypeScript.
- Persistencia: PostgreSQL; desarrollo local opcional mediante Docker Compose con PostgreSQL 16.
- Pruebas disponibles: Vitest, Supertest en backend; Vitest, Testing Library y jsdom en frontend.

## Estructura relevante

```text
backend/
  migrations/                 SQL versionado
  src/app.ts                   composición de Express
  src/index.ts                 carga configuración e inicia HTTP
  src/config.ts                configuración del backend
  src/db/                      pool, migraciones y semilla
  src/middleware/              autenticación y errores
  src/modules/<módulo>/        router, servicio y repositorio
  tests/                       pruebas y helpers PostgreSQL
frontend/
  src/App.tsx                  rutas de la interfaz
  src/api.ts                   cliente HTTP y tipos
  src/auth.tsx                 contexto de sesión
  src/pages/                   pantallas por flujo
  tests/                       pruebas de interfaz
```

## Requisitos previos e instalación

Instalá Node.js 22 o superior y npm. Para ejecutar la aplicación necesitás PostgreSQL accesible. Docker es opcional si se usa una base PostgreSQL externa.

Desde la raíz del repositorio:

```bash
npm install
```

El `docker-compose.yml` local crea la base `studio_capilar`. No crea automáticamente la base `studio_capilar_test`; las pruebas de integración requieren una DB de pruebas separada.

## Variables de entorno

Los scripts de workspace del backend se ejecutan desde `backend`. Configurá el entorno del servidor en `backend/.env`; `seed.ts` resuelve esa ruta relativa al módulo. Para Vite, las variables `VITE_*` deben estar disponibles al ejecutar/build de frontend (por ejemplo, en `frontend/.env`). `.env.example` en la raíz sirve como referencia de nombres y valores de ejemplo, no como archivo de credenciales de producción.

| Variable | Requerida | Uso |
|---|---|---|
| `DATABASE_URL` | Sí para el backend y migraciones | Conexión PostgreSQL principal de la aplicación. |
| `JWT_SECRET` | Sí para iniciar el backend | Firma de tokens; definí un secreto propio y robusto. |
| `DATABASE_URL_TEST` | No para iniciar el servidor; sí para `seed:test` y pruebas DB | Conexión de base de pruebas separada. Nunca la apuntes a producción si se ejecutan suites que limpian tablas. |
| `PORT` | No | Puerto HTTP; predeterminado `4000`. |
| `CORS_ORIGIN` | No | Origen frontend permitido; predeterminado `http://localhost:5173`. |
| `ADMIN_EMAIL` | No | Email del administrador que crea la semilla; hay un valor predeterminado en el código. |
| `ADMIN_NAME` | No | Nombre del administrador; tiene valor predeterminado. |
| `ADMIN_PASSWORD` | No para iniciar la API; necesario para crear el administrador con seed | Contraseña provista por quien opera el entorno. Si no está definida, la semilla no crea un administrador nuevo. |
| `DEMO_PASSWORD` | No | Si se define, la semilla intenta crear la profesional de demostración y los servicios de muestra. |
| `VITE_API_URL` | No en desarrollo local | Base URL de API para frontend compilado; en local Vite usa el proxy `/api`. |

No guardes valores reales de credenciales en Git ni los incluyas en documentación o logs.

## Base de datos y migraciones

El esquema está en `backend/migrations/001_init.sql`. Incluye `users`, `services`, `professionals`, `professional_schedules`, `time_blocks` y `appointments`, junto con enums, índices, claves foráneas y la restricción de exclusión para turnos reservados.

Con `DATABASE_URL` configurada, ejecutá desde la raíz:

```bash
npm run migrate
```

El migrador crea `schema_migrations` y aplica los archivos SQL pendientes en orden. La base de pruebas debe ser distinta de la principal: los helpers de integración aplican migraciones y ejecutan `TRUNCATE` antes de los casos.

## Semilla

La semilla normal usa `DATABASE_URL` mediante el pool predeterminado:

```bash
npm run seed
```

Si `ADMIN_PASSWORD` está configurada, crea el administrador cuando no existe; si el email ya existe, no cambia su contraseña. Con `DEMO_PASSWORD`, crea a Ana Pérez con horario de lunes a sábado y los tres servicios de muestra, sin duplicar registros existentes.

Existe también un modo explícito para la DB de pruebas:

```bash
npm.cmd run seed:test -w backend
```

Este modo requiere `DATABASE_URL_TEST`, aborta si no está definida o si identifica el mismo destino que `DATABASE_URL`, y no usa `DATABASE_URL` como alternativa. No ejecutes pruebas ni semilla contra una base principal.

## Ejecución y compilación

Desde la raíz, en terminales separadas:

```bash
npm run dev:backend
npm run dev:frontend
```

El backend usa puerto 4000 por defecto. Vite sirve el frontend en 5173 y redirige `/api` a `http://localhost:4000`.

Para compilar ambos workspaces:

```bash
npm run build
```

Scripts disponibles en los `package.json`:

| Comando | Efecto |
|---|---|
| `npm run build` | Build backend y luego frontend. |
| `npm run build -w backend` | TypeScript del backend a `backend/dist`. |
| `npm run build -w frontend` | TypeScript y bundle Vite a `frontend/dist`. |
| `npm run start -w backend` | Inicia `node dist/index.js`; requiere build previo y configuración de backend. |
| `npm test` | Ejecuta Vitest del backend (`vitest run`). |
| `npm run test:frontend` | Ejecuta Vitest del frontend. |

Las pruebas backend requieren una DB de pruebas configurada; no las ejecutes si `DATABASE_URL_TEST` no está aislada, dado que las utilidades de test migran y truncan datos.

## API, autenticación y autorización

Todos los endpoints usan el prefijo `/api`:

| Método y ruta | Acceso y función |
|---|---|
| `GET /api/health` | Público; estado de la API. |
| `POST /api/auth/register`, `POST /api/auth/login` | Públicos; registro de cliente e inicio de sesión. |
| `GET /api/auth/me` | Autenticado; devuelve la sesión activa. |
| `GET /api/services` | Público; catálogo activo. |
| `POST /api/services`, `PATCH /api/services/:id` | Administrador; crear y actualizar/desactivar servicios. |
| `GET /api/professionals`, `GET /api/professionals/:id` | Consulta pública; profesionales activos. La lista admite `includeInactive=true` solo para administración. |
| `GET /api/professionals/:id/availability?serviceId=…&date=…` | Público; horarios disponibles. |
| `POST /api/professionals`, `PATCH /api/professionals/:id` | Administrador; crear y administrar profesionales. |
| `PUT /api/professionals/:id/schedule` | Profesional titular o administrador; reemplazar horario semanal. |
| `GET/POST /api/professionals/:id/blocks`, `DELETE /api/professionals/:id/blocks/:blockId` | Profesional titular o administrador; consultar, crear y borrar bloqueos. |
| `POST /api/appointments` | Cliente o administrador, con las reglas aplicadas por el servicio. |
| `GET /api/appointments`, `GET /api/appointments/:id` | Autenticado; alcance de datos filtrado según rol. |
| `POST /api/appointments/:id/cancel` | Cliente titular o administrador; cancelación según reglas. |
| `POST /api/appointments/:id/complete`, `POST /api/appointments/:id/no-show` | Profesional titular o administrador; cierre de turnos iniciados. |
| `GET /api/clients`, `PATCH /api/clients/:id` | Administrador; consulta y actualización/desactivación de clientes. |

El login devuelve un JWT de 8 horas que el frontend guarda en `localStorage` bajo `studio_capilar_token` y envía como Bearer token. En cada solicitud protegida el backend verifica el token y carga al usuario actual desde PostgreSQL; los roles se vuelven a comprobar en los endpoints. Las contraseñas se almacenan hasheadas con bcryptjs. La API usa Helmet, CORS configurable y límite de JSON de 16 KB; los errores se responden como JSON.

## Consideraciones de mantenimiento

- Las reglas de negocio pertenecen al backend y a las restricciones pertinentes de PostgreSQL; la interfaz no sustituye validaciones del servidor.
- Los intervalos de agenda son semiabiertos y la zona operativa configurada por reglas es `America/Argentina/Buenos_Aires`.
- `createApp({ pool })` permite inyectar el pool; los routers y autenticación usan el pool recibido. Sin inyección, el servidor utiliza el pool predeterminado.
- Los estados de turno son `reservado`, `cancelado`, `completado` y `ausente`; solo `reservado` ocupa la agenda.
- Los secretos y URLs de conexión son configuración externa y no deben imprimirse en reportes.
