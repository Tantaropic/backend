/**
 * The Branded Type utility
 */
export type StringifiedJSON<T> = string & { __parsedType?: T };

/**
 * Parse a stringified JSON to a typed object
 */
export function parseStringifiedJSON<T>(json: StringifiedJSON<T>): T {
  return JSON.parse(json) as T;
}

/**
 * Serializes data, converting BigInt to string to avoid JSON errors.
 * Returns undefined if no data is provided.
 */
export function serialize<T>(data?: T): StringifiedJSON<T> | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }

  const jsonString = JSON.stringify(data, (_, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  return jsonString;
}

export type ReplaceBigInts<T> = T extends bigint
  ? string
  : T extends Date
    ? Date
    : T extends Array<infer U>
      ? Array<ReplaceBigInts<U>>
      : T extends object
        ? { [K in keyof T]: ReplaceBigInts<T[K]> }
        : T;

export function replaceBigInts<T>(data: T): ReplaceBigInts<T> {
  // 1. Handle primitives, null, and undefined safely
  if (data === null || data === undefined || typeof data !== 'object') {
    if (typeof data === 'bigint') {
      // Cast through unknown to satisfy the generic return type
      return data.toString() as unknown as ReplaceBigInts<T>;
    }
    return data as unknown as ReplaceBigInts<T>;
  }

  // 2. Handle Dates (preserve them as actual Date objects)
  if (data instanceof Date) {
    return new Date(data.getTime()) as unknown as ReplaceBigInts<T>;
  }

  // 3. Handle Arrays safely
  if (Array.isArray(data)) {
    return data.map((item) =>
      replaceBigInts(item),
    ) as unknown as ReplaceBigInts<T>;
  }

  // 4. Handle plain objects strictly without using 'any'
  const result: Record<string, unknown> = {};

  // Safely cast the generic T to a dictionary of unknowns for iteration
  const objData = data as unknown as Record<string, unknown>;

  for (const key in objData) {
    if (Object.prototype.hasOwnProperty.call(objData, key)) {
      result[key] = replaceBigInts(objData[key]);
    }
  }

  return result as unknown as ReplaceBigInts<T>;
}
