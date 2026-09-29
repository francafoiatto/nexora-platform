import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, errorMessage } from './api-client';

/**
 * Maps an API error onto a react-hook-form: field-level details land on their inputs,
 * everything else becomes a form-level ("root") error.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly Path<T>[]) {
  let placed = false;
  if (error instanceof ApiError) {
    for (const detail of error.details) {
      if (detail.field && (fields as readonly string[]).includes(detail.field)) {
        setError(detail.field as Path<T>, { type: 'server', message: detail.message });
        placed = true;
      }
    }
  }
  if (!placed) setError('root.server' as Path<T>, { type: 'server', message: errorMessage(error) });
}
