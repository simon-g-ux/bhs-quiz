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
  const systemPrompt = `You are a BHS (British Horse Society) Stage 1 exam question writer. You create clear, fair, open-ended questions that test practical knowledge at Stage 1 level.

Rules:
- Generate exactly ${count} questions, each on a DIFFERENT topic
- Topics must be drawn from: Horse Health, Feeding & Watering, Tack & Equipment, Grooming, Horse Behaviour, Stable Management, Grassland Care, Riding Theory
- Questions should require a short answer (1-3 sentences), not an essay
- Pitch at BHS Stage 1 level: foundational practical horsemanship
- Provide a concise expected answer that covers the key points an examiner would look for
- Do NOT ask multiple-choice questions

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text. Key: "questions" (array of objects with "topic", "question", "expectedAnswer" string fields).`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Generate ${count} BHS Stage 1 questions on different topics.` }
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
  const itemsList = items.map((item, i) =>
    `--- Question ${i + 1} ---\nQuestion: ${item.question}\nExpected answer: ${item.expectedAnswer}\nStudent's answer: ${item.userAnswer}`
  ).join('\n\n');

  const systemPrompt = `You are a BHS Stage 1 exam marker. You evaluate student answers against expected answers.

Rules:
- "correct" means the student covered the key points, even if worded differently
- "partial" means the student got some but not all key points, or was vague
- "incorrect" means the student's answer was wrong or missed the point entirely
- Keep feedback to ONE sentence. Be encouraging but honest.
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
