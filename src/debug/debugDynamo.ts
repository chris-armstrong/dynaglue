import debug from 'debug';

/** @internal */
const logger = debug('dynaglue:dynamodb');

/**
 * @internal
 *
 * Helper for logging dynamo requests
 */
function debugDynamo(operation: string, request: unknown): void {
  logger('operation=%s request=%O', operation, request);
}

export default debugDynamo;
