export type DynamoMock<T> = {
  [key: string]: jest.Mock<{ promise: jest.Mock<Promise<T>> }>;
};

export const createAWSError = (code: string, message: string): Error => Object.assign(new Error(message), { code });

export function createDynamoMock(methodName: string, returnValue: object): DynamoMock<typeof returnValue> {
  return {
    [methodName]: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue(returnValue),
    }),
  }
};

export function createDynamoMockError(methodName: string, error: Error): DynamoMock<{}> {
  return {
    [methodName]: jest.fn().mockReturnValue({
      promise: jest.fn().mockRejectedValue(error),
    }),
  }
};