import dotenv from 'dotenv';
import { app } from './src/app.js';

dotenv.config();

const port = Number(process.env.PORT) || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`GovtCompass server listening on http://0.0.0.0:${port}`);
});

