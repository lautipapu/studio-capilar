# Informe de pruebas — Studio Capilar

## 1. Objetivo

Documentar el alcance de pruebas automatizadas definido para Studio Capilar y los resultados cuya evidencia está disponible. Este informe distingue ejecuciones históricas de verificaciones pendientes; no declara una funcionalidad aprobada solo por estar implementada.

## 2. Alcance de las verificaciones

La especificación contempla 41 casos backend CP-01 a CP-41 para registro, autenticación, servicios, profesionales, horarios, bloqueos, disponibilidad, reservas, consulta, cancelaciones, cierre y administración de clientes. El frontend tiene pruebas de interfaz complementarias para autenticación, reserva, mis turnos, agenda y panel de administración.

Las suites de backend de integración usan Express/Supertest y PostgreSQL configurada como base de pruebas. Los helpers ejecutan migraciones y limpian tablas. Las pruebas frontend usan Vitest, Testing Library, jsdom y respuestas simuladas; no verifican una API conectada.

## 3. Entorno utilizado

Los registros disponibles corresponden al repositorio en Windows, con npm workspaces y Vitest. Las ejecuciones backend de integración registradas usaron la configuración de base de pruebas del proyecto. No se consignan aquí cadenas de conexión, secretos ni credenciales. El despliegue público no está confirmado.

No se dispone de una fecha/hora de ejecución verificable para todos los resultados históricos; por ello no se les atribuye una fecha exacta ni se presentan como una corrida de esta edición del informe.

## 4. Pruebas automatizadas existentes

### Backend

- `backend/tests/health.test.ts`: respuesta de `GET /api/health`.
- `backend/tests/auth.test.ts`: registro, validaciones, login, token y usuario inactivo.
- `backend/tests/services.test.ts`: catálogo, administración y validaciones de servicios.
- `backend/tests/professionals.test.ts`: alta, estado y horario de profesionales.
- `backend/tests/blocks.test.ts`: permisos y cruces de bloqueos.
- `backend/tests/availability.test.ts`: disponibilidad, bloqueos, turnos y grilla.
- `backend/tests/booking.test.ts`: reglas de reserva, bordes de intervalos y concurrencia.
- `backend/tests/appointments-query.test.ts`: alcance de consulta por rol.
- `backend/tests/cancel.test.ts`: cancelación, anticipación y titularidad.
- `backend/tests/close.test.ts`: completar, ausente y transiciones finales.
- `backend/tests/clients.test.ts`: consulta y desactivación de clientes.
- `backend/tests/schema.test.ts`: estructura, migraciones y restricción de exclusión.
- `backend/tests/seed.test.ts`: idempotencia de la semilla con PostgreSQL.
- `backend/tests/seed-cli.test.ts`: guardrails de selección de DB para `seed:test`.

Vitest está configurado para ejecutar archivos backend en serie porque comparten una DB de pruebas.

### Frontend

`frontend/tests/auth.test.tsx`, `booking.test.tsx`, `my-appointments.test.tsx`, `agenda.test.tsx` y `admin.test.tsx` verifican pantallas, respuestas simuladas, mensajes y acciones de interfaz. No sustituyen pruebas de integración contra backend real.

## 5. Resultados con evidencia disponible

Los siguientes son **resultados históricos disponibles en el registro de trabajo anterior**, no ejecuciones realizadas al redactar este informe:

| Verificación | Estado | Evidencia registrada |
|---|---|---|
| Suite backend de integración | **Aprobada parcialmente** | En una ejecución histórica, 13 archivos pasaron, con 58 tests aprobados y 4 omitidos. Los omitidos correspondían a tres pruebas de integración de `schema.test.ts` y una de `seed.test.ts`. El detalle por CP no quedó registrado en este informe. |
| Suite de reservas | **Aprobada históricamente** | Se registró `booking.test.ts` con 11 de 11 tests aprobados dentro de las verificaciones anteriores. No se repitió en esta tarea. |
| Suite frontend | **Aprobada históricamente** | 5 archivos y 21 tests aprobados. La suite emplea mocks y no acredita integración con el servidor. |
| Tests guardrail de `seed:test` | **Aprobada históricamente** | 1 archivo y 4 tests aprobados: carga/ruta de entorno, ausencia de fallback, rechazo del mismo destino y aceptación de un destino de pruebas diferente. La semilla no se ejecutó contra ninguna base en ese trabajo. |
| Build backend | **Aprobado históricamente** | `npm.cmd run build -w backend` terminó correctamente en una ejecución anterior. |
| Build frontend | **Aprobado históricamente** | `npm.cmd run build -w frontend` terminó correctamente en una ejecución anterior, incluyendo TypeScript y Vite. |
| Test backend de salud | **Fallida** | En una ejecución anterior, `health.test.ts` no pudo abrir la conexión local de Supertest: `connect EACCES 127.0.0.1:49608`. El error registrado fue de permiso de red local del entorno, no de una aserción funcional. |

Estos resultados no deben interpretarse como estado actualizado posterior a cambios en archivos ni como evidencia de producción.

## 6. Verificaciones manuales

No se encontró un registro reproducible de recorridos manuales del desarrollador en navegador contra una API y base conectadas. Por lo tanto, registro/login real, reserva real, cancelación, administración y flujo profesional quedan como **No ejecutada / pendiente de confirmación manual**. Las pruebas de Testing Library no se contabilizan como pruebas manuales.

## 7. Incidencias y limitaciones

1. **Cuatro pruebas de integración omitidas en el resultado histórico.** `schema.test.ts` conserva tres llamadas a `it.skipIf(!dbAvailable)` y `seed.test.ts` una. `dbAvailable` comienza en `false` y se actualiza en `beforeAll`; la condición de `skipIf` se evalúa antes, al declarar los tests. Esos casos quedaron omitidos y no se consideran aprobados.
2. **Disponibilidad de PostgreSQL condiciona la suite backend.** Otros archivos esperan una DB y sus hooks ejecutan migraciones y `TRUNCATE`. Si la DB no está disponible, no se debe presentar la suite como omitida o aprobada sin revisar el resultado efectivo.
3. **Error EACCES en health.** El test de salud fue bloqueado por acceso a loopback en ese entorno. Requiere una ejecución en un entorno que permita la conexión local para confirmar la aserción.
4. **No hay evidencia manual ni de producción.** No se registraron pruebas en navegador contra el despliegue, ni hay URL pública confirmada.

## 8. Casos pendientes de ejecución o confirmación

- **CP-01 a CP-41:** el registro histórico agregado no conserva una matriz individual de resultados por caso; confirmar el mapeo en una ejecución vigente de la suite backend.
- **Integración de esquema:** las tres pruebas omitidas de migraciones repetidas, rechazo de solape por GiST y adyacencia de intervalos.
- **Integración de semilla:** la prueba de idempotencia con PostgreSQL real. Los tests de guardrails CLI no equivalen a ejecutar la semilla.
- **Health:** repetir en un entorno que permita loopback y registrar el resultado.
- **Frontend contra servicios reales:** completar un recorrido manual con API/base conectadas; las 21 pruebas históricas fueron con mocks.
- **Pruebas de publicación:** no ejecutadas; verificar API, frontend, CORS y persistencia solo cuando exista despliegue.
- **Estado actual tras cambios recientes:** no se ejecutaron pruebas durante la preparación de este informe, de acuerdo con la instrucción recibida.

Para repetir la integración, usar una `DATABASE_URL_TEST` aislada de producción. Las suites pueden migrar y truncar esa base. No ejecutar pruebas o semillas contra la base principal.

## 9. Conclusión general

Existe una base automatizada amplia y hay resultados históricos positivos para backend, frontend y builds. Sin embargo, los resultados no bastan para afirmar que todos los CP están aprobados hoy: cuatro integraciones quedaron omitidas, el detalle histórico por caso no se conserva aquí y el test de salud tuvo un fallo ambiental. No hay evidencia manual o de producción. La entrega de pruebas debe cerrarse con una ejecución vigente y segura de las integraciones faltantes, el resultado de loopback y un registro manual fechado únicamente cuando esas acciones se realicen.
