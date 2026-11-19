# Manual de usuario

Studio Capilar permite consultar servicios y disponibilidad, reservar turnos y gestionar una agenda según el rol de la cuenta.

## Acceso

La aplicación se abre desde la dirección web que proporcione quien la administre. En esta entrega no hay una dirección pública confirmada. En desarrollo local, la interfaz se abre en `http://localhost:5173` cuando se inicia el frontend.

La portada permite consultar los servicios activos y profesionales disponibles. Para reservar o gestionar información hay que ingresar con una cuenta.

## Crear una cuenta e ingresar

1. Elegí **Registrate** o abrí `/registro`.
2. Ingresá nombre, correo y una contraseña de al menos 8 caracteres que contenga una letra y un número. El teléfono es opcional.
3. Al registrarte se crea una cuenta de cliente y se inicia sesión.

Para volver a ingresar, abrí **Ingresá** o `/ingreso` y completá correo y contraseña. Si las credenciales no son válidas o la cuenta está inactiva, el sistema informa que las credenciales son inválidas. Una sesión vencida requiere iniciar sesión nuevamente.

El registro público solo crea clientes. Las cuentas profesionales las crea un administrador y la cuenta administradora se provisiona fuera del registro público.

## Clientes

### Reservar un turno

1. Iniciá sesión y abrí **Reservar** (`/reservar`).
2. Elegí un servicio y un profesional.
3. Seleccioná una fecha; la aplicación consulta los horarios disponibles para esa combinación.
4. Elegí uno de los horarios devueltos y confirmá la reserva.
5. Al confirmarse, se muestra el resultado y podés ir a **Mis turnos**.

La duración y el precio vienen del servicio. Solo se muestran horarios ofrecidos por la API: estos pueden dejar de estar disponibles antes de confirmar. Un turno debe ser futuro, estar dentro del horizonte de reserva y del horario laboral, respetar la grilla de 15 minutos y no cruzarse con otro turno o bloqueo. Si el servidor rechaza la operación, la interfaz muestra el mensaje recibido.

### Consultar y cancelar turnos

Abrí **Mis turnos** (`/mis-turnos`) para revisar tus citas. Podés solicitar la cancelación de un turno reservado propio. El sistema exige al menos 24 horas de anticipación; exactamente 24 horas está permitido. Si falta menos tiempo, informa que la cancelación es tardía. Los turnos que ya no están reservados no se pueden cancelar.

## Profesionales

Después de ingresar, abrí **Mi agenda** (`/agenda`). Tiene estas secciones:

- **Turnos:** consulta los turnos asignados. Cuando un turno reservado ya comenzó, podés marcarlo como **Completar** o **Ausente**.
- **Horario:** reemplazá tu horario semanal y guardá los cambios. Cada día configurado tiene un único tramo.
- **Bloqueos:** creá un intervalo futuro con fecha y hora de inicio y fin, y opcionalmente un motivo. Los bloqueos existentes se listan y pueden eliminarse mientras la operación sea válida.

Solo podés operar sobre tu propia agenda. No se puede crear un bloqueo inválido o que se cruce con un turno reservado. La API valida las operaciones aunque la pantalla permita iniciar una acción.

## Administración

La cuenta administradora accede a **Panel de administración** (`/admin`), con cuatro secciones:

- **Servicios:** crear servicios con nombre, duración y precio; activar o desactivar servicios.
- **Profesionales:** crear cuentas profesionales, activar o desactivar perfiles y abrir la configuración de horario.
- **Clientes:** consultar la lista y activar o desactivar cuentas.
- **Turnos:** consultar turnos y cancelar turnos reservados.

Los permisos también se verifican en el servidor. Si una operación no está autorizada o incumple una regla, se muestra el error devuelto por la API.

## Situaciones a tener en cuenta

- Los horarios disponibles dependen del servicio, profesional, fecha, jornada, turnos ya reservados y bloqueos.
- Un servicio o profesional inactivo no está disponible para nuevas reservas.
- El profesional no cancela turnos desde la agenda; la cancelación corresponde al cliente dentro del plazo o a administración.
- La aplicación no incluye pagos, recordatorios por correo ni recuperación de contraseña.
