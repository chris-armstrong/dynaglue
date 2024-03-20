import VError from 'verror';

/**
 * Given a caught exception, coerce it to an Error type through
 * introspection. If it isn't a subclass of `Error`, wraps it
 * in an InternalError
 * @param error the error or not
 * @returns an Error object
 */
export const coerceError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  return new VError(
    { name: 'unknown.error', info: { error } },
    'An error of an unknown type occurred'
  );
};
