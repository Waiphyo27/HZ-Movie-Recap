const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CHAT_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHAT_MODEL = "llama-3.3-70b-versatile";

const TONE_PRESETS = {
  dramatic: "Lean into the emotional weight of the story — make the stakes feel real and moving, like a touching drama.",
  comedy: "Keep it light and funny — play up anything amusing or absurd, and react to it the way you would when telling a friend something hilarious.",
  romance: "Focus on the emotional/relationship angle — make it feel like recounting a touching love story, lingering on the feelings between people.",
  suspense: "Build tension as you go — make the listener anxious and curious about what happens next, holding back just enough to keep them hooked.",
  motivational: "Give it an inspiring, uplifting tone — emphasize triumph, effort, and the lesson or payoff by the end.",
  storyteller: "",
};

async function generateRecapScript(transcriptText, { style = "storyteller", apiKey = null } = {}) {
  const effectiveKey = apiKey || GROQ_API_KEY;
  if (!effectiveKey) {
    throw new Error("GROQ_API_KEY is not set. Add it to your .env file.");
  }

  if (!transcriptText || !transcriptText.trim()) {
    throw new Error("Transcript text is empty — nothing to summarize.");
  }

  const toneInstruction = TONE_PRESETS[style] || "";

  const systemPrompt = `Imagine you just watched this video and you're telling a close friend \
about it in person, casually, like you're catching them up over coffee. NOT reading a \
script, NOT narrating a documentary — just talking.

Rules:
- Hook the listener in the very first sentence — the opening line has to make them want to \
keep listening immediately, like a strong first line of a story.
- Talk the way people actually talk: use contractions (it's, they're, don't), casual \
connectors ("so basically...", "and then...", "turns out...", "get this—"), and a \
conversational rhythm — not polished written prose.
- RETELL the events in order, like you're recounting what happened, reacting to it a \
little as you go (the way you naturally would when telling a story out loud).
- When something important is SAID in the video, work it in naturally as part of the \
retelling (e.g. "and he's just like, 'I'm never doing this again'") instead of only \
describing actions.
${toneInstruction ? `- Tone: ${toneInstruction}\n` : ""}- Avoid graphic or harsh words (like blood, kill, die) — soften those moments with gentler \
phrasing while keeping the story's impact.
- Aim for roughly 50-60% of the original transcript's length — enough to cover the full \
story, not just a teaser.
- Avoid formal/literary vocabulary, avoid sounding like a movie trailer voice-over, avoid \
overly dramatic staccato one-liners. It should sound like ONE person talking naturally, \
sentence flowing into sentence.
- Do not include scene directions, timestamps, or speaker labels.
- Output ONLY the narration text, nothing else (no titles, no notes, no preamble).`;

  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${effectiveKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcriptText },
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq chat API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  const scriptText = result.choices?.[0]?.message?.content?.trim();

  if (!scriptText) {
    throw new Error("Groq API returned an empty script.");
  }

  return { scriptText };
}

module.exports = { generateRecapScript, TONE_PRESETS };