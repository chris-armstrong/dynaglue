export type DynamoMock<T> = {
  [key: string]: jest.Mock<{ promise: jest.Mock<Promise<T>> }>;
};

export function createDynamoMock(methodName: string, returnValue: object): DynamoMock<typeof returnValue> {
  return {
    [methodName]: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue(returnValue),
    }),
  }
};