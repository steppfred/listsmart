export const maxDuration = 60;

export default async function handler(req, res) {
  // 1. ABSOLUTE FIRST PRIORITY: LOGGING
  // If this doesn't show up in Vercel Logs, your index.html is not calling this endpoint correctly.
  console.log("--- REQUEST RECEIVED AT /api/audit ---");
  console.log("Method:", req.method);
  console.log("Body Content:", JSON.stringify(req.body));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, url, serviceType, message } = req.body;

  // Basic validation
  if (!url) {
    console.error("CRITICAL: No URL provided in request");
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert. Analyze the provided HTML and return valid JSON only. Structure: { "listingTitle": "string", "overallScore": number, "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number }, "sections": [ { "id": "string", "name": "string", "icon": "string", "status": "critical|warning|good", "findings": [{ "label": "string", "text": "string" }], "recommendation": "string" } ], "topOpportunity": "string" }`;

  try {
    // 2. SCRAPE DATA
    console.log("Starting scrape for:", url);
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&stealth_proxy=true&wait=3000`;
    const scraperResponse = await fetch(scraperUrl);
    
    if (!scraperResponse.ok) {
      throw new Error(`ScrapingBee Error: ${scraperResponse.status}`);
    }
    
    const html = await scraperResponse.text();
    const cleanedText = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "").substring(0, 15000);

    // 3. AI ANALYSIS
    console.log("Sending data to Claude...");
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Analyze: ${cleanedText}` }]
      })
    });

    const aiData = await anthropicResponse.json();
    const aiText = aiData.content[0].text.trim();
    const auditData = JSON.parse(aiText.substring(aiText.indexOf('{'), aiText.lastIndexOf('}') + 1));

    // 4. EMAIL LOGIC (BROADENED TO ENSURE DELIVERY)
    // We send an email if a name OR email was provided (indicating a lead)
    if ((name || email) && process.env.RESEND_API_KEY) {
      console.log("Lead detected. Attempting email to steppfred@zohomail.eu...");
      
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'ListSmart <onboarding@resend.dev>',
          to: 'steppfred@zohomail.eu', 
          subject: `🚨 NEW SERVICE REQUEST: ${name || 'New Customer'}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #10b981;">NEW ORDER/LEAD RECEIVED</h2>
              <p><strong>Selected Service:</strong> ${serviceType || 'Not specified'}</p>
              <p><strong>Customer Name:</strong> ${name || 'N/A'}</p>
              <p><strong>Customer Email:</strong> ${email || 'N/A'}</p>
              <p><strong>Listing URL:</strong> <a href="${url}">${url}</a></p>
              <p><strong>Customer Message:</strong> ${message || 'No message provided'}</p>
              <hr />
              <h3>Preliminary AI Result:</h3>
              <p><strong>Listing:</strong> ${auditData.listingTitle}</p>
              <p><strong>Initial Score:</strong> ${auditData.overallScore}/100</p>
            </div>
          `
        })
      });

      const resendResult = await resendResponse.json();
      if (resendResponse.ok) {
        console.log("RESEND SUCCESS! ID:", resendResult.id);
      } else {
        console.error("RESEND REJECTED:", JSON.stringify(resendResult));
      }
    } else {
      console.log("Email skipped: No contact info provided or RESEND_API_KEY missing.");
    }

    // Return the result to the browser
    res.status(200).json(auditData);

  } catch (error) {
    console.error("FATAL ERROR IN HANDLER:", error.message);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
