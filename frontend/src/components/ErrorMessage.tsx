import { ApiError } from '../api';

interface Props {
  error: unknown;
}

export function ErrorMessage({ error }: Props) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Ocurrió un error inesperado.';

  return <div className="alert alert-error" role="alert">{message}</div>;
}
