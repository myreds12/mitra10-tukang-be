import { registerAs } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';

export default registerAs('SPREADSHEETS', () => {
  const filePath = './config/spreadsheets.json';

  if (!existsSync(filePath)) {
    console.warn(
      'The spreadsheets.json file does not exist. Spreadsheet integration is disabled.',
    );
    return {};
  }

  const file = readFileSync(filePath);
  const data = JSON.parse(file.toString());

  const upperKeyData = Object.keys(data).reduce((result, key) => {
    result[key.toUpperCase()] = data[key];
    return result;
  }, {});

  return upperKeyData;
});
