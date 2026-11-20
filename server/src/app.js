import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import { healthRouter } from './routes/health.routes.js';
import schemeRouter from "./routes/scheme.routes.js";
import recommendationRouter from "./routes/recommendation.routes.js";
import metaRouter from "./routes/meta.routes.js";
import { questionsRouter } from './routes/questions.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { analyzeRouter } from './routes/analyze.routes.js';

import aiIntakeRouter from "./routes/ai.intake.routes.js";
import aiExplainRouter from "./routes/ai.explain.routes.js";
import aiEligibilityRouter from "./routes/ai.eligibility.routes.js";
import aiRefineRouter from "./routes/ai.refine.routes.js";
import aiAgentRouter from "./routes/ai.agent.routes.js";

import { notFoundMiddleware } from './middleware/notFound.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { requireApiKey } from './middleware/apiKey.middleware.js';
import { requireAuth } from '../../src/middleware/auth.ts';
import { getUserProfileByUid } from '../../src/db/users.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const app = express();
app.set('trust proxy', 1);

// Disable CSP, COOP, CORP, and frameguard so the app and Google Sign-In popups work cleanly inside the preview iframe
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
  })
);

app.use(express.json({ limit: '10mb' }));

const corsOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://govt-c0mpass.vercel.app',
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin) || origin.endsWith('.run.app')) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use('/api', healthRouter);

// Secure all API routes below this line with an API Key
app.use('/api', requireApiKey);

// Onboarding questions & anonymous session routes
app.use('/api', questionsRouter);
app.use('/api', sessionRouter);

// Authenticated user profile endpoint (Cloud SQL PostgreSQL)
app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfileByUid(req.user.uid);
    res.status(200).json({
      success: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        name: req.user.name || null,
      },
      savedAnswers: profile?.answers || null,
    });
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch user profile',
    });
  }
});

// Database-backed routes secured by Firebase Authentication
app.use("/api/schemes", requireAuth, schemeRouter);
app.use("/api/recommendations", requireAuth, recommendationRouter);
app.use("/api/meta", requireAuth, metaRouter);
app.use('/api', (req, res, next) => {
  if (req.path === '/analyze') {
    return requireAuth(req, res, next);
  }
  return next();
}, analyzeRouter);

// Rate limiter for Gemini AI routes (mounted once across all /api/ai routers)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many AI requests from this IP, please try again after a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(
  "/api/ai",
  requireAuth,
  aiLimiter,
  aiIntakeRouter,
  aiExplainRouter,
  aiEligibilityRouter,
  aiRefineRouter,
  aiAgentRouter
);

// Serve built React SPA from client/dist
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'GovtCompass API is running',
      timestamp: new Date().toISOString(),
    });
  });
}

// Not found + global error handler
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
