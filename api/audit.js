export const maxDuration = 60; 

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert working for ListSmart.
A user has submitted an Airbnb listing URL. Analyze the URL structure to infer what you can (location, property type), then generate a realistic, expert-level audit preview as if you had reviewed the listing.

You MUST respond with valid JSON only. No markdown, no preamble. Structure:
{
  "listingTitle": "string",
  "overallScore": number,
  "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number },
  "sections": [
    {
      "id": "title", "name": "Title & First Impression", "icon": "🏷️", "status": "critical|warning|good",
      "findings": [{ "label": "Issue / Strength", "text": "detailed finding text" }],
      "recommendation": "specific, actionable rewrite suggestion or improvement"
    },
    { "id": "description", "name": "Description & Copywriting", "icon": "✍️", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "..." },
    { "id": "seo", "name": "SEO & Search Visibility", "icon": "🔍", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "..." },
    { "id": "photos", "name": "Photo Strategy", "icon": "📸", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "..." },
    { "id": "pricing", "name": "Pricing Signals", "icon": "💰", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "..." }
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
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Please audit this Airbnb listing: ${url}` }]
      })
    });

    const data = await response.json();
    
    // SAFETY CHECK: Did Anthropic return an error?
    if (!data.content) {
      console.error('ANTHROPIC API REJECTED REQUEST:', JSON.stringify(data, null, 2));
      return res.status(500).json({ error: 'AI provider error. Check Vercel logs for details.' });
    }
    
    // If successful, process the data
    const text = data.content.map(b => b.text || '').join('');
    const cleanJsonString = text.replace(/```json|```/g, '').trim();
    const auditData = JSON.parse(cleanJsonString);

    res.status(200).json(auditData);
  } catch (error) {
    console.error('Audit generation error:', error);
    res.status(500).json({ error: 'Failed to generate audit' });
  }
}
