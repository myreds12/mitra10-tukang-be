import { PartialType } from "@nestjs/swagger";
import { CreateRescheduleDto } from "./create-reschedule.dto";

export class UpdateRescheduleDto extends PartialType(CreateRescheduleDto) {}
