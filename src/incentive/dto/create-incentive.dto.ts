import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidationArguments,
  Validate,
  ValidatorConstraintInterface,
  ValidatorConstraint,
  IsEnum,
} from 'class-validator';
import { IncentiveType } from './incentive-type.enum';

@ValidatorConstraint({ name: 'incentiveValidator', async: false })
class IncentiveValidator implements ValidatorConstraintInterface {
  validate(value: number, args: ValidationArguments) {
    const type = (args.object as any).type;

    if (type === 2 && value < 5000) return false;
    if (type === 1 && (value <= 0 || value >= 100)) return false;
    return true;
  }
  defaultMessage(args: ValidationArguments) {
    const type = (args.object as any).type;
    const value = (args.object as any).incentive;

    if (type === 2 && value < 5000)
      return 'The incentive should be bigger than 5000';
    if (type === 1 && (value <= 0 || value >= 100))
      return 'The incentive cannot be under 0 and bigger than 100';
  }
}

export class CreateIncentiveDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  min_order: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  max_order: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Validate(IncentiveValidator)
  incentive: number;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  min_invoice: number;

  @IsNotEmpty()
  is_manager: boolean;

  @IsNotEmpty()
  @IsEnum(IncentiveType)
  type: IncentiveType;

  @IsNotEmpty()
  stores: number[];
}
