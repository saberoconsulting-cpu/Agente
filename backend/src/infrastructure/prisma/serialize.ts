const toSnake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export function toDatabaseShape<T>(value: T): T {
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toDatabaseShape) as T;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [toSnake(key), toDatabaseShape(item)])) as T;
}
