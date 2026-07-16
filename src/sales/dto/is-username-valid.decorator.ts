import { registerDecorator, ValidationOptions } from 'class-validator';

export function IsUsernameValid(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsUsernameValid',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: validationOptions,
      validator: {
        validate(value: any) {
          const re = /^[a-zA-Z0-9_]{3,20}$/;
          return re.test(value);
        },
        defaultMessage() {
          return 'Username ($value) is not valid. It can only contain alphanumeric characters and underscores, and should be between 3 and 20 characters long.';
        },
      },
    });
  };
}
