exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { action, usedTopics, question, expectedAnswer, userAnswer } = JSON.parse(event.body);
    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

    if (!CLAUDE_API_KEY) {
      throw new Error('API key not configured');
    }

    if (action === 'generate') {
      return await generateQuestion(CLAUDE_API_KEY, usedTopics || []);
    } else if (action === 'check') {
      return await checkAnswer(CLAUDE_API_KEY, question, expectedAnswer, userAnswer);
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid action. Use "generate" or "check".' })
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

async function generateQuestion(apiKey, usedTopics) {
  const allTopics = [
    'Horse Health',
    'Feeding & Watering',
    'Tack & Equipment',
    'Grooming',
    'Horse Behaviour',
    'Stable Management',
    'Grassland Care',
    'Riding Theory'
  ];

  const available = allTopics.filter(t => !usedTopics.includes(t));
  const topicPool = available.length > 0 ? available : allTopics;
  const topic = topicPool[Math.floor(Math.random() * topicPool.length)];

  const systemPrompt = `You are a BHS (British Horse Society) Stage 1 exam question writer. You create clear, fair, open-ended questions that test practical knowledge at Stage 1 level.

Rules:
- Ask ONE question on the given topic
- Questions should require a short answer (1-3 sentences), not an essay
- Pitch at BHS Stage 1 level: foundational practical horsemanship
- Provide a concise expected answer that covers the key points an examiner would look for
- Do NOT ask multiple-choice questions. Ask open-ended questions that require the student to recall and explain.

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text. Keys: "topic" (string), "question" (string), "expectedAnswer" (string).`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Generate a BHS Stage 1 question on the topic: ${topic}` }
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

async function checkAnswer(apiKey, question, expectedAnswer, userAnswer) {
  const systemPrompt = `You are a BHS Stage 1 exam marker. You evaluate a student's answer against the expected answer.

Rules:
- Be encouraging but honest
- "correct" means the student covered the key points, even if worded differently
- "partial" means the student got some but not all key points, or was vague
- "incorrect" means the student's answer was wrong or missed the point entirely
- Give brief, helpful feedback (1-2 sentences) explaining what was right or what was missed
- Include the correct answer so the student can learn

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text. Keys: "verdict" (one of "correct", "partial", "incorrect"), "feedback" (string), "correctAnswer" (string).`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Question: ${question}\n\nExpected answer: ${expectedAnswer}\n\nStudent's answer: ${userAnswer}\n\nPlease evaluate.`
        }
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
