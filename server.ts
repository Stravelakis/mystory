import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import fs from 'fs/promises';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import multer from 'multer';

dotenv.config();

const PORT = 3000;
const ENV_PATH = path.join(process.cwd(), '.env');

// Helper to load config safely
async function loadConfig() {
  const config: any = {};
  try {
    const data = await fs.readFile(ENV_PATH, 'utf-8');
    data.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let val = match[2] || '';
        val = val.trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1);
        }
        config[key] = val;
      }
    });
  } catch (e) {
    // Ignore if file doesn't exist
  }
  
  const merged = { ...config };
  for (const [key, value] of Object.entries(process.env)) {
    if (value) {
      merged[key] = value;
    }
  }
  return merged;
}

async function saveConfig(newConfig: any) {
  const current = await loadConfig();
  const merged = { ...current, ...newConfig };
  let envContent = '';
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && typeof value === 'string') {
       envContent += `${key}="${value.replace(/"/g, '\\"')}"\n`;
    }
  }
  await fs.writeFile(ENV_PATH, envContent);
}

// Fetch Google Drive / Docs content
async function fetchFileContent(accessToken: string, fileId: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'application/vnd.google-apps.document') {
      const res = await fetch(`https://docs.googleapis.com/v1/documents/${fileId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Docs API returned status ${res.status}: ${errorText}`);
      }
      const data = await res.json();
      
      let text = "";
      if (data.body && data.body.content) {
        for (const element of data.body.content) {
          if (element.paragraph && element.paragraph.elements) {
            for (const el of element.paragraph.elements) {
              if (el.textRun && el.textRun.content) {
                text += el.textRun.content;
              }
            }
          }
        }
      }
      return text;
    } else {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        throw new Error(`Drive alt=media response status ${res.status}`);
      }
      return await res.text();
    }
  } catch (e: any) {
    console.error(`Failed to fetch file content for ${fileId}:`, e);
    return `[Could not read file ${fileId}: ${e.message}]`;
  }
}

async function generateContentWithFallback(ai: GoogleGenAI, params: { model: string; contents: any; config?: any }): Promise<any> {
  const primaryModel = params.model;
  try {
    return await ai.models.generateContent(params);
  } catch (err: any) {
    console.warn(`Gemini call failed with model ${primaryModel}:`, err.message || err);
    if (primaryModel === 'gemini-3.5-flash') {
      console.info("Attempting fallback to 'gemini-2.5-flash'...");
      try {
        const fallbackParams = { ...params, model: 'gemini-2.5-flash' };
        return await ai.models.generateContent(fallbackParams);
      } catch (fallbackErr: any) {
        console.error("Fallback to 'gemini-2.5-flash' also failed:", fallbackErr.message || fallbackErr);
        throw err;
      }
    }
    throw err;
  }
}

async function generateGemma4Content(ai: GoogleGenAI, contents: any, config?: any): Promise<any> {
  const modelCandidates = ['gemma-4-26b-it', 'gemma-4-26b', 'gemma-4-31b-it', 'gemma-4-31b'];
  let lastError: any = null;
  for (const model of modelCandidates) {
    try {
      console.info(`Attempting Gemma 4 call with model ${model}...`);
      return await ai.models.generateContent({
        model,
        contents,
        config: config?.config || config
      });
    } catch (err: any) {
      console.warn(`Gemma 4 call failed for ${model}:`, err.message || err);
      lastError = err;
    }
  }
  console.warn("All Gemma 4 candidate models failed, falling back to gemini-2.5-flash...");
  try {
    return await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: config?.config || config
    });
  } catch (err: any) {
    console.error("Gemini 2.5 Flash fallback also failed:", err.message || err);
    throw lastError || err;
  }
}

async function analyzeTagsWithFallback(config: any, prompt: string): Promise<string> {
  // 1. Mistral API mistral-small-2506 / mistral-small-latest
  if (config.MISTRAL_API_KEY) {
    const mistralModels = ["mistral-small-2506", "mistral-small-latest"];
    for (const model of mistralModels) {
      try {
        console.info(`[Auto-Routing Tag Analysis] Trying Mistral with ${model}...`);
        const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.MISTRAL_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            response_format: { type: "json_object" }
          })
        });
        if (resp.status === 200) {
          const data: any = await resp.json();
          if (data.choices && data.choices[0] && data.choices[0].message?.content) {
            console.info(`[Auto-Routing Tag Analysis] Success with Mistral ${model}`);
            return data.choices[0].message.content;
          }
        } else {
          console.warn(`[Auto-Routing Tag Analysis] Mistral ${model} returned status ${resp.status}`);
        }
      } catch (err: any) {
        console.warn(`[Auto-Routing Tag Analysis] Mistral ${model} failed:`, err.message || err);
      }
    }
  }

  // 2. Groq API llama-3.1-8b-instant
  if (config.GROQ_API_KEY) {
    try {
      console.info(`[Auto-Routing Tag Analysis] Trying Groq with llama-3.1-8b-instant...`);
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      });
      if (resp.status === 200) {
        const data: any = await resp.json();
        if (data.choices && data.choices[0] && data.choices[0].message?.content) {
          console.info(`[Auto-Routing Tag Analysis] Success with Groq llama-3.1-8b-instant`);
          return data.choices[0].message.content;
        }
      } else {
        console.warn(`[Auto-Routing Tag Analysis] Groq llama-3.1-8b-instant returned status ${resp.status}`);
      }
    } catch (err: any) {
      console.warn(`[Auto-Routing Tag Analysis] Groq llama-3.1-8b-instant failed:`, err.message || err);
    }
  }

  // 3. Mistral API ministral-14b-2512 / ministral-14b-latest
  if (config.MISTRAL_API_KEY) {
    const ministralModels = ["ministral-14b-2512", "ministral-14b-latest"];
    for (const model of ministralModels) {
      try {
        console.info(`[Auto-Routing Tag Analysis] Trying Mistral with ${model}...`);
        const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.MISTRAL_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1
          })
        });
        if (resp.status === 200) {
          const data: any = await resp.json();
          if (data.choices && data.choices[0] && data.choices[0].message?.content) {
            console.info(`[Auto-Routing Tag Analysis] Success with Mistral ${model}`);
            return data.choices[0].message.content;
          }
        } else {
          console.warn(`[Auto-Routing Tag Analysis] Mistral ${model} returned status ${resp.status}`);
        }
      } catch (err: any) {
        console.warn(`[Auto-Routing Tag Analysis] Mistral ${model} failed:`, err.message || err);
      }
    }
  }

  // 4. Google Gemini Gemma 4 (gemma-4-31b-it / gemma-4-26b-it)
  const geminiApiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      console.info(`[Auto-Routing Tag Analysis] Trying Google Gemini Gemma 4...`);
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await generateGemma4Content(ai, prompt, {
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      if (response && response.text) {
        console.info(`[Auto-Routing Tag Analysis] Success with Gemini Gemma 4`);
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Auto-Routing Tag Analysis] Gemini Gemma 4 failed:`, err.message || err);
    }

    // 5. Google Gemini API Flash fallback (gemini-2.5-flash / gemini-3.5-flash)
    const fallbackModels = ["gemini-2.5-flash", "gemini-3.5-flash"];
    for (const model of fallbackModels) {
      try {
        console.info(`[Auto-Routing Tag Analysis] Trying Gemini with fallback ${model}...`);
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        });
        if (response && response.text) {
          console.info(`[Auto-Routing Tag Analysis] Success with Gemini fallback ${model}`);
          return response.text;
        }
      } catch (err: any) {
        console.warn(`[Auto-Routing Tag Analysis] Gemini fallback ${model} failed:`, err.message || err);
      }
    }
  }

  throw new Error("All auto-routed models for Tag Analysis failed or were not configured.");
}

async function generateGuidanceWithFallback(config: any, prompt: string, temperature: number = 0.7): Promise<string> {
  const geminiApiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  // 1. Gemini Gemma 4 (gemma-4-31b-it or gemma-4-26b-it)
  if (geminiApiKey) {
    try {
      console.info(`[Auto-Routing Guidance] Trying Gemini Gemma 4...`);
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await generateGemma4Content(ai, prompt, {
        config: { temperature }
      });
      if (response && response.text) {
        console.info(`[Auto-Routing Guidance] Success with Gemini Gemma 4`);
        return response.text;
      }
    } catch (err: any) {
      console.warn(`[Auto-Routing Guidance] Gemini Gemma 4 failed:`, err.message || err);
    }

    // 2. Gemini 3.1 Flash Lite / Gemini 2.5 Flash / Gemini 1.5 Flash
    const geminiModels = ["gemini-2.5-flash", "gemini-1.5-flash"];
    for (const model of geminiModels) {
      try {
        console.info(`[Auto-Routing Guidance] Trying Gemini with model ${model}...`);
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: { temperature }
        });
        if (response && response.text) {
          console.info(`[Auto-Routing Guidance] Success with Gemini ${model}`);
          return response.text;
        }
      } catch (err: any) {
        console.warn(`[Auto-Routing Guidance] Gemini model ${model} failed:`, err.message || err);
      }
    }
  }

  // 3. Groq API models
  if (config.GROQ_API_KEY) {
    const groqModels = [
      "llama-3.3-70b-versatile",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "openai/gpt-oss-20b",
      "qwen/qwen3-32b"
    ];
    for (const model of groqModels) {
      try {
        console.info(`[Auto-Routing Guidance] Trying Groq with model ${model}...`);
        const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.GROQ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: temperature
          })
        });
        if (resp.status === 200) {
          const data: any = await resp.json();
          if (data.choices && data.choices[0] && data.choices[0].message?.content) {
            console.info(`[Auto-Routing Guidance] Success with Groq ${model}`);
            return data.choices[0].message.content;
          }
        } else {
          console.warn(`[Auto-Routing Guidance] Groq ${model} returned status ${resp.status}`);
        }
      } catch (err: any) {
        console.warn(`[Auto-Routing Guidance] Groq ${model} failed:`, err.message || err);
      }
    }
  }

  // 4. Cerebras API gemma-4-31b
  if (config.CEREBRAS_API_KEY) {
    try {
      console.info(`[Auto-Routing Guidance] Trying Cerebras with gemma-4-31b...`);
      const resp = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.CEREBRAS_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gemma-4-31b",
          messages: [{ role: "user", content: prompt }],
          temperature: temperature
        })
      });
      if (resp.status === 200) {
        const data: any = await resp.json();
        if (data.choices && data.choices[0] && data.choices[0].message?.content) {
          console.info(`[Auto-Routing Guidance] Success with Cerebras gemma-4-31b`);
          return data.choices[0].message.content;
        }
      } else {
        console.warn(`[Auto-Routing Guidance] Cerebras gemma-4-31b returned status ${resp.status}`);
      }
    } catch (err: any) {
      console.warn(`[Auto-Routing Guidance] Cerebras gemma-4-31b failed:`, err.message || err);
    }
  }

  throw new Error("All auto-routed models for Generative Guidance failed or were not configured.");
}

async function transcribeAudioWithFallback(config: any, fileBuffer: Buffer, mimetype: string): Promise<string> {
  // 1. Groq Whisper Large V3 / V3 Turbo
  if (config.GROQ_API_KEY) {
    const whisperModels = ["whisper-large-v3", "whisper-large-v3-turbo"];
    for (const model of whisperModels) {
      try {
        console.info(`[Auto-Routing Transcription] Trying Groq Whisper with model ${model}...`);
        
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: mimetype || 'audio/webm' });
        formData.append('file', blob, 'recording.webm');
        formData.append('model', model);
        formData.append('prompt', 'This is a personal memory narrative journal recording, often spoken in English or Greek, or a mix of both. Please transcribe it accurately.');

        const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.GROQ_API_KEY}`
          },
          body: formData
        });

        if (resp.status === 200) {
          const data: any = await resp.json();
          if (data && data.text) {
            console.info(`[Auto-Routing Transcription] Success with Groq Whisper ${model}`);
            return data.text.trim();
          }
        } else {
          const errorMsg = await resp.text();
          console.warn(`[Auto-Routing Transcription] Groq Whisper ${model} returned status ${resp.status}: ${errorMsg}`);
        }
      } catch (err: any) {
        console.warn(`[Auto-Routing Transcription] Groq Whisper ${model} failed:`, err.message || err);
      }
    }
  }

  // 2. Gemini Native Audio
  const geminiApiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    try {
      console.info(`[Auto-Routing Transcription] Trying Gemini Native Audio with gemini-2.5-flash...`);
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const audioBase64 = fileBuffer.toString('base64');
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: mimetype || 'audio/webm',
              data: audioBase64
            }
          },
          "Transcribe this speech accurately in its original language (English or Greek) and return only the transcript text. Do not add any preamble, conversational commentary, formatting, or notes. Return only the transcript."
        ]
      });
      
      if (response && response.text) {
        console.info(`[Auto-Routing Transcription] Success with Gemini Native Audio`);
        return response.text.trim();
      }
    } catch (err: any) {
      console.warn(`[Auto-Routing Transcription] Gemini Native Audio failed:`, err.message || err);
    }
  }

  throw new Error("All auto-routed models for Audio Transcription failed or were not configured.");
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws/journal') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });
  
  app.use(express.json());

  const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

  app.post('/api/journal/transcribe-audio', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file uploaded." });
      }
      
      const config = await loadConfig();
      const transcript = await transcribeAudioWithFallback(config, req.file.buffer, req.file.mimetype || 'audio/webm');
      res.json({ success: true, transcript });
    } catch (err: any) {
      console.error("Transcription Error:", err);
      res.status(500).json({ error: err.message || err.toString() });
    }
  });

  app.post('/api/journal/analyze-tags', async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || transcript.trim().length < 10) {
        return res.json({ tags: [] });
      }

      const config = await loadConfig();
      const prompt = `Analyze this personal narrative transcript and identify the presence of psychological abuse patterns or trauma-informed therapy concepts mentioned or depicted in the text.
Select only relevant terms from this list of therapy-speak words: "gaslighting", "DARVO", "gray rock", "fawn", "hoovering", "flying monkeys", "projection", "minimization", "isolation", "triangulation", "boundaries", "trauma bonding", "emotional blackmail".

Return ONLY a JSON array of strings containing the identified terms in lowercase. Do not include any formatting, code blocks, or additional text.
Transcript:
"${transcript}"`;

      let responseText = "";
      try {
        responseText = await analyzeTagsWithFallback(config, prompt);
      } catch (err: any) {
        console.warn("Auto-routing Tag Analysis failed:", err.message || err);
      }

      let tags: string[] = [];
      if (responseText) {
        try {
          let cleanText = responseText.trim();
          if (cleanText.startsWith("```json")) {
            cleanText = cleanText.substring(7);
          }
          if (cleanText.endsWith("```")) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
          }
          cleanText = cleanText.trim();

          const parsed = JSON.parse(cleanText);
          if (Array.isArray(parsed)) {
            tags = parsed;
          } else if (parsed && Array.isArray(parsed.tags)) {
            tags = parsed.tags;
          } else if (parsed && typeof parsed === 'object') {
            tags = Object.values(parsed).filter(val => typeof val === 'string') as string[];
          }
        } catch (e) {
          const matched = responseText.match(/"([^"]+)"/g);
          if (matched) {
            tags = matched.map(m => m.replace(/"/g, ''));
          }
        }
      }

      const approvedWords = ["gaslighting", "darvo", "gray rock", "fawn", "hoovering", "flying monkeys", "projection", "minimization", "isolation", "triangulation", "boundaries", "trauma bonding", "emotional blackmail"];
      
      let filteredTags = tags
        .map(t => t.toLowerCase().trim())
        .filter(t => approvedWords.includes(t));

      filteredTags = filteredTags.map(t => t.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      res.json({ tags: filteredTags });
    } catch (e) {
      console.error("Analyze Tags Error:", e);
      res.json({ tags: [] });
    }
  });

  app.get('/api/config', async (req, res) => {
    const config = await loadConfig();
    const safeConfig = { ...config };
    // Make sure we include process.env overrides
    safeConfig.GEMINI_API_KEY = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    safeConfig.NVIDIA_API_KEY = config.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY || '';
    safeConfig.MISTRAL_API_KEY = config.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY || '';
    safeConfig.GROQ_API_KEY = config.GROQ_API_KEY || process.env.GROQ_API_KEY || '';
    safeConfig.CEREBRAS_API_KEY = config.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY || '';
    safeConfig.GOOGLE_CLIENT_ID = config.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
    safeConfig.GOOGLE_CLIENT_SECRET = config.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

    // mask secrets for UI
    if (safeConfig.GEMINI_API_KEY && safeConfig.GEMINI_API_KEY.length > 4) safeConfig.GEMINI_API_KEY = '***' + safeConfig.GEMINI_API_KEY.slice(-4);
    if (safeConfig.MISTRAL_API_KEY && safeConfig.MISTRAL_API_KEY.length > 4) safeConfig.MISTRAL_API_KEY = '***' + safeConfig.MISTRAL_API_KEY.slice(-4);
    if (safeConfig.NVIDIA_API_KEY && safeConfig.NVIDIA_API_KEY.length > 4) safeConfig.NVIDIA_API_KEY = '***' + safeConfig.NVIDIA_API_KEY.slice(-4);
    if (safeConfig.GROQ_API_KEY && safeConfig.GROQ_API_KEY.length > 4) safeConfig.GROQ_API_KEY = '***' + safeConfig.GROQ_API_KEY.slice(-4);
    if (safeConfig.CEREBRAS_API_KEY && safeConfig.CEREBRAS_API_KEY.length > 4) safeConfig.CEREBRAS_API_KEY = '***' + safeConfig.CEREBRAS_API_KEY.slice(-4);
    if (safeConfig.GOOGLE_CLIENT_SECRET && safeConfig.GOOGLE_CLIENT_SECRET.length > 4) safeConfig.GOOGLE_CLIENT_SECRET = '***' + safeConfig.GOOGLE_CLIENT_SECRET.slice(-4);
    res.json(safeConfig);
  });

  app.post('/api/config', async (req, res) => {
    const newConfig = req.body;
    const currentConfig = await loadConfig();
    const toSave: any = {};
    for (const key in newConfig) {
      if (typeof newConfig[key] === 'string' && newConfig[key].startsWith('***')) {
        toSave[key] = currentConfig[key] || '';
      } else {
        toSave[key] = newConfig[key];
      }
    }
    await saveConfig(toSave);
    res.json({ success: true });
  });

  // Google OAuth Endpoints
  app.get('/api/auth/google-url', async (req, res) => {
    try {
      const config = await loadConfig();
      const clientId = config.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      if (!clientId) {
        return res.status(400).json({ error: 'Google Client ID is not configured. Please add it in Settings.' });
      }

      // Handle the preview URL and local URL dynamically
      const origin = req.headers.referer ? new URL(req.headers.referer).origin : `${req.protocol}://${req.get('host')}`;
      const redirectUri = `${origin}/auth/callback`;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/userinfo.email',
        access_type: 'offline',
        prompt: 'consent'
      });

      res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.send(`<html><body><script>window.close();</script><p>No authorization code received.</p></body></html>`);
      }

      const config = await loadConfig();
      const clientId = config.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = config.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Google Client ID or Client Secret is missing in config.');
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code.toString(),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        })
      });

      const tokens = await tokenRes.json();
      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      let userEmail = 'Google User';
      if (tokens.access_token) {
        try {
          const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
          });
          const info = await infoRes.json();
          if (info.email) {
            userEmail = info.email;
          }
        } catch (e) {}
      }

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  accessToken: ${JSON.stringify(tokens.access_token)}, 
                  refreshToken: ${JSON.stringify(tokens.refresh_token)},
                  email: ${JSON.stringify(userEmail)}
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. You can close this window now.</p>
          </body>
        </html>
      `);
    } catch (e: any) {
      console.error("Callback Error:", e);
      res.status(500).send(`<html><body><p>Authentication failed: ${e.message}</p></body></html>`);
    }
  });

  // Google Drive/Docs Operations
  app.get('/api/drive/list-files', async (req, res) => {
    try {
      const accessToken = req.headers.authorization?.split(' ')[1];
      if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized. Please link your Google Account.' });
      }

      const driveRes = await fetch("https://www.googleapis.com/drive/v3/files?q=trashed=false and (mimeType='application/vnd.google-apps.document' or name contains 'My Story' or name contains 'Reflections' or mimeType='text/markdown')&orderBy=createdTime desc&fields=files(id,name,mimeType,createdTime)", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const data = await driveRes.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      res.json({ success: true, files: data.files || [] });
    } catch (e: any) {
      console.error("List Files Error:", e);
      res.status(500).json({ error: e.message || e.toString() });
    }
  });

  app.post('/api/drive/create-doc', async (req, res) => {
    try {
      const { accessToken, title, content } = req.body;
      if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized. Please link your Google Account.' });
      }

      const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });

      const docData = await createRes.json();
      if (docData.error) {
        throw new Error(docData.error.message || JSON.stringify(docData.error));
      }

      const documentId = docData.documentId;

      const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content
              }
            }
          ]
        })
      });

      const updateData = await updateRes.json();
      if (updateData.error) {
        throw new Error(updateData.error.message || JSON.stringify(updateData.error));
      }

      const viewUrl = `https://docs.google.com/document/d/${documentId}/edit`;
      res.json({ success: true, documentId, viewUrl });
    } catch (e: any) {
      console.error("Create Doc Error:", e);
      res.status(500).json({ error: e.message || e.toString() });
    }
  });

  app.post('/api/drive/upload-file', async (req, res) => {
    try {
      const { accessToken, filename, content, mimeType } = req.body;
      if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized. Please link your Google Account.' });
      }

      const metadata = {
        name: filename,
        mimeType: mimeType || 'text/markdown'
      };

      const boundary = 'foo_bar_boundary';
      const multipartBody = 
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${mimeType || 'text/markdown'}\r\n\r\n` +
        `${content}\r\n` +
        `--${boundary}--`;

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });

      const uploadData = await uploadRes.json();
      if (uploadData.error) {
        throw new Error(uploadData.error.message || JSON.stringify(uploadData.error));
      }

      const fileId = uploadData.id;
      const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
      res.json({ success: true, fileId, viewUrl });
    } catch (e: any) {
      console.error("Upload File Error:", e);
      res.status(500).json({ error: e.message || e.toString() });
    }
  });

  app.post('/api/journal/autotitle', async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || transcript.trim().length < 5) {
        return res.json({ title: "Untitled Memory" });
      }
      
      const config = await loadConfig();
      const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Fallback to title substring if Gemini is not set up yet
        const title = "Reflections on " + transcript.split(' ').slice(0, 3).join(' ') + "...";
        return res.json({ title });
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the following journal entry transcript, generate a concise, elegant, and evocative title of 2 to 5 words. Do not use quotes, punctuation, or generic filler. 
Transcript:
"${transcript}"`,
        config: { temperature: 0.3 }
      });
      
      const title = response.text?.trim() || "Untitled Memory";
      res.json({ title });
    } catch (e: any) {
      console.error(e);
      res.json({ title: "Untitled Memory" });
    }
  });

  app.post('/api/synthesize', async (req, res) => {
    const { files, model, prompt, accessToken } = req.body;
    const config = await loadConfig();

    try {
      let filesContent = "";
      
      if (files && files.length > 0 && accessToken) {
        const contents = await Promise.all(files.map(async (f: any) => {
          const contentText = await fetchFileContent(accessToken, f.id, f.mimeType);
          return `--- FILE: ${f.name} ---\n${contentText}\n`;
        }));
        filesContent = contents.join("\n");
      } else {
        filesContent = "No external files selected or no Google Account linked. Using template entries.";
      }

      let output = "";
      const contentPrompt = `${prompt}\n\nSelected Source Materials Content:\n${filesContent}`;

      if (model.startsWith('nvidia') || model.startsWith('openai') || model.startsWith('qwen')) {
        const apiKey = config.NVIDIA_API_KEY;
        if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured in Settings.");
        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: contentPrompt }],
            temperature: 0.01,
            max_tokens: 3000
          })
        });
        const data: any = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        output = data.choices[0].message.content;
      } else if (model === 'llama-3.3-70b-versatile' || 
                 model === 'meta-llama/llama-4-scout-17b-16e-instruct' || 
                 model === 'openai/gpt-oss-20b' || 
                 model === 'qwen/qwen3-32b') {
        const apiKey = config.GROQ_API_KEY;
        if (!apiKey) throw new Error("GROQ_API_KEY is not configured in Settings.");
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: contentPrompt }],
            temperature: 0.01
          })
        });
        const data: any = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        output = data.choices[0].message.content;
      } else if (model === 'cerebras/gemma-4-31b') {
        const apiKey = config.CEREBRAS_API_KEY;
        if (!apiKey) throw new Error("CEREBRAS_API_KEY is not configured in Settings.");
        const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gemma-4-31b",
            messages: [{ role: "user", content: contentPrompt }],
            temperature: 0.01
          })
        });
        const data: any = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        output = data.choices[0].message.content;
      } else if (model.startsWith('mistral') || model.startsWith('magistral')) {
        const apiKey = config.MISTRAL_API_KEY;
        if (!apiKey) throw new Error("MISTRAL_API_KEY is not configured in Settings.");
        const actualModel = model.replace('magistral', 'mistral');
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: actualModel,
            messages: [{ role: "user", content: contentPrompt }],
            temperature: 0.01
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        output = data.choices[0].message.content;
      } else { // gemini / gemma
        const apiKey = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("GEMINI_API_KEY is not configured in Settings.");
        const ai = new GoogleGenAI({ apiKey });
        
        if (model === 'gemma-4-31b') {
          const response = await generateGemma4Content(ai, contentPrompt, {
            config: { temperature: 0.01 }
          });
          output = response.text || "";
        } else {
          const response = await generateContentWithFallback(ai, {
              model: model,
              contents: contentPrompt,
              config: { temperature: 0.01 }
          });
          output = response.text || "";
        }
      }

      res.json({ success: true, draft: output });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ success: false, error: e.message || e.toString() });
    }
  });

  wss.on('connection', (ws) => {
    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        
        if (data.type === 'speak_trigger_opinion') {
          const config = await loadConfig();
          const transcriptText = data.transcript || '';
          
          const prompt = `You are a supportive, validating, and empathetic companion listening to a journal writer. 
They have just shared these raw thoughts/memories:
"${transcriptText}"

Provide a warm, grounded, validating response in 1-3 sentences. Speak with sincerity and comfort. Do not be overly medical or clinical. Avoid fawning or using overly dramatic AI clichés.`;
          
          try {
            const responseText = await generateGuidanceWithFallback(config, prompt, 0.7);
            ws.send(JSON.stringify({ type: 'audio_response', text: responseText }));
          } catch (err: any) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'audio_response', text: `Failed to generate opinion: ${err.message}` }));
          }
        } else if (data.type === 'speak_trigger_more') {
          const config = await loadConfig();
          const transcriptText = data.transcript || '';
          
          const prompt = `You are a gentle, supportive, and compassionate journal assistant. 
The user is sharing their thoughts and memories, and would like a gentle prompt or question to help them elaborate on their narrative.
Current narrative:
"${transcriptText}"

Ask a gentle, open-ended question or request in 1-2 sentences that helps them explore deeper or continue their thoughts without feeling pressured. Keep it natural and warm.`;
          
          try {
            const responseText = await generateGuidanceWithFallback(config, prompt, 0.7);
            ws.send(JSON.stringify({ type: 'audio_response', text: responseText }));
          } catch (err: any) {
            console.error(err);
            ws.send(JSON.stringify({ type: 'audio_response', text: `Failed to generate prompt: ${err.message}` }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
