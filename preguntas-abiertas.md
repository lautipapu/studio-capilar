# Preguntas abiertas

No hay preguntas abiertas que bloqueen la v1. Roles, estados, horarios, cancelación, concurrencia, modelo de datos y API están cerrados en `spec.md`, `decisiones.md` y `plan.md`.

Si durante la implementación aparece un vacío de negocio que cambie una regla, hay que parar, anotarlo en este archivo y resolverlo en `spec.md` antes de codificarlo. Un detalle técnico ya cubierto por `decisiones.md` no se reabre.

## Fuera de alcance

Estas ideas pueden aparecer en una defensa o en una versión posterior. No se implementan ahora y no hace falta responderlas para terminar las tareas.

| Tema | Por qué puede esperar |
| --- | --- |
| Pagos, señas y reembolsos | La v1 controla la agenda, no la caja. |
| Correos, recordatorios y recuperación de contraseña | Exigen un proveedor externo y no cambian las reglas de turnos. |
| Más de un administrador o más de una sucursal | La entrega usa un local y un administrador de semilla. |
| Varios tramos en un mismo día | Alcanza un tramo continuo por día para demostrar el horario laboral. |
| Lista de espera y turnos recurrentes | Agregan estados y pantallas que la consigna no pide. |
| Impedir que un cliente reserve con dos profesionales a la vez | No está en las reglas iniciales. La v1 lo permite. |
| Límite de intentos de login | Mejora de seguridad posterior. Las contraseñas ya van hasheadas y el login no revela si el email existe. |
| Editar un turno ya reservado (cambiar servicio u horario) | Se cancela, si la regla lo permite, y se crea otro. |
| Reportes de facturación y comisiones | No hay cobros en esta versión. |
