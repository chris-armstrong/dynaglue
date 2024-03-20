import debug from 'debug';

export const DebugTestsNamespace = 'dynaglue:dynamodb:test';

/** @internal */
const logger = debug(DebugTestsNamespace);

/**
 * @internal
 *
 * Helper for logging dynamo requests
 */
export const debugTests = (message: string, data: unknown): void => {
  logger('%s: %O', message, data);
};
