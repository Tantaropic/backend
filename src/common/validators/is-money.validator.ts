import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Money } from '../domain/value-objects/money.vo';

/**
 * Custom class-validator decorator that asserts a property is an instance of Money.
 * Used on service-layer DTOs where Money objects are passed programmatically.
 */
export function IsMoneyInstance(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMoneyInstance',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid Money instance`,
        ...validationOptions,
      },
      validator: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        validate(value: unknown, _args: ValidationArguments): boolean {
          return value instanceof Money;
        },
      },
    });
  };
}
