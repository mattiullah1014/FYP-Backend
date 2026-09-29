import asyncHandler from '../utils/asyncHandler.js';
import { success } from '../utils/apiResponse.js';
import { askGemini } from '../services/geminiChatService.js';

/**
 * POST /api/chatbot/ask
 * Body: { message: string, history?: [{ role: 'user'|'model', text: string }] }
 */
export const ask = asyncHandler(async (req, res) => {
  const { message, history } = req.body || {};
  const result = await askGemini({
    user: req.user,
    message,
    history,
  });

  return success(res, 200, 'Chatbot reply', {
    reply: result.reply,
    message: result.reply,
    model: result.model,
    role: result.role,
    dataIntents: result.dataIntents || [],
  });
});

/** GET /api/chatbot/health — quick config check (no Gemini call) */
export const health = asyncHandler(async (req, res) => {
  const configured = Boolean(process.env.GEMINI_API_KEY?.trim());
  return success(res, 200, 'Chatbot status', {
    configured,
    model: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
    user: {
      id: String(req.user._id),
      name: req.user.name,
      role: req.user.role,
    },
  });
});
