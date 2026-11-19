# Decisiones

Todas las decisiones de abajo están cerradas. La especificación en `spec.md` ya las incorpora. No hace falta volver a elegirlas para implementar.

Criterio usado en cada caso: la opción más simple que sigue siendo coherente, segura para una entrega académica y directa de programar.

## D1. Monorepo con dos paquetes

`backend/` y `frontend/` viven en un solo repositorio npm workspaces. No hay paquete compartido: el contrato es la API de `spec.md`. Un tercer paquete de tipos agrega acoplamiento sin acortar la entrega.

## D2. SQL explícito, sin ORM

El acceso a datos usa `pg` y migraciones en `backend/migrations/*.sql`, aplicadas en orden por un script propio que registra cada archivo en `schema_migrations`. Las reglas de solapamiento se ven en SQL. Un ORM ocultaría la restricción de exclusión y el `SELECT … FOR UPDATE`.

## D3. Identificadores y dinero

Los ids son UUID generados por PostgreSQL (`gen_random_uuid()`). Los precios se guardan en centavos enteros de pesos argentinos. No se usan números decimales para dinero.

## D4. Zona horaria única

El local opera en `America/Argentina/Buenos_Aires`. La base guarda `timestamptz` en UTC. El horario semanal es un reloj de pared, sin zona, interpretado siempre en esa zona. Los cálculos de día, grilla y horizonte usan Luxon. El servidor no depende de la variable de entorno `TZ`.

## D5. Sesión con JWT en `localStorage`

El login devuelve un JWT de 8 horas. El navegador lo guarda en `localStorage` bajo la clave `studio_capilar_token` y lo envía como `Authorization: Bearer`.

Se descartó la cookie `HttpOnly` porque el frontend (Netlify) y el backend (Render) quedan en sitios distintos: haría falta `SameSite=None`, HTTPS y una configuración de cookies más frágil para la misma entrega. El riesgo de XSS queda aceptado y anotado como límite de la v1. No hay refresh token ni recuperación de contraseña.

El backend no arranca si falta `JWT_SECRET`. Ese secreto no tiene valor por defecto en el código.

## D6. Contraseñas

`bcryptjs` con costo 10. Así se evita compilar `bcrypt` nativo en Windows y en Render. La contraseña tiene al menos 8 caracteres, una letra y un número. El login responde siempre «Credenciales inválidas», tanto si el email no existe como si la clave es incorrecta o el usuario está inactivo.

## D7. Un solo administrador, creado por semilla

El registro público solo crea clientes. Profesionales los crea un administrador. No hay alta de administradores en la API: el único administrador lo inserta `npm run seed` con `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Si ese email ya existe, la semilla no cambia la contraseña.

## D8. El cliente es un usuario

No hay tabla `clients`. Un cliente es un usuario con rol `cliente`. Un profesional es un usuario con rol `profesional` más una fila en `professionals`. Así la administración de clientes es un listado filtrado por rol, sin duplicar nombre, email y estado.

## D9. Desactivar en lugar de borrar

Servicios, profesionales y clientes no se borran: se desactivan. Los turnos históricos siguen apuntando a las mismas filas. Desactivar un profesional pone `users.active` y `professionals.active` en falso, así no puede entrar ni recibir reservas. Reactivar pone ambos en verdadero. Desactivar un cliente solo cambia `users.active`.

## D10. Horario por defecto

Al crear un profesional queda este horario, que después se puede reemplazar entero:

- Lunes a viernes, 09:00 a 18:00.
- Sábado, 09:00 a 13:00.
- Domingo sin fila: cerrado.

Hay como máximo un tramo continuo por día. No hay corte para almorzar en la v1. Un turno no puede cruzar la medianoche ni salir de ese tramo.

## D11. Grilla de 15 minutos y horizonte de 30 días

El inicio del turno cae en el minuto 00, 15, 30 o 45, con segundos y milisegundos en cero, mirando el reloj del local. La duración de un servicio es múltiplo de 15, entre 15 y 240. Solo se reserva desde el instante siguiente a ahora hasta el día local de hoy más 30 días, inclusive.

Estas dos restricciones hacen que la disponibilidad sea una lista finita y comprobable. No agregan pantallas nuevas.

## D12. Intervalos semiabiertos

Turnos y bloqueos ocupan `[inicio, fin)`. Un turno que termina a las 10:00 y otro que empieza a las 10:00 no se pisan. El mismo criterio usa la restricción de exclusión y el cálculo de disponibilidad.

## D13. Quién cancela y quién cierra el turno

El cliente cancela solo los suyos, en estado `reservado`, con al menos 24 horas de anticipación. Exactamente 24 horas todavía se puede. El administrador cancela cualquier `reservado` sin esa espera. El profesional no cancela: bloquea el futuro o pide la baja a administración.

`completado` y `ausente` los cargan el profesional de ese turno o un administrador, solo desde `reservado` y solo cuando el inicio ya pasó. Esos dos estados, y `cancelado`, son finales.

## D14. Concurrencia en la base, no en la pantalla

Toda escritura que ocupa o libera la agenda de un profesional (reserva, cancelación no aplica al hueco porque el estado deja de ser `reservado`, alta de bloqueo) abre una transacción y ejecuta `SELECT … FROM professionals WHERE id = $1 FOR UPDATE` antes de leer solapamientos.

Además, los turnos `reservado` del mismo profesional no pueden solaparse por una restricción `EXCLUDE USING gist` sobre `tstzrange(start_at, end_at, '[)')`. Si la transacción se equivoca, PostgreSQL sigue rechazando el duplicado. El código  `23P01` se traduce al error `OVERLAP`.

Los bloqueos viven en otra tabla. El candado de la fila del profesional serializa un alta de bloqueo contra una reserva simultánea. La restricción de exclusión no cubre ese caso cruzado; el candado sí.

## D15. Reloj inyectable

Las reglas que comparan contra «ahora» reciben un reloj `() => Date`. En producción devuelve la hora real. Las pruebas pasan un instante fijo. No se usa `now()` de SQL para aceptar o rechazar una reserva, una cancelación o un cierre. `created_at` sí puede usar el valor por defecto de la base.

## D16. Catálogo público, agenda privada

Sin autenticación se puede ver servicios activos, profesionales activos, su horario semanal y los horarios de inicio libres. Esa respuesta no incluye nombres de otros clientes, emails ni bloqueos crudos. Crear, cancelar y administrar exige sesión y el rol que fija `spec.md`.

## D17. Errores de API

Toda respuesta de error es JSON:

```json
{ "error": { "code": "OUTSIDE_WORKING_HOURS", "message": "Texto en español." } }
```

Los códigos de máquina están en inglés. Los mensajes están en español. El cuerpo de validación de Zod usa `VALIDATION_ERROR`. Un solapamiento es 409. Una regla de negocio incumplida es 422. Un rol incorrecto es 403.

## D18. Capas del backend

Por módulo (`auth`, `services`, `professionals`, `appointments`, `clients`) hay un router, un servicio y un repositorio. El router valida y traduce HTTP. El servicio aplica las reglas. El repositorio ejecuta SQL. Las reglas no viven solo en React.

## D19. Frontend mínimo

React, TypeScript, Vite y React Router. Estilos en un CSS propio, sin biblioteca de componentes. En local, Vite proxea `/api` a `http://localhost:4000`. En producción, `VITE_API_URL` apunta al backend de Render. No hay estado global de terceros: el token y el usuario de sesión viven en un contexto chico.

La interfaz puede ocultar botones, pero el servidor repite cada regla. Una prueba de API debe fallar aunque la pantalla ni exista.

## D20. Pruebas

Backend: Vitest y Supertest contra Express exportado, sin puerto fijo, y contra PostgreSQL real (`DATABASE_URL_TEST`). Los archivos de prueba corren en serie. Antes de cada prueba se vacían las tablas.

Frontend: Vitest, Testing Library y jsdom para el flujo de reserva y los mensajes que vienen de la API. No hay navegador automatizado de extremo a extremo en la v1.

Ninguna tarea se cierra con pruebas en rojo o sin correr.

## D21. Despliegue previsto, todavía no hecho

- Frontend: Netlify, directorio `frontend`, comando de build `npm run build`, publicación `dist`.
- Backend: Render, directorio `backend`, build `npm install && npm run build`, start `npm start`.
- Base: Neon, una base de producción. Las migraciones se corren a mano contra `DATABASE_URL` antes de usar el servicio.

No hay cuentas, URLs ni secretos cargados en este repositorio. El README no debe inventar una dirección publicada.

## D22. Idioma

Textos de interfaz, mensajes de error y documentación en español. Nombres de código, tablas, columnas y campos JSON en inglés, con camelCase en JSON. Los valores de rol y de estado del turno van en español, porque son el vocabulario del negocio: `cliente`, `profesional`, `administrador`, `reservado`, `cancelado`, `completado`, `ausente`.

## D23. Datos de demostración

La semilla siempre intenta crear el administrador. Solo si existe `DEMO_PASSWORD` crea, de forma idempotente, tres servicios y un profesional de muestra. Esos emails usan el dominio `studio-capilar.local`. Las contraseñas salen del entorno, nunca del código ni de la documentación.

## D24. Lo que se rechazó a propósito

- Varios tramos por día, turnos recurrentes y lista de espera.
- Que el cliente elija la duración.
- Que un cliente no pueda tener dos turnos propios a la misma hora con profesionales distintos. La v1 no lo prohíbe.
- Borrado físico, edición del precio histórico de un turno ya tomado y cambio de servicio de un turno existente.
- Pagos, mails y más de un administrador.
