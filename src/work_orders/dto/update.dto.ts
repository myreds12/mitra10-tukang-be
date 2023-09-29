import { PartialType } from "@nestjs/swagger";
import { CreateWorkOrderDto } from "./create.dto";

export class UpdateWorkOrderDto extends PartialType(CreateWorkOrderDto) { }