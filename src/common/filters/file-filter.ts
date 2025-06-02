import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

export const fileFilter = (req, file, callback) => {
    const ext = extname(file.originalname).toLowerCase();

    if (ext === '.pdf') {
        // Tolak PDF
        return callback(
            new BadRequestException('File PDF tidak diperbolehkan untuk diupload.'),
            false,
        );
    }

    // Terima file selain PDF
    callback(null, true);
};
