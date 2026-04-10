export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. IMMEDIATE LOGGING
  // If you don't see this in Vercel Logs, the frontend isn't hitting the API
  console.log("--- API START: NEW REQUEST ---");
  console.log("Payload Received:", JSON.stringify(req.body));

  const { name, email, url, serviceType, message } = req.body;

  if (!url) {
    console.error("ERROR: No URL provided in request body");
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert. Analyze the provided HTML and return valid JSON only. Structure: { "listingTitle": "string", "overallScore": number, "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number }, "sections": [ { "id": "string", "name": "string", "icon": "string", "status": "critical|warning|good", "findings": [{ "label": "string", "text": "string" }], "recommendation": "string" } ], "topOpportunity": "string" }`;

  try {
    // 2. SCRAPE
    console.log("Scraping URL:", url);
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&stealth_proxy=true&wait=3000`;
    const scraperResponse = await fetch(scraperUrl);
    const html = await scraperResponse.text();
    const cleanedText = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "").substring(0, 15000);

    // 3. AI AUDIT
    console.log("Calling Anthropic AI...");
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

    // 4. IMPROVED EMAIL LOGIC
    // We will send an email if a name/email is provided OR if it's explicitly paid
    const type = (serviceType || "").toLowerCase();
    const isPaid = type.includes('€') || type.includes('97') || type.includes('147') || type.includes('audit');
    const hasContactInfo = name || email;

    console.log("Service Type:", serviceType);
    console.log("Decision - isPaid:", isPaid, "hasContactInfo:", !!hasContactInfo);

    if (isPaid || hasContactInfo) {
      if (!process.env.RESEND_API_KEY) {
        console.error("CRITICAL: RESEND_API_KEY is missing in Vercel Environment Variables");
      } else {
        console.log("Attempting to send email to steppfred@zohomail.eu...");
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'ListSmart <onboarding@resend.dev>',
            to: 'steppfred@zohomail.eu', 
            subject: `🚨 NEW REQUEST: ${name || 'New Customer'}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #10b981;">NEW ORDER/LEAD RECEIVED</h2>
                <p><strong>Service:</strong> ${serviceType || 'Not specified'}</p>
                <p><strong>Name:</strong> ${name || 'N/A'}</p>
                <p><strong>Email:</strong> ${email || 'N/A'}</p>
                <p><strong>URL:</strong> ${url}</p>
                <p><strong>Message:</strong> ${message || 'No message'}</p>
                <hr />
                <h3>AI Assessment:</h3>
                <p><strong>Title:</strong> ${auditData.listingTitle}</p>
                <p><strong>Score:</strong> ${auditData.overallScore}/100</p>
              </div>
            `
          })
        });

        const resendResult = await resendResponse.json();
        if (resendResponse.ok) {
          console.log("RESEND SUCCESS:", resendResult.id);
        } else {
          console.error("RESEND API ERROR:", JSON.stringify(resendResult));
        }
      }
    } else {
      console.log("Skipping email: No paid indicator and no contact info provided.");
    }

    res.status(200).json(auditData);

  } catch (error) {
    console.error('SERVER ERROR:', error);
    res.status(500).json({ error: 'Process failed', details: error.message });
  }
}
