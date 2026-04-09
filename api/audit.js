export const maxDuration = 60;

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert working for ListSmart.
Analyze the listing URL and generate a realistic, expert-level audit.
You MUST respond with valid JSON only. Structure:
{
  "listingTitle": "string",
  "overallScore": number,
  "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number },
  "sections": [
    {
      "id": "title", "name": "Title & First Impression", "icon": "🏷️", "status": "critical|warning|good",
      "findings": [{ "label": "Issue / Strength", "text": "detailed finding text" }],
      "recommendation": "actionable suggestion"
    }
  ],
  "topOpportunity": "string"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Please audit this Airbnb listing: ${url}` }
        ]
      })
    });

    const data = await response.json();

    // 2. Check for API errors
    if (data.error) {
      console.error('ANTHROPIC API ERROR:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    if (!data.content || data.content.length === 0) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    // 3. Extract and Parse the JSON
    const text = data.content[0].text.trim();
    
    // Safety: If Claude still adds markdown backticks, we strip them
    const cleanJson = text.startsWith('```') 
      ? text.replace(/^```json/, '').replace(/```$/, '').trim() 
      : text;

    const auditData = JSON.parse(cleanJson);
    res.status(200).json(auditData);

  } catch (error) {
    console.error('Audit generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate audit', 
      details: error.message 
    });
  }
}
