# Tareas

Ordenadas por dependencia. Una tarea empieza cuando las que lista están hechas. Ninguna está hecha hoy: no hay código de aplicación ni pruebas ejecutadas.

Una tarea se cierra solo si se cumple todo su criterio y las pruebas nombradas corrieron en verde en esa sesión. Si una prueba falla, la tarea sigue abierta.

## T01. Dejar el monorepo ejecutable

Depende de: nada.

Crear la base de prueba, instalar dependencias y dejar `GET /api/health` respondiendo `{ "ok": true }` desde `app` exportada. El proceso corta el arranque si falta `JWT_SECRET` o `DATABASE_URL`. Ajustar versiones de `package.json` solo si el registro no resuelve las declaradas.

Hecho cuando:

- `docker compose up -d` levanta PostgreSQL y existe `studio_capilar_test`.
- `GET /api/health` responde 200 con Supertest, sin base.
- `npm test -w backend` termina en verde con ese caso.

Prueba: humo de salud, en `backend/tests/health.test.ts`.

## T02. Esquema y migraciones

Depende de: T01.

Implementar `migrate.ts` y `backend/migrations/001_init.sql` con el SQL de `plan.md`, incluida `appointments_no_overlap`.

Hecho cuando:

- Correr migraciones dos veces no duplica objetos ni falla.
- Una prueba inserta dos turnos `reservado` solapados del mismo profesional por SQL y el segundo falla con `23P01`.
- Dos turnos que solo se tocan en el extremo se insertan.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/schema.test.ts`.

## T03. Registro e ingreso

Depende de: T02.

Módulo `auth`, hash, JWT, `GET /api/auth/me` y reloj inyectado disponible para el resto.

Hecho cuando:

- CP-01, CP-02, CP-03, CP-04, CP-05 y CP-06 pasan.
- Un usuario desactivado con un token viejo recibe 401 en `/api/auth/me`.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/auth.test.ts`.

## T04. Catálogo de servicios

Depende de: T03.

CRUD lógico de servicios según la spec.

Hecho cuando:

- CP-07, CP-08, CP-09 y CP-10 pasan.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/services.test.ts`.

## T05. Profesionales y horario semanal

Depende de: T03.

Alta, baja lógica, horario inicial y reemplazo de la semana. Incluir el cálculo de disponibilidad recién en T07; aquí el horario se persiste y se lee.

Hecho cuando:

- CP-11 y CP-12 pasan.
- CP-13 pasa en la parte de persistencia: el `GET` del profesional devuelve solo el martes 10:00–14:00. El resto de CP-13 queda en T07.
- Un profesional no reemplaza el horario de otro y recibe 403.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/professionals.test.ts`.

## T06. Bloqueos

Depende de: T05.

Alta, listado y borrado de bloqueos futuros, con `FOR UPDATE`.

Hecho cuando:

- CP-16 y CP-17 pasan.
- Crear un bloqueo con fin pasado o con fin menor o igual al inicio responde 422 `INVALID_BLOCK`.
- Borrar un bloqueo ya terminado responde 422.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/blocks.test.ts`. CP-15 queda en T07 porque exige la disponibilidad.

## T07. Disponibilidad

Depende de: T04, T05 y T06.

`GET /api/professionals/:id/availability` con el algoritmo de `plan.md`.

Hecho cuando:

- CP-13, CP-15 y CP-18 pasan completos.
- Una fecha fuera del horizonte devuelve lista vacía y 200.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/availability.test.ts`.

## T08. Reservar turno

Depende de: T07.

`POST /api/appointments` con la transacción descrita en el plan.

Hecho cuando:

- CP-14, CP-19, CP-20, CP-21, CP-22, CP-23, CP-24, CP-25, CP-26, CP-27 y CP-28 pasan.
- CP-27 sigue en verde si se repite: exactamente un turno queda guardado.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/booking.test.ts`.

## T09. Consultar turnos

Depende de: T08.

Listado y detalle con el alcance de cada rol.

Hecho cuando:

- CP-29 pasa, incluyendo un profesional que no debe ver turnos de otro.
- Sin token, el listado responde 401.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/appointments-query.test.ts`.

## T10. Cancelar

Depende de: T09.

`POST /api/appointments/:id/cancel`.

Hecho cuando:

- CP-30, CP-31, CP-32, CP-33 y CP-34 pasan.
- Después de CP-30, un `POST` nuevo en ese mismo inicio responde 201.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/cancel.test.ts`.

## T11. Completar y ausente

Depende de: T09.

`complete` y `no-show`.

Hecho cuando:

- CP-35, CP-36, CP-37, CP-38 y CP-39 pasan.
- Un turno `completado` ya no bloquea un alta nueva en ese horario.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/close.test.ts`.

## T12. Administración de clientes

Depende de: T03.

Listado y `PATCH` de clientes.

Hecho cuando:

- CP-40 y CP-41 pasan.
- `PATCH` sobre un id que no es cliente responde 404.
- `npm test -w backend` queda en verde.

Pruebas: `backend/tests/clients.test.ts`.

## T13. Semilla idempotente

Depende de: T05 y T04.

`npm run seed` crea el administrador y, solo con `DEMO_PASSWORD`, los datos de la spec.

Hecho cuando:

- Ejecutar la semilla dos veces deja un solo administrador, un solo profesional de muestra y tres servicios.
- La contraseña de demostración no aparece en el código.
- Una prueba de semilla contra la base de prueba pasa y `npm test -w backend` queda en verde.

Pruebas: `backend/tests/seed.test.ts`.

## T14. Interfaz de cuentas

Depende de: T03.

Vite, router, cliente HTTP, contexto de sesión, `/registro` e `/ingreso`.

Hecho cuando:

- Una prueba de interfaz registra con el cliente HTTP mockeado y guarda el token bajo `studio_capilar_token`.
- Una clave rechazada muestra «Credenciales inválidas».
- `npm run test:frontend` queda en verde.
- En el navegador, contra la API real, se puede registrar e ingresar.

Pruebas: `frontend/tests/auth.test.tsx`.

## T15. Catálogo y reserva

Depende de: T14 y T08.

`/` y `/reservar`.

Hecho cuando:

- La prueba pinta los inicios que devuelve la API y, ante un 409 `OVERLAP`, muestra el mensaje del servidor.
- No se puede enviar un inicio que no esté en la lista pintada.
- `npm run test:frontend` queda en verde.
- En el navegador, un cliente reserva un turno de prueba y ve el rechazo si lo intenta duplicar.

Pruebas: `frontend/tests/booking.test.tsx`.

## T16. Mis turnos

Depende de: T15 y T10.

`/mis-turnos`.

Hecho cuando:

- La prueba muestra el mensaje de `LATE_CANCEL` y quita de la lista un turno cancelado con éxito.
- `npm run test:frontend` queda en verde.
- En el navegador se cancela un turno con más de 24 horas y se ve el error con uno de menos de 24 horas.

Pruebas: `frontend/tests/my-appointments.test.tsx`.

## T17. Agenda del profesional

Depende de: T14, T06 y T11.

`/agenda`: turnos, horario semanal y bloqueos. Botones de completar y ausente solo si el inicio ya pasó según la hora del cliente; si el servidor rechaza, se muestra el mensaje.

Hecho cuando:

- Una prueba guarda el horario y muestra el error si el alta de bloqueo responde `OVERLAP`.
- Un cliente que abre `/agenda` no ve el formulario.
- `npm run test:frontend` queda en verde.
- En el navegador, el profesional de prueba bloquea un rango y lo ve en su agenda.

Pruebas: `frontend/tests/agenda.test.tsx`.

## T18. Panel de administración

Depende de: T14, T12, T11, T05 y T04.

`/admin` con servicios, profesionales, clientes y turnos. Cancelar desde aquí usa el endpoint de administrador.

Hecho cuando:

- Una prueba de cada sección dispara el método HTTP correcto y muestra un error 403 si la sesión es de cliente.
- `npm run test:frontend` queda en verde.
- En el navegador, el administrador crea un servicio, lo ve en el catálogo público y desactiva un cliente.

Pruebas: `frontend/tests/admin.test.tsx`.

## T19. Instrucciones de publicación

Depende de: T13 y T18.

Revisar el README para que los comandos locales coincidan con los scripts reales. Dejar los pasos de Netlify, Render y Neon. No crear cuentas ni escribir URLs de producción salvo que el despliegue se haya hecho y comprobado en esa sesión.

Hecho cuando:

- El README permite a otra persona levantar local, migrar, sembrar y correr ambas suites.
- Si no hay URL pública comprobada, el README dice que la versión publicada todavía no existe.
- `npm test` y `npm run test:frontend` quedan en verde.

No agrega casos de negocio. La verificación es ejecutar las suites ya escritas.
