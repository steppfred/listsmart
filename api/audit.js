export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Capturing the specific fields from your form
  const { name, email, url, serviceType, message } = req.body;

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
    // 1. SCRAPE THE DATA
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&stealth_proxy=true&wait=3000`;
    
    const scraperResponse = await fetch(scraperUrl);
    if (!scraperResponse.ok) throw new Error(`Scraper failed: ${scraperResponse.status}`);
    
    const html = await scraperResponse.text();
    const cleanedText = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "")
      .replace(/<[^>]*>?/gm, ' ') 
      .replace(/\s+/g, ' ')       
      .substring(0, 25000);       

    // 2. CALL ANTHROPIC FOR THE PREVIEW
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
        messages: [{ role: 'user', content: `Analyze this listing: ${cleanedText}` }]
      })
    });

    const data = await anthropicResponse.json();
    const text = data.content[0].text.trim();
    const auditData = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));

    // 3. SEND EMAIL FOR ALL PAID SERVICE REQUESTS
    // This logic checks if the serviceType mentions a price or isn't the free preview.
    // Based on your screenshot, it will catch "Listing Audit (€97)", etc.
    const isPaidRequest = serviceType && (serviceType.includes('€') || serviceType.includes('Audit') || serviceType.includes('Full'));

    if (isPaidRequest && process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'ListSmart Orders <onboarding@resend.dev>',
          to: 'steppfred@zohomail.eu',
          subject: `🚨 PAID SERVICE REQUEST: ${name} (${serviceType})`,
          html: `
            <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
              <h2 style="color: #059669;">💰 NEW PAID ORDER RECEIVED</h2>
              <p>A user has requested a professional service.</p>
              <hr />
              <p><strong>Selected Service:</strong> <span style="font-size: 1.2em; font-weight: bold; color: #059669;">${serviceType}</span></p>
              <p><strong>Customer Name:</strong> ${name || 'N/A'}</p>
              <p><strong>Customer Email:</strong> ${email || 'N/A'}</p>
              <p><strong>URL:</strong> <a href="${url}">${url}</a></p>
              <p><strong>Message from Host:</strong> ${message || 'No additional notes provided'}</p>
              <hr />
              <h3 style="color: #666;">AI Preliminary Assessment:</h3>
              <p><strong>Listing Title:</strong> ${auditData.listingTitle}</p>
              <p><strong>Preliminary Score:</strong> ${auditData.overallScore}/100</p>
              <p><strong>Identified Opportunity:</strong> ${auditData.topOpportunity}</p>
            </div>
          `
        })
      });
    }

    res.status(200).json(auditData);

  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
}
