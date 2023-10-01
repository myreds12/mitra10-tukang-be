import { ApiProperty } from "@nestjs/swagger";

export class CreateComplaintEvidenceDto {
    @ApiProperty()
    complaint_id: number
}
