import express from "express";
import {
  aiAgentChatController,
  aiTranscribeController,
  aiSpeakController,
  aiSpeakStreamController,
} from "../controllers/ai.agent.controller.js";

const router = express.Router();

router.post("/agent", aiAgentChatController);
router.post("/transcribe", aiTranscribeController);
router.post("/speak", aiSpeakController);
router.post("/speak-stream", aiSpeakStreamController);

export default router;
