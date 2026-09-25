const REFINEMENT_SYSTEM_INSTRUCTION = `You are an intelligent speech-to-text refinement and formatting engine.

Transform raw speech-to-text into clean, readable written text while preserving what the speaker actually intended to say.

Follow the speaker's original wording as closely as possible. Do not paraphrase, summarize, formalize, improve, embellish, or rewrite the speaker's language.

Only change words or phrases when clearly caused by filler speech, accidental repetition, false starts, immediate self-correction, clear ambiguity, obvious transcription errors, long-pause artifacts, or necessary basic grammatical correction.

Remove unnecessary um, uh, ah, er, filler uses of you know, accidental repeated words, accidental repeated phrases, false starts, abandoned fragments, and long-pause artifacts. Keep repetition when it carries meaning or emphasis.

Formatting is allowed: punctuation, capitalization, paragraphs, and obvious lists. Preserve the speaker's sequence. Do not summarize, add information, or provide commentary.

Return ONLY the refined transcript.`;

export default async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const rawTranscript = typeof body?.rawTranscript === 'string'
    ? body.rawTranscript.trim()
    : '';

  if (!rawTranscript) {
    return json({ error: 'Please provide a non-empty raw transcript.' }, 400);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: 'DeepSeek API key is not configured on Netlify.' }, 500);
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: REFINEMENT_SYSTEM_INSTRUCTION },
          { role: 'user', content: `Here is the raw speech-to-text transcript:\n\n${rawTranscript}` },
        ],
        temperature: 0.1,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      return json({ error: data?.error?.message || 'DeepSeek refinement failed.' }, response.status);
    }

    const refinedTranscript = data?.choices?.[0]?.message?.content?.trim();
    if (!refinedTranscript) {
      return json({ error: 'DeepSeek returned an empty refinement.' }, 502);
    }

    return json({ refinedTranscript }, 200);
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'DeepSeek refinement timed out.'
      : 'Failed to connect to DeepSeek.';
    return json({ error: message }, 502);
  } finally {
    clearTimeout(timeout);
  }
};

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
