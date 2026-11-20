import dotenv from 'dotenv';
import { app } from './src/app.js';
import { prewarmAgentRuntime } from './src/controllers/ai.agent.controller.js';

dotenv.config();

const port = Number(process.env.PORT) || 3000;

app.listen(port, '0.0.0.0', () => {
  console.log(`GovtCompass server listening on http://0.0.0.0:${port}`);
  // Pre-warm schemes catalog and greeting voice clips in the background so greeting plays instantly
  setTimeout(() => {
    prewarmAgentRuntime().catch((err) => {
      console.warn('Background prewarm warning:', err?.message || err);
    });
  }, 500);
});
