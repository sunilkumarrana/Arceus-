import express from "express";
import {
  aiAgentChatController,
  aiTranscribeController,
  aiSpeakController,
} from "../controllers/ai.agent.controller.js";

const router = express.Router();

router.post("/agent", aiAgentChatController);
router.post("/transcribe", aiTranscribeController);
router.post("/speak", aiSpeakController);

export default router;
