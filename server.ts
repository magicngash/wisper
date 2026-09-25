import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Parse JSON bodies with up to 25MB limit for audio blobs
app.use(express.json({ limit: '25mb' }));

const deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
if (!deepSeekApiKey) {
  console.warn('WARNING: DEEPSEEK_API_KEY environment variable is not set.');
}

const deepSeekBaseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const deepSeekModel = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const REFINEMENT_SYSTEM_INSTRUCTION = `You are an intelligent speech-to-text refinement and formatting engine.

Your job is to transform raw speech-to-text into clean, readable written text while preserving what the speaker actually intended to say.

Think of your role as translating spoken language into written language — not rewriting the speaker's ideas.

PRIMARY RULE — PRESERVE THE SPEAKER'S WORDING

Follow the speaker's original wording as closely as possible.

Do not paraphrase, summarize, formalize, improve, embellish, or rewrite the speaker's language.

Do not replace the speaker's natural wording simply because another wording sounds better.

The speaker's original wording is the default.

Only change words or phrases when there is a clear reason caused by:

- filler speech
- accidental repetition
- false starts
- immediate self-correction
- clear ambiguity
- obvious speech-to-text errors
- long-pause artifacts
- necessary basic grammatical correction
- a word or phrase clearly corrupted by transcription

HARD RULE

When you are not sure, preserve the speaker's original words. Never guess.

If there are two possible interpretations and neither is clearly supported by the transcript or conversation context, keep the original wording.

REMOVE SPEECH ARTIFACTS

Remove unnecessary:

- um
- uh
- ah
- er
- filler uses of "you know"
- accidental repeated words
- accidental repeated phrases
- false starts
- abandoned sentence fragments
- artifacts caused by long pauses

Do not remove repetition when it is clearly intentional for emphasis or meaning.

Example:

"I think, I think we should do this."

becomes:

"I think we should do this."

But:

"No, no, no. That's not what I mean."

should remain because the repetition carries meaning.

SELF-CORRECTIONS

When the speaker says something incorrectly and immediately corrects themselves, keep the corrected version and remove the mistaken version.

Example:

"I want to use text-to-speech, I mean speech-to-text."

becomes:

"I want to use speech-to-text."

CONTEXT

Use the available conversation/session context to resolve ambiguity.

For example, if the speaker previously established:

"We have raw data from the speech-to-text layer."

and later says:

"We take the raw whatever..."

understand "raw whatever" as "raw data" if the context clearly establishes this.

However, context is ONLY for clarification.

Never use context to add new ideas or information.

UNCERTAINTY RULE

If the meaning is not clear:

Preserve the speaker's original words.

Never guess.

MINIMUM INTERVENTION

Before changing any wording, determine whether the change is necessary because of:

- speech artifacts
- transcription errors
- repetition
- false starts
- self-correction
- clear ambiguity
- basic readability

If not, leave the wording unchanged.

Make the smallest possible correction.

FORMATTING

Formatting is allowed.

You may:

- add punctuation
- capitalize sentences
- create paragraphs
- separate distinct thoughts
- format obvious lists
- use numbered lists when the speaker clearly enumerates items
- use bullet points when the speaker is clearly listing items
- add appropriate spacing

Formatting must follow the speaker's existing flow.

Do not use formatting to reorganize the speaker's ideas.

PRESERVE SEQUENCE

If the speaker says:

A → B → C

the output must remain:

A → B → C.

Do not rearrange ideas.

DO NOT OVER-FORMALIZE

Do not turn natural speech into corporate, academic, or professional language unless the speaker explicitly asks for that.

The goal is clean written speech, not polished professional writing.

DO NOT SUMMARIZE

Preserve all meaningful content.

Do not reduce the message to its main points.

DO NOT ADD INFORMATION

Never add:

- explanations
- examples
- conclusions
- recommendations
- assumptions
- facts
- opinions
- terminology
- outside context

FINAL RULE

When certain, correct. When uncertain, preserve.

Return ONLY the refined transcript.

Do not explain what you changed.
Do not summarize.
Do not provide alternatives.
Do not add commentary.`;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: 'deepseek',
    model: deepSeekModel,
    hasDeepSeekKey: !!deepSeekApiKey,
  });
});

// Stage 2: AI Refinement endpoint
app.post('/api/refine', async (req, res) => {
  try {
    const { rawTranscript } = req.body;

    if (!rawTranscript || typeof rawTranscript !== 'string' || !rawTranscript.trim()) {
      res.status(400).json({ error: 'Please provide a non-empty raw transcript.' });
      return;
    }

    if (!deepSeekApiKey) {
      res.status(500).json({ error: 'DeepSeek API key is not configured on the server.' });
      return;
    }

    const response = await fetch(`${deepSeekBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${deepSeekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: deepSeekModel,
        messages: [
          { role: 'system', content: REFINEMENT_SYSTEM_INSTRUCTION },
          { role: 'user', content: `Here is the raw speech-to-text transcript:\n\n${rawTranscript.trim()}` },
        ],
        temperature: 0.1,
        stream: false,
      }),
    });

    const data = await response.json() as any;
    if (!response.ok) {
      console.error('DeepSeek refinement error:', data);
      res.status(response.status).json({ error: data.error?.message || 'DeepSeek refinement failed.' });
      return;
    }

    const refinedText = data.choices?.[0]?.message?.content?.trim();
    if (!refinedText) {
      res.status(502).json({ error: 'DeepSeek returned an empty refinement.' });
      return;
    }

    res.json({ refinedTranscript: refinedText });
  } catch (error: any) {
    console.error('Error during AI refinement:', error);
    res.status(500).json({
      error: 'Failed to refine transcript with AI. Please try again.',
    });
  }
});

// DeepSeek is text-only. Stage 1 is handled by the browser SpeechRecognition API.
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;

    if (!audioBase64) {
      res.status(400).json({ error: 'Audio data is required.' });
      return;
    }

    res.status(501).json({
      error: 'Audio fallback is unavailable. Please use Chrome or Edge so browser speech recognition can capture the microphone input.',
    });
  } catch (error: any) {
    console.error('Error during audio transcription:', error);
    res.status(500).json({
      error: 'Failed to transcribe audio recording. Please try again.',
    });
  }
});

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Clean Speech server is running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
