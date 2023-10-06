import { ApiProperty } from "@nestjs/swagger";

export class CreateComplaintChannelDto {
    @ApiProperty()
    name: string;
}
