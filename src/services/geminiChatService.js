import { GoogleGenerativeAI } from '@google/generative-ai';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { buildUserDataContext } from './chatbotUserDataService.js';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

/** Keep prompts small */
const MAX_HISTORY_TURNS = 4;
const MAX_HISTORY_TEXT = 400;
const MAX_USER_MESSAGE = 800;
const MAX_OUTPUT_TOKENS = 350;

const buildSystemInstruction = (user) => {
  const role = user?.role || 'employee';
  const name = user?.name || 'User';
  return `You are Brilliance EMS Assistant for Brilliance Base.

User: ${name} | role: ${role}

Rules:
- Answer ONLY from the LIVE_USER_DATA block when personal facts are asked (salary, leave, attendance, loans, expenses, profile). Never invent numbers.
- Never reveal another person's private data. LIVE_USER_DATA is only this logged-in user.
- Keep replies short (max ~8 lines). Match user language (Urdu/English/Roman Urdu).
- For how-to app questions without LIVE_USER_DATA, give brief steps.
- If data is missing, say so and suggest the relevant app screen / HR.`;
};

const getClient = () => {
  if (!env.gemini.apiKey) {
    throw new ApiError(
      503,
      'Gemini API key not configured. Set GEMINI_API_KEY in .env'
    );
  }
  return new GoogleGenerativeAI(env.gemini.apiKey);
};

const modelCandidates = () => {
  const preferred = env.gemini.model || DEFAULT_MODEL;
  return [...new Set([preferred, ...FALLBACK_MODELS])];
};

const trimHistory = (history) => {
  const chatHistory = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY_TURNS)
    .filter((h) => h && h.text)
    .map((h) => {
      const role =
        h.role === 'model' || h.role === 'assistant' ? 'model' : 'user';
      return {
        role,
        parts: [{ text: String(h.text).slice(0, MAX_HISTORY_TEXT) }],
      };
    });

  while (chatHistory.length && chatHistory[0].role !== 'user') {
    chatHistory.shift();
  }
  return chatHistory;
};

/**
 * @param {object} opts
 * @param {object} opts.user
 * @param {string} opts.message
 * @param {Array} [opts.history]
 */
export const askGemini = async ({ user, message, history = [] }) => {
  const text = String(message || '').trim();
  if (!text) throw new ApiError(400, 'message is required');
  if (text.length > 4000) {
    throw new ApiError(400, 'message too long (max 4000 characters)');
  }

  const shortQuestion = text.slice(0, MAX_USER_MESSAGE);
  const { intents, contextText, meta } = await buildUserDataContext(
    user,
    shortQuestion
  );

  const userPayload = contextText
    ? `LIVE_USER_DATA (trusted DB snapshot for this user only):\n${contextText}\n\nQuestion: ${shortQuestion}`
    : `Question: ${shortQuestion}`;

  const genAI = getClient();
  const systemInstruction = buildSystemInstruction(user);
  const chatHistory = trimHistory(history);

  let lastError;
  for (const modelName of modelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
        },
      });
      const chat = model.startChat({ history: chatHistory });
      const result = await chat.sendMessage(userPayload);
      const reply = result.response.text()?.trim() || '';
      if (!reply) throw new Error('Empty response from Gemini');
      return {
        reply,
        model: modelName,
        role: user.role,
        dataIntents: intents,
        dataMeta: meta,
      };
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err);
      if (
        msg.includes('404') ||
        msg.includes('not found') ||
        msg.includes('no longer') ||
        msg.includes('503') ||
        msg.includes('overloaded') ||
        msg.includes('unavailable')
      ) {
        continue;
      }
      break;
    }
  }

  const detail = String(lastError?.message || lastError || 'Gemini request failed');
  if (detail.includes('API_KEY') || detail.includes('401') || detail.includes('403')) {
    throw new ApiError(502, 'Gemini API key rejected. Check GEMINI_API_KEY.');
  }
  throw new ApiError(502, `Gemini chatbot failed: ${detail.slice(0, 240)}`);
};

export default { askGemini };
