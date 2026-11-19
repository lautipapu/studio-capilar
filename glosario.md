# Glosario

Los términos se usan así en la especificación, la API y las pruebas.

**Administrador.** Usuario con rol `administrador`. Gestiona catálogo, personas y turnos de todo el local. En la v1 hay uno solo, creado por la semilla.

**Bloqueo.** Intervalo `[inicio, fin)` en el que un profesional no acepta turnos. Lo carga ese profesional o un administrador. No es un turno y no tiene cliente.

**Catálogo.** Lista de servicios que se pueden reservar. En público solo muestra servicios activos.

**Cliente.** Usuario con rol `cliente`. Se registra solo. Reserva y cancela sus propios turnos.

**Disponibilidad.** Lista de instantes de inicio en los que un servicio concreto cabe para un profesional y un día, después de aplicar horario, grilla, turnos `reservado`, bloqueos, horizonte y la hora actual.

**Duración.** Minutos que ocupa el servicio. Define el fin del turno. No la elige quien reserva.

**Estado del turno.** Uno de `reservado`, `cancelado`, `completado`, `ausente`. Solo `reservado` ocupa la agenda.

**Grilla.** Inicios permitidos cada 15 minutos exactos en el reloj del local: minutos 00, 15, 30 o 45, con segundos en cero.

**Horizonte.** Ventana de reserva: más adelante que ahora y como máximo el día local de hoy más 30 días.

**Horario laboral.** Tramo semanal de un profesional. Como máximo uno por día, de hora de inicio inclusive a hora de fin exclusive, en `America/Argentina/Buenos_Aires`. Un día sin fila está cerrado.

**Intervalo semiabierto.** Rango que incluye el inicio y excluye el fin. Dos intervalos se solapan cuando comparten algún instante. Tocarse en el extremo no es solapamiento.

**Precio.** Entero en centavos de ARS. El turno guarda el precio y la duración del servicio en el momento de reservar.

**Profesional.** Usuario con rol `profesional` y una ficha en `professionals`. Tiene horario, bloqueos y turnos. Si está inactivo no entra al sistema ni recibe reservas.

**Reserva.** Alta de un turno en estado `reservado`.

**Servicio.** Trabajo del catálogo, con nombre, descripción, duración y precio. Puede estar activo o inactivo.

**Turno.** Cita de un cliente con un profesional para un servicio, con inicio, fin, precio copiado y estado.

**Usuario activo.** Fila de `users` con `active = true`. Si está en falso, el login falla.
