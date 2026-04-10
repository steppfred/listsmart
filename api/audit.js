export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // LOG EVERYTHING RECEIVED TO DEBUG FRONTEND
  console.log("--- NEW REQUEST RECEIVED ---");
  console.log("Body:", JSON.stringify(req.body));

  const { name, email, url, serviceType, message } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert. Analyze the provided HTML and return valid JSON only. Structure: { "listingTitle": "string", "overallScore": number, "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number }, "sections": [ { "id": "string", "name": "string", "icon": "string", "status": "critical|warning|good", "findings": [{ "label": "string", "text": "string" }], "recommendation": "string" } ], "topOpportunity": "string" }`;

  try {
    // 1. SCRAPE
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&stealth_proxy=true&wait=3000`;
    const scraperResponse = await fetch(scraperUrl);
    const html = await scraperResponse.text();
    const cleanedText = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "").substring(0, 15000);

    // 2. AI AUDIT
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

    const data = await anthropicResponse.json();
    const text = data.content[0].text.trim();
    const auditData = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));

    // 3. EMAIL LOGIC
    const type = (serviceType || "").toLowerCase();
    
    // Check for paid request keywords or prices
    const isPaidRequest = type.includes('€') || type.includes('97') || type.includes('147') || type.includes('audit') || type.includes('pro');
    
    console.log("Service detected:", serviceType);
    console.log("Is Paid Request?:", isPaidRequest);

    if (isPaidRequest) {
      if (!process.env.RESEND_API_KEY) {
        console.error("CRITICAL ERROR: RESEND_API_KEY IS MISSING IN VERCEL SETTINGS");
      } else {
        console.log("Attempting to send email via Resend API...");
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'ListSmart <onboarding@resend.dev>',
            to: 'steppfred@zohomail.eu', 
            subject: `🚨 PAID ORDER: ${name || 'New Customer'}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">💰 NEW PAID ORDER RECEIVED</h2>
                <p style="font-size: 16px;">A user has requested a professional service on ListSmart.</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; font-weight: bold; width: 150px;">Service:</td><td>${serviceType}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Name:</td><td>${name}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td>${email}</td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">URL:</td><td><a href="${url}">${url}</a></td></tr>
                  <tr><td style="padding: 8px 0; font-weight: bold;">Message:</td><td>${message || 'No message'}</td></tr>
                </table>
                <hr style="margin: 20px 0; border: 0; border-top: 1px solid #eee;" />
                <h3 style="color: #666;">AI Preliminary Assessment:</h3>
                <p><strong>Listing:</strong> ${auditData.listingTitle}</p>
                <p><strong>Initial Score:</strong> ${auditData.overallScore}/100</p>
                <p><strong>Top Opportunity:</strong> ${auditData.topOpportunity}</p>
              </div>
            `
          })
        });

        const resendResult = await resendResponse.json();
        if (resendResponse.ok) {
          console.log("SUCCESS: Email sent successfully!", resendResult.id);
        } else {
          console.error("RESEND ERROR:", JSON.stringify(resendResult));
        }
      }
    }

    res.status(200).json(auditData);

  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: 'Process failed', details: error.message });
  }
}
