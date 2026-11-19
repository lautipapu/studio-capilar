# Agentes de Studio Capilar

Este archivo es la guía de trabajo para cualquier agente en el repositorio. El comportamiento del sistema está cerrado en `spec.md`. Las razones están en `decisiones.md`. La estructura está en `plan.md`. El siguiente trabajo concreto está en `tasks.md`.

## Orden de lectura

1. `spec.md` para reglas, historias y contrato.
2. `plan.md` para saber en qué archivo y en qué capa va el cambio.
3. `tasks.md` para tomar una sola tarea cuyas dependencias ya estén hechas.
4. `preguntas-abiertas.md` solo si aparece un vacío. Si el vacío es de negocio, se anota ahí y no se codea. Si ya está decidido, no se reabre.

## Roles

Las instrucciones largas de cada rol están en `.cursor/agents/`. Las reglas persistentes de Cursor están en `.cursor/rules/`.

| Agente | Archivo | Hace | No hace |
| --- | --- | --- | --- |
| Analista | `.cursor/agents/analista.md` | Historias, RN, criterios Dado/Cuando/Entonces, glosario. | No codea la aplicación. |
| Arquitecto | `.cursor/agents/arquitecto.md` | Modelo, API, capas, tareas y decisiones técnicas. | No implementa la tarea. |
| Backend | `.cursor/agents/backend.md` | Express, SQL, reglas y pruebas Supertest. | No inventa endpoints ni mueve reglas solo a React. |
| Frontend | `.cursor/agents/frontend.md` | Pantallas, mensajes de error y pruebas de interfaz. | No da por válida una reserva que el servidor rechaza. |
| Tester | `.cursor/agents/tester.md` | Casos CP contra API real y base real, más el caso concurrente. | No afloja una aserción para poner la suite en verde. |
| Revisor | `.cursor/agents/revisor.md` | Revisa una tarea terminada contra la spec, sin modificar código. | No agrega funciones ni marca tareas hechas por su cuenta. |

Para usar uno: pedirle que trabaje como ese agente sobre una tarea puntual. Ejemplo: «Trabajá como el agente backend y hacé solo la tarea T03».

## Definición de terminado

- El código hace lo que dice el criterio de la tarea, incluido el rechazo.
- Los CP citados existen, se ejecutaron y pasaron.
- No hay secretos nuevos en el árbol.
- El README no afirma despliegue ni pruebas que no se hayan corrido.
- La tarea no suma alcance de `preguntas-abiertas.md`.

## Estado actual

Documentación, reglas, agentes y esqueleto de carpetas. Sin módulos de aplicación, sin migraciones, sin suite ejecutada y sin despliegue. La próxima tarea es T01.
