import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// AI-powered ADR extraction using Claude Opus (requires ANTHROPIC_API_KEY)
export async function extractADRWithAI(conversation) {
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: `You are a software architecture expert specializing in Architecture Decision Records (ADRs).
Analyze the given development conversation and produce a structured ADR.
Respond with valid JSON only, using this exact structure:

{
  "title": "Core decision summarized in 80 characters or fewer",
  "context": "What problem or situation made this decision necessary (2-4 sentences)",
  "decision": "What was decided and why this approach was chosen (3-5 sentences)",
  "consequences": "Trade-offs, benefits, risks, and future implications of this decision (2-4 sentences)"
}`,
    messages: [
      {
        role: 'user',
        content: `Extract the key architectural decision from the following development conversation and return it as an ADR JSON:\n\n${conversation}`,
      },
    ],
  });

  const response = await stream.finalMessage();

  for (const block of response.content) {
    if (block.type === 'text') {
      const match = block.text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  }

  throw new Error('Failed to parse JSON from AI response');
}

// AI-powered ADR quality review
export async function reviewADR(adr) {
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    system: `You are a senior software architect reviewing Architecture Decision Records for quality and completeness.
Evaluate the ADR critically and return a JSON review with this exact structure:

{
  "score": <integer 0-100>,
  "summary": "One-sentence overall assessment",
  "issues": [
    { "severity": "high|medium|low", "field": "context|decision|consequences|title", "message": "specific problem description" }
  ],
  "suggestions": [
    "Concrete, actionable improvement suggestion"
  ]
}

Evaluate against these criteria:
- Context: Is the problem clearly stated? Are constraints and forces explained?
- Decision: Are alternatives considered and rejected? Is the rationale explicit?
- Consequences: Are both positive and negative outcomes listed? Are risks acknowledged?
- Title: Does it capture the decision, not just the topic?`,
    messages: [
      {
        role: 'user',
        content: `Review this ADR for quality:\n\n# ${adr.title}\n\n## Context\n${adr.context}\n\n## Decision\n${adr.decision}\n\n## Consequences\n${adr.consequences}`,
      },
    ],
  });

  const response = await stream.finalMessage();

  for (const block of response.content) {
    if (block.type === 'text') {
      const match = block.text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  }

  throw new Error('Failed to parse review JSON from AI response');
}

// Keyword-based ADR extraction — fallback when no API key is set
export function extractADR(conversation) {
  const lines = conversation.split('\n');

  const decisionKeywords = ['decided', 'chose', 'adopted', 'selected', 'using', 'instead of', 'switched to'];
  const contextKeywords = ['because', 'problem', 'issue', 'need', 'required', 'had to'];
  const consequenceKeywords = ['therefore', 'as a result', 'benefit', 'tradeoff', 'downside', 'risk'];

  const decisions    = lines.filter(l => decisionKeywords.some(kw => l.toLowerCase().includes(kw)));
  const contexts     = lines.filter(l => contextKeywords.some(kw => l.toLowerCase().includes(kw)));
  const consequences = lines.filter(l => consequenceKeywords.some(kw => l.toLowerCase().includes(kw)));

  return {
    title:        decisions[0]?.trim().slice(0, 80) ?? 'Architecture decision record',
    context:      contexts.slice(0, 3).join('\n') || 'No context found',
    decision:     decisions.slice(0, 3).join('\n') || 'No decision found',
    consequences: consequences.slice(0, 3).join('\n') || 'No consequences found',
  };
}
