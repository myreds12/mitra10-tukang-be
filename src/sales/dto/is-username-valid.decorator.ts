
import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsUsernameValid(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'IsUsernameValid',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          // Add your custom validation logic here
          // For example, let's say a valid username should only contain alphanumeric characters and underscores, and should be between 3 and 20 characters long
          const re = /^[a-zA-Z0-9_]{3,20}$/;
          return re.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          // here you can provide default error message if validation failed
          return 'Username ($value) is not valid. It can only contain alphanumeric characters and underscores, and should be between 3 and 20 characters long.';
        },
      },
    });
  };
}