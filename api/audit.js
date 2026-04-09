export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert.
Analyze the provided HTML data and generate a realistic, expert-level audit.
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
    // 1. SCRAPE THE DATA WITH HIGH-LEVEL BYPASS
    // Added render_js=true and stealth_proxy=true because Airbnb is heavily protected
    // Added wait=3000 to allow the listing details to actually load into the DOM
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&stealth_proxy=true&wait=3000&block_resources=false`;
    
    const scraperResponse = await fetch(scraperUrl);
    
    if (!scraperResponse.ok) {
      const errorText = await scraperResponse.text();
      throw new Error(`Scraper failed (${scraperResponse.status}): ${errorText}`);
    }
    
    const html = await scraperResponse.text();
    
    // Clean the HTML to fit within token limits while keeping meaningful text
    const cleanedText = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
      .replace(/<[^>]*>?/gm, ' ') 
      .replace(/\s+/g, ' ')       
      .substring(0, 30000);       

    // 2. CALL ANTHROPIC
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
          { role: 'user', content: `Here is the listing data: ${cleanedText}` }
        ]
      })
    });

    const data = await anthropicResponse.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = data.content[0].text.trim();
    
    // Improved JSON parsing logic
    let cleanJson = text;
    if (text.includes('{')) {
      cleanJson = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    }

    res.status(200).json(JSON.parse(cleanJson));

  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ 
      error: 'Scraping or AI failed', 
      details: error.message 
    });
  }
}
