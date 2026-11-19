# Plan de pruebas — Studio Capilar

## 1. Objetivo

Definir cómo verificar que la aplicación respeta los casos CP-01 a CP-41 de `spec.md`, además de los flujos de interfaz existentes. Este documento describe pruebas planeadas y sus resultados esperados; su inclusión aquí no significa que hayan sido ejecutadas o aprobadas.

## 2. Alcance

Se cubren registro e inicio de sesión, catálogo, administración de servicios y profesionales, horario y bloqueos, disponibilidad, reservas y concurrencia, consulta y cancelación de turnos, cierre de turnos, administración de clientes y las pantallas frontend existentes.

Quedan fuera pagos, correo, recuperación de contraseña, varias sucursales, pruebas de carga, auditoría de infraestructura y validación en producción: no son funciones de la v1 ni hay despliegue confirmado.

## 3. Tipos de prueba

- **Funcionales:** aceptación de las operaciones y reglas de negocio descritas en CP.
- **Integración:** API Express/Supertest contra PostgreSQL real de pruebas, incluyendo persistencia, transacciones y migraciones.
- **Validación:** campos inválidos, duración, fechas, grilla, intervalos y estructura de solicitudes.
- **Autorización:** autenticación JWT y permisos por rol/titularidad.
- **Concurrencia:** dos reservas simultáneas y operación de bloqueos frente a agenda ocupada.
- **Frontend:** pruebas de componentes y flujos con Vitest, Testing Library y jsdom; la suite usa `fetch` simulado y no sustituye integración API.

## 4. Entorno, herramientas y seguridad de ejecución

- Node.js 22 o superior y npm workspaces.
- Backend: Vitest y Supertest; base PostgreSQL independiente definida por `DATABASE_URL_TEST`.
- Frontend: Vitest, Testing Library y jsdom.
- Backend configurado para correr archivos de test en serie (`fileParallelism: false`) porque comparten una DB que se limpia entre casos.
- Fijar el reloj inyectable para los casos sensibles a hora, zona local y anticipación de cancelación.
- Antes de una ejecución de integración, verificar que `DATABASE_URL_TEST` exista y no apunte al destino principal. Los helpers aplican migraciones y hacen `TRUNCATE`; no usar una base con datos que deban conservarse.
- No usar secretos reales en fixtures ni imprimir variables de entorno.

Comandos declarados en los `package.json`:

```bash
npm test
npm run test:frontend
```

`npm test` delega a `npm run test -w backend` y `npm run test:frontend` a `npm run test -w frontend`.

## 5. Datos y precondiciones comunes

Para los CP backend de integración, preparar una DB de pruebas migrada y aislada. Los casos deben crear los usuarios, servicios, profesionales, horarios, turnos y bloqueos que necesiten; los helpers limpian las tablas antes de cada caso. Usar usuarios de rol cliente, profesional y administrador con contraseñas de prueba y tokens válidos emitidos por el backend. Fijar fechas coherentes con el reloj de prueba y `America/Argentina/Buenos_Aires`.

Para frontend, renderizar cada pantalla con el rol requerido y controlar las respuestas de red mediante los mocks de `fetch` ya usados por la suite. Los datos de respuesta deben corresponder a las formas de API consumidas por la interfaz.

## 6. Casos backend por módulo

Los pasos siguientes describen el diseño de cada caso; el resultado esperado se considera aprobado únicamente después de ejecutar la prueba y observar la aserción correspondiente.

### Autenticación

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-01 | RN11, RN15. Email disponible y contraseña válida. | Registrar nombre, email y contraseña, incluyendo `role: administrador`; consultar `/api/auth/me` con el token. | HTTP 201, rol `cliente`; `/me` devuelve el mismo usuario. Aceptar solo si el rol enviado no eleva privilegios. |
| CP-02 | RN15. Usuario existente con email en minúsculas. | Intentar registrar el mismo email con mayúsculas distintas. | HTTP 409 `EMAIL_TAKEN`; continúa existiendo un solo usuario. |
| CP-03 | RN15. Sin usuario previo para ese email. | Registrar con contraseña sin letras (`12345678`). | HTTP 400 `VALIDATION_ERROR`; no se crea usuario. |
| CP-04 | Usuario cliente activo con clave válida. | Iniciar sesión y usar el token en `/api/auth/me`. | HTTP 200 en login y token aceptado por `/me`. |
| CP-05 | Email inexistente y usuario existente con contraseña incorrecta. | Ejecutar ambos intentos de login. | Ambos responden HTTP 401 `INVALID_CREDENTIALS` con el mismo mensaje. |
| CP-06 | Cliente inactivo con contraseña correcta. | Intentar iniciar sesión. | HTTP 401 `INVALID_CREDENTIALS`. |

### Servicios

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-07 | RN16. Un servicio activo y uno inactivo. | Consultar `GET /api/services` sin token. | Solo aparece el activo e incluye duración y precio en centavos. |
| CP-08 | RN16. Administrador autenticado. | Crear servicio de 45 minutos y 1.500.000 centavos; desactivarlo; consultar catálogo público. | Alta HTTP 201 y servicio ausente del catálogo después de la baja lógica. |
| CP-09 | RN13. Administrador autenticado. | Intentar crear servicio de 20 minutos. | HTTP 400; el servicio no queda guardado. |
| CP-10 | RN12. Cliente autenticado. | Enviar `POST /api/services`. | HTTP 403 `FORBIDDEN`; no se crea servicio. |

### Profesionales y horarios

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-11 | Administrador autenticado y email profesional nuevo. | Crear profesional con datos válidos y consultar perfil/horario persistidos. | Usuario y ficha profesional activos; horario de lunes a viernes 09:00–18:00 y sábado 09:00–13:00; domingo sin tramo. |
| CP-12 | RN6. Profesional activo con sesión. | Administrador lo desactiva; intentar login, listar profesionales públicamente y reservar con esa ficha. | Login impedido, perfil no aparece públicamente y reserva responde 422 `INACTIVE`. |
| CP-13 | RN4. Profesional con horario semanal configurable. | Reemplazar horario por martes 10:00–14:00; pedir disponibilidad de servicio de 60 min para martes y miércoles dentro del horizonte. | Martes ofrece inicios 10:00–13:00 en grilla de 15 min; miércoles lista vacía. |
| CP-14 | RN4. Horario del profesional solo martes 10:00–14:00; servicio de 60 min. | Intentar reservar martes 13:15. | HTTP 422 `OUTSIDE_WORKING_HOURS`; no se crea turno. |

### Disponibilidad y bloqueos

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-15 | RN5. Horario laboral y bloqueo futuro que cruza parte de la jornada. | Consultar disponibilidad del día para un servicio que ocupe ese intervalo. | Ningún inicio ofrecido produce un turno que cruce el bloqueo. |
| CP-16 | RN5. Turno reservado existente. | Profesional titular intenta crear un bloqueo que lo cruza. | HTTP 409 `OVERLAP`; el bloqueo no se persiste. |
| CP-17 | RN12. Cliente autenticado. | Intentar crear un bloqueo. | HTTP 403; no se crea bloqueo. |
| CP-18 | RN2, RN3, RN12, RN13. Turno reservado 10:00–10:45; servicio de 30 min; jornada 09:00–13:00. | Consultar disponibilidad. | No hay slots que crucen el turno; 10:45 puede aparecer; todos los inicios respetan la grilla. |

### Reservas y concurrencia

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-19 | RN3. Profesional/servicio activos; servicio de 45 min y 900.000 centavos; hueco futuro válido. | Cliente reserva sin enviar precio ni duración. | HTTP 201; estado `reservado`, fin calculado a +45 min y precio/duración copiados desde el servicio. |
| CP-20 | RN1. Inicio anterior al reloj fijado. | Intentar reservar. | HTTP 422 `PAST_DATE`; sin turno nuevo. |
| CP-21 | RN16. Servicio inactivo. | Intentar reservarlo. | HTTP 422 `INACTIVE_SERVICE`. |
| CP-22 | RN17. Cliente inactivo y administrador que envía su `clientId`. | Intentar crear reserva para ese cliente. | HTTP 422 `INACTIVE`. |
| CP-23 | RN14. Inicio alineado, dentro del horario, en el día local hoy + 31. | Intentar reservar. | HTTP 422 `OUTSIDE_HORIZON`. |
| CP-24 | RN13. Inicio 10:10 con los demás datos válidos. | Intentar reservar. | HTTP 422 `INVALID_SLOT`. |
| CP-25 | RN2. Turno reservado 10:00–11:00 para ese profesional. | Otro cliente reserva a las 10:30 por 30 min. | HTTP 409 `OVERLAP`; no se agrega el segundo turno. |
| CP-26 | RN2. Turno reservado 10:00–11:00. | Reservar para el mismo profesional a las 11:00. | HTTP 201; los intervalos adyacentes no se consideran solapados. |
| CP-27 | RN2, RN8. Hueco libre y dos clientes/tokens. | Enviar a la vez dos reservas idénticas mediante `Promise.all`. | Una respuesta HTTP 201, otra 409 `OVERLAP` y exactamente un turno reservado persistido. |
| CP-28 | RN12. Cliente autenticado y otro cliente existente. | Enviar el `clientId` ajeno en una reserva. | HTTP 403 y sin turno nuevo. El envío sin `clientId` debe asociar el turno al usuario autenticado. |

### Consulta de agenda y turnos

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-29 | RN12. Turnos para clientes A y B, con profesional P y al menos otro profesional. | Listar turnos como A, P y administrador. | A ve solo los propios; P ve su agenda y no turnos de otro profesional; administrador ve todos. |

### Cancelaciones

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-30 | RN7. Turno propio que inicia exactamente en 24 horas; disponibilidad preparada. | Cliente cancela y consultar nuevamente disponibilidad. | Queda `cancelado` y el horario vuelve a estar disponible. |
| CP-31 | RN7. Turno propio que inicia en 23 h 59 min. | Cliente intenta cancelar. | HTTP 422 `LATE_CANCEL`; permanece `reservado`. |
| CP-32 | RN7. Turno que inicia en una hora. | Administrador cancela. | Queda `cancelado`, sin exigir anticipación al administrador. |
| CP-33 | RN7. Profesional titular de turno reservado. | Intenta cancelarlo. | HTTP 403; permanece `reservado`. |
| CP-34 | RN12. Cliente A y turno titularidad del cliente B. | A intenta cancelar el turno de B. | HTTP 403; no se altera el turno ajeno. |

### Agenda: cierre de turnos

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-35 | RN10. Turno reservado cuyo inicio es anterior o igual al reloj. | Profesional titular lo marca completado. | Estado `completado`; verificar también el borde de igualdad inicio/reloj. |
| CP-36 | RN10. Turno reservado con inicio futuro. | Intentar completarlo y marcarlo ausente. | Ambas operaciones responden 422 `INVALID_TRANSITION`; sigue `reservado`. |
| CP-37 | RN10. Turno reservado ya iniciado. | Profesional titular marca no-show. | Estado `ausente`. |
| CP-38 | RN9. Turno en estado final `cancelado`. | Administrador intenta completarlo. | HTTP 422 `INVALID_TRANSITION`; el estado final no cambia. |
| CP-39 | RN12. Turno reservado de profesional P; sesión de profesional Q. | Q intenta completarlo. | HTTP 403; no cambia el turno. |

### Administración de clientes

| Caso | Requisito / precondición | Pasos | Resultado esperado y aceptación |
|---|---|---|---|
| CP-40 | RN17. Dos clientes activos y administrador. | Listar clientes; desactivar uno; listar activos e intentar login de ese usuario. | El inactivo queda fuera del listado por defecto y su login responde `INVALID_CREDENTIALS`. |
| CP-41 | RN12. Cliente autenticado. | Consultar `GET /api/clients`. | HTTP 403. |

## 7. Casos frontend existentes

Las suites de interfaz actuales cubren los siguientes comportamientos con respuestas de API simuladas. Son complementarias a los CP de backend y no prueban la API real:

| Suite | Cobertura contemplada | Resultado esperado |
|---|---|---|
| `frontend/tests/auth.test.tsx` | Formularios, registro/login, guardado de token, error de contraseña corta y credenciales inválidas. | Render correcto; token bajo `studio_capilar_token`; errores visibles. |
| `frontend/tests/booking.test.tsx` | Catálogo, slots, rechazo `OVERLAP`, selección de slot de la lista. | Flujo mostrado según respuesta; se informa el error y no se confirma un slot no seleccionado. |
| `frontend/tests/my-appointments.test.tsx` | Listado, eliminación visual tras cancelar y error `LATE_CANCEL`. | La UI refleja respuesta de API simulada. |
| `frontend/tests/agenda.test.tsx` | Tabs, guardado de horario, error `OVERLAP`, rol cliente sin formularios de gestión. | Controles y mensajes se muestran según sesión y respuesta. |
| `frontend/tests/admin.test.tsx` | Secciones administrativas, listado/formulario de servicios y error 403. | Panel y acciones usan endpoints esperados; el error se presenta. |

## 8. Relación entre casos y requisitos

| Requisito funcional / reglas | Casos | Módulo |
|---|---|---|
| HU-01/HU-02; RN11, RN15, RN17 | CP-01 a CP-06 | Autenticación |
| HU-03/HU-04; RN12, RN13, RN16 | CP-07 a CP-10 | Servicios |
| HU-05/HU-06; RN4, RN6 | CP-11 a CP-14 | Profesionales y reservas |
| HU-07/HU-08; RN2, RN3, RN5, RN12, RN13 | CP-15 a CP-18 | Disponibilidad y bloqueos |
| HU-09; RN1, RN2, RN3, RN8, RN12, RN13, RN14, RN16, RN17 | CP-19 a CP-28 | Reservas |
| HU-10; RN12 | CP-29 | Consulta de agenda |
| HU-11; RN7, RN12 | CP-30 a CP-34 | Cancelaciones |
| HU-12; RN9, RN10, RN12 | CP-35 a CP-39 | Agenda y cierre |
| HU-13; RN12, RN17 | CP-40 a CP-41 | Administración |

## 9. Criterios generales de aceptación

1. Ejecutar todos los CP sin fallos en DB de pruebas aislada y con los datos preparados de forma repetible.
2. Confirmar expresamente los rechazos y los estados persistidos, no solo los códigos HTTP.
3. Repetir CP-27 para confirmar que la concurrencia produce un único turno.
4. No contar casos omitidos como aprobados; registrar el motivo y reprogramar su ejecución.
5. Ejecutar por separado la suite frontend y describirla como prueba de interfaz con API simulada.
6. Registrar comando, entorno, fecha observada, totales, omisiones y errores reales en el informe, sin incluir secretos ni URLs con credenciales.
