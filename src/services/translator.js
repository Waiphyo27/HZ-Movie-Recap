const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

function buildSystemPrompt(targetLanguage) {
  return `You are localizing a short piece of a casual, conversational video narration \
into ${targetLanguage}. The English source is written the way a person talks when \
telling a friend a story out loud — keep that exact same casual, SPOKEN feel in \
${targetLanguage}.

CRITICAL RULES:
- Use the everyday CASUAL SPOKEN register of ${targetLanguage} — the way someone would \
actually talk to a friend in person — NOT the formal written/literary register used in \
books, news, or official writing. If ${targetLanguage} is Burmese, this means using \
colloquial spoken particles and phrasing (ပြောစကားဟန်), not literary written Burmese \
(စာပေဟန်/ရေးစကားဟန်).
- Do NOT translate word-for-word. Rephrase entirely so the sentences make complete sense \
and flow naturally, the way a native speaker would actually say this — coherent and easy \
to follow, not a disjointed string of phrases.
- NEVER repeat the same phrase, sentence, or sentence structure more than once. Every \
sentence must be grammatically complete and add genuinely new information — do not pad \
with filler phrases like "how amazing" or "I wonder how" repeated over and over.
- Write ENTIRELY in ${targetLanguage} — do not mix in words or phrases from other \
languages (including English) unless there is genuinely no equivalent word.
- Spell out any numbers as words in ${targetLanguage} rather than using digits.
- Keep proper nouns (names, places) as-is unless there's a well-known localized form.
- Output ONLY the translated text — no notes, no explanations, no original text, no \
romanization, no formal register.`;
}

async function callGroq(text, targetLanguage, apiKey) {
  const key = apiKey || GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set in .env");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: buildSystemPrompt(targetLanguage) },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim();
}

async function callOpenAI(text, targetLanguage, apiKey) {
  const key = apiKey || OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set in .env");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: buildSystemPrompt(targetLanguage) },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim();
}

async function callGemini(text, targetLanguage, apiKey) {
  const key = apiKey || GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

  const response = await fetch(`${url}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(targetLanguage) }] },
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function callOpenRouter(text, targetLanguage, apiKey) {
  const key = apiKey || OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set in .env");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        { role: "system", content: buildSystemPrompt(targetLanguage) },
        { role: "user", content: text },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim();
}

const PROVIDERS = { groq: callGroq, openai: callOpenAI, gemini: callGemini, openrouter: callOpenRouter };

function splitIntoChunks(text) {
  let paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    paragraphs = [];
    for (let i = 0; i < sentences.length; i += 6) {
      paragraphs.push(sentences.slice(i, i + 6).join(" "));
    }
  }

  return paragraphs.length > 0 ? paragraphs : [text];
}

async function translateScript(scriptText, targetLanguage, provider = "groq", apiKey = null) {
  if (!scriptText || !scriptText.trim()) {
    throw new Error("Script text is empty — nothing to translate.");
  }
  if (!targetLanguage || !targetLanguage.trim()) {
    throw new Error("targetLanguage is required, e.g. 'Myanmar (Burmese)', 'English', 'Chinese'.");
  }

  const translateFn = PROVIDERS[provider];
  if (!translateFn) {
    throw new Error(`Unknown provider "${provider}". Use "groq", "openai", or "gemini".`);
  }

  const chunks = splitIntoChunks(scriptText);

  const CONCURRENCY = provider === "openrouter" ? 2 : 3;
  const results = new Array(chunks.length);
  let nextIndex = 0;

  async function translateWithRetry(chunk, attempt = 1) {
    try {
      return await translateFn(chunk, targetLanguage, apiKey);
    } catch (err) {
      const is429 = err.message && err.message.includes("429");
      if (is429 && attempt < 4) {
        const match = err.message.match(/try again in ([\d.]+)s/i);
        const waitSeconds = match ? parseFloat(match[1]) + 0.5 : 3;
        await new Promise((r) => setTimeout(r, waitSeconds * 1000));
        return translateWithRetry(chunk, attempt + 1);
      }
      throw err;
    }
  }

  async function worker() {
    while (nextIndex < chunks.length) {
      const i = nextIndex++;
      results[i] = await translateWithRetry(chunks[i]);
    }
  }

  const workerCount = Math.min(CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  const translatedChunks = results.filter(Boolean);
  const translatedText = translatedChunks.join("\n\n").trim();

  if (!translatedText) {
    throw new Error(`${provider} returned an empty translation.`);
  }

  return { translatedText, provider, chunkCount: chunks.length };
}

module.exports = { translateScript, PROVIDERS: Object.keys(PROVIDERS) };