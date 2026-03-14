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
      return await generateAll(CLAUDE_API_KEY, body.count || 3, body.recentQuestions || [], body.feedback || []);
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

async function generateAll(apiKey, count, recentQuestions, feedback) {
  const systemPrompt = `You are a BHS (British Horse Society) Stage 1 exam question writer. You create clear, fair questions that test practical knowledge at Stage 1 level.

TOPIC AREAS AND SUB-TOPICS — draw from across this full range:

Horse Health: normal vital signs (TPR: temp 37.5-38.5°C, pulse 28-40bpm, resp 8-14), signs of good vs poor health, common ailments (colic signs, laminitis, mud fever, thrush, rain scald), when to call the vet, basic wound care, worming

Feeding & Watering: rules of feeding (little and often, feed according to work, make no sudden changes, feed at regular times, water before feeding), types of feed (hay, haylage, hard feed, chaff, sugar beet), clean fresh water always available, how the digestive system works (hindgut fermenters, small stomach)

Tack & Equipment: parts of a saddle (pommel, cantle, seat, skirt, girth straps, stirrup bars, panels), parts of a bridle (headpiece, browband, cheekpieces, throatlash, noseband, reins, bit), fitting a snaffle bridle (1-2 wrinkles), types of snaffle bits (loose ring, eggbutt, full cheek), numnahs, girths, martingales, cleaning and storing tack

Grooming: grooming kit (dandy brush, body brush, curry comb, water brush, hoof pick, mane comb, sponges, stable rubber, sweat scraper), order of grooming, picking out feet (heel to toe), when to groom (before/after exercise), reasons for grooming (health check, circulation, appearance, bonding)

Horse Behaviour: body language (ears, tail, eyes, posture), flight response, herd instincts, signs of stress or pain (box walking, weaving, crib biting), how to approach safely, why horses kick/bite

Stable Management: bedding types (straw, shavings, rubber matting, hemp), mucking out (full muck out vs skip out), stable design (ventilation, drainage, minimum size 12x12ft), daily routine, haynet safety (tie high, small holes)

Grassland Care: poisonous plants (ragwort, yew, deadly nightshade, foxglove, privet, buttercups), field maintenance (poo picking, harrowing, resting), fencing (post and rail safest, avoid barbed wire), water supply, daily field checks, shelter

Riding Theory: mounting and dismounting, correct riding position, natural aids (legs, hands, seat, voice), artificial aids (whip, spurs), paces/gaits (walk, trot, canter, gallop), school figures, arena letters (A-K-E-H-C-M-B-F), road safety and the Highway Code for riders

Points of the Horse: naming body parts (poll, crest, withers, loins, dock, fetlock, pastern, coronet, hock, stifle, chestnut, ergot), colours (bay, chestnut, grey, black, palomino, dun, roan, piebald, skewbald), facial markings (star, stripe, blaze, snip, white face), leg markings (sock, stocking, ermine marks)

Safety & Handling: leading in hand (walk on left, lead rope in right hand), tying up safely (quick-release knot, tie to string not solid ring), catching in the field, turning a horse out, passing behind safely

${recentQuestions.length > 0 ? `RECENTLY ASKED — DO NOT repeat these questions or close variations. Find DIFFERENT angles within each topic area:\n${recentQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n` : ''}${feedback.length > 0 ? `QUIZ-TAKER FEEDBACK — they flagged these past questions. Use this to improve future questions:\n${feedback.map((f, i) => `${i + 1}. Question: "${f.question}" — Feedback: "${f.note}"`).join('\n')}\n\n` : ''}RULES:
- Generate exactly ${count} questions spread ACROSS the sub-topics above. Do not cluster on one area.
- AVOID repeating questions from the "RECENTLY ASKED" list above. If a topic was recently covered, ask about a DIFFERENT sub-topic or angle within that area.
- If count exceeds 10 topic areas, reuse topics but always vary the specific sub-topic.
- Create a MIX of question types: roughly half multiple-choice and half open-ended. Vary the mix each time.
- Pitch at BHS Stage 1 level: foundational practical horsemanship, not advanced.
- Include some scenario-based questions, e.g. "You arrive at the yard and notice a horse is sweating, pawing the ground, and looking at its flanks. What might be wrong and what should you do?"

For MULTIPLE-CHOICE questions, use type "mc":
- Provide exactly 4 options
- Make wrong options PLAUSIBLE — use commonly confused values, realistic-sounding alternatives. Avoid obviously silly answers.
- Provide the correctIndex (0-based) of the right answer
- Provide a brief explanation (1 sentence)

For OPEN-ENDED questions, use type "open":
- Questions should require a short answer (1-3 sentences)
- Provide a concise expectedAnswer listing the KEY TERMS an examiner would want to hear

OPTIONAL — IMAGE QUESTIONS:
If a question references one of the available images below, include an "imageId" field with the image ID. Only use images from this list:

IMAGE BANK:
- "bay": A bay horse (brown body, black mane/tail/legs)
- "chestnut": A chestnut horse (reddish-brown all over)
- "grey": A grey/white horse
- "piebald": A piebald horse (black and white patches)
- "blaze": A horse with a blaze (wide white stripe down face)
- "star": A horse with a star marking (white mark on forehead)
- "saddle": A general purpose saddle showing parts
- "bridle": A snaffle bridle showing parts
- "hoofpick": A hoof pick
- "dandybrush": A dandy brush

For image questions, ask the student to identify something in the image (e.g. "What colour is this horse?", "Name three parts of the saddle shown", "What is this grooming tool used for?"). Use imageId to reference the image.

Respond ONLY with a valid JSON object. No markdown, no code fences, no extra text.
Key: "questions" (array of objects).

MC shape: { "type": "mc", "topic": string, "question": string, "options": [...], "correctIndex": number, "explanation": string, "imageId": string (optional) }
Open shape: { "type": "open", "topic": string, "question": string, "expectedAnswer": string, "imageId": string (optional) }`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
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
      max_tokens: 2000,
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
