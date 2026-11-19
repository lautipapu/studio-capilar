# Studio Capilar

Studio Capilar es un sistema web de gestión de turnos para una peluquería. Una clienta o un cliente elige un servicio y un profesional, ve los horarios realmente disponibles y reserva. El profesional organiza su semana y bloquea los ratos en los que no atiende. La administración mantiene el catálogo, las personas y los turnos.

El proyecto es individual y académico. La versión 1 demuestra reglas de negocio de una agenda real: duración según el servicio, horario laboral, bloqueos, cancelación anticipada, estados del turno y una sola reserva válida cuando dos personas piden el mismo horario al mismo tiempo.

## Problema

Una peluquería chica coordina turnos por mensajes. Eso produce dos citas en el mismo horario, turnos fuera del día de trabajo, servicios tomados a profesionales que ya no atienden y cancelaciones de último momento sin un criterio común.

## Quién lo usa

- **Cliente.** Se registra, consulta el catálogo, reserva, revisa sus turnos y cancela con la anticipación exigida.
- **Profesional.** Consulta su agenda, define su horario semanal y bloquea intervalos.
- **Administrador.** Carga servicios y profesionales, activa o desactiva personas y servicios, y supervisa todos los turnos.

Hay un solo local, una sola zona horaria y un solo administrador inicial, creado por semilla.

## Qué entra en la v1

- Registro e inicio de sesión de clientes.
- Los tres roles y permisos distintos.
- Catálogo de servicios con duración y precio.
- Horario semanal y bloqueos por profesional.
- Reserva, consulta y cancelación.
- Administración de servicios, profesionales, clientes y turnos.
- Las reglas RN1 a RN17 de `spec.md`, aplicadas en el servidor y, donde corresponde, en PostgreSQL.

## Qué queda afuera

Pagos, señas, correos, recordatorios, recuperación de contraseña, varias sucursales, lista de espera, comisiones, reportes de facturación y la carga de más administradores. El detalle está en `preguntas-abiertas.md`. Esas exclusiones no impiden implementar la v1.

## Criterio de éxito

Una persona puede registrarse, reservar un turno válido y cancelarlo cuando la regla lo permite. Un profesional no queda con dos turnos activos superpuestos, tampoco si las dos reservas llegan juntas. Cada regla numerada tiene al menos un caso de prueba automático asociado. La documentación explica cómo correr el sistema en local y cómo publicarlo; la publicación se anota en el README solo cuando exista de verdad.
