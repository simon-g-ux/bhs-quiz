exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action } = body;
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

    if (!CLAUDE_API_KEY) {
      throw new Error('API key not configured');
    }

    if (action === 'generate-all') {
      return await generateAll(CLAUDE_API_KEY, body.count || 3);
    } else if (action === 'check-all') {
      return await checkAll(CLAUDE_API_KEY, body.items);
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid action. Use "generate-all" or "check-all".' })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function generateAll(apiKey, count) {
  const systemPrompt = `You are a BHS (British Horse Society) Stage 1 exam question writer. You create clear, fair questions that test practical knowledge at Stage 1 level.

Rules:
- Generate exactly ${count} questions, each on a DIFFERENT topic
- Topics must be drawn from: Horse Health, Feeding & Watering, Tack & Equipment, Grooming, Horse Behaviour, Stable Management, Grassland Care, Riding Theory
- Create a MIX of question types: at least 1 multiple-choice and at least 1 open-ended. Vary the mix each time.
- Pitch at BHS Stage 1 level: foundational practical horsemanship

For MULTIPLE-CHOICE questions, use type "mc":
- Provide exactly 4 options
- Provide the correctIndex (0-based) of the right answer
- Provide a brief explanation (1 sentence)

For OPEN-ENDED questions, use type "open":
- Questions should require a short answer (1-3 sentences)
- Provide a concise expectedAnswer covering the key points

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text.
Key: "questions" (array of objects).

MC shape: { "type": "mc", "topic": string, "question": string, "options": [string, string, string, string], "correctIndex": number, "explanation": string }
Open shape: { "type": "open", "topic": string, "question": string, "expectedAnswer": string }`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Generate ${count} BHS Stage 1 questions on different topics. Mix multiple-choice and open-ended.` }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Claude API error');
  }

  let text = data.content[0].text.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed)
  };
}

async function checkAll(apiKey, items) {
  if (!items || items.length === 0) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: [] })
    };
  }

  const itemsList = items.map((item, i) =>
    `--- Question ${i + 1} ---\nQuestion: ${item.question}\nExpected answer: ${item.expectedAnswer}\nStudent's answer: ${item.userAnswer}`
  ).join('\n\n');

  const systemPrompt = `You are a warm, encouraging BHS Stage 1 exam coach. You evaluate student answers against expected answers.

Rules:
- "correct" means the student covered the key points, even if worded differently
- "partial" means the student got some but not all key points, or was vague
- "incorrect" means the student's answer missed the key points
- Keep feedback to ONE sentence
- Be warm and supportive. Avoid words like "wrong", "incorrect", or "missed". Instead say things like "the key thing to remember is...", "you're on the right track...", "nearly there...", "good thinking, and the full picture is..."
- Include the correct answer so the student can learn

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text. Key: "results" (array of objects with "verdict" (one of "correct", "partial", "incorrect"), "feedback" (string, one sentence max), "correctAnswer" (string) fields). The array must have one entry per question, in order.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Please evaluate these ${items.length} answers:\n\n${itemsList}` }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Claude API error');
  }

  let text = data.content[0].text.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed)
  };
}
