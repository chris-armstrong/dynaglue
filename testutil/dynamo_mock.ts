export type DynamoMock<T> = {
  [key: string]: jest.Mock<{ promise: jest.Mock<Promise<T>> }>;
};

export const createAWSError = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code });

export function createDynamoMock(
  methodName: string,
  returnValue: Record<string, unknown>
): DynamoMock<typeof returnValue> {
  const mockFunction = jest.fn().mockResolvedValue(returnValue);
  return {
    send: mockFunction,
  };
}

export function createDynamoMockError(
  methodName: string,
  error: Error
): DynamoMock<any> {
  return {
    send: jest.fn().mockRejectedValue(error),
  };
}
