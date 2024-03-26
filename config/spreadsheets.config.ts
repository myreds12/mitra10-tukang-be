import { registerAs } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';

export default registerAs('spreadsheets', () => {
  const filePath = './config/spreadsheets.json';

  if (!existsSync(filePath)) {
    console.error(
      'The spreadsheets.json file does not exist. Please create it before starting the application.',
    );
    process.exit(1);
  }

  const file = readFileSync(filePath);
  const data = JSON.parse(file.toString());

  return data;
});
