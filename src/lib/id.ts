let testIdGenerator: (() => string) | null = null;

export function setIdGeneratorForTests(generator: (() => string) | null): void {
  testIdGenerator = generator;
}

export function generateId(prefix?: string): string {
  const id = testIdGenerator
    ? testIdGenerator()
    : typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return prefix ? `${prefix}_${id}` : id;
}

