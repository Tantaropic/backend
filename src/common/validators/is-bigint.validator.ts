import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom class-validator decorator that asserts a property is a non-negative BigInt.
 * Used on service-layer DTOs for unit counts and price fields stored as bigint.
 */
export function IsBigInt(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBigInt',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a non-negative BigInt`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments): boolean {
          return typeof value === 'bigint' && value >= 0n;
        },
      },
    });
  };
}
