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
