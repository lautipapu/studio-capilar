import type { Appointment } from '../api';

interface Props {
  status: Appointment['status'];
}

const LABELS: Record<Appointment['status'], string> = {
  reservado: 'Reservado',
  completado: 'Completado',
  cancelado: 'Cancelado',
  ausente: 'Ausente',
};

export function StatusBadge({ status }: Props) {
  return (
    <span className={`badge badge-${status}`}>{LABELS[status]}</span>
  );
}
