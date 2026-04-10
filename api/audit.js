export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, url, serviceType, message } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert. Analyze the provided HTML and return valid JSON only.`;

  try {
    // 1. SCRAPE
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&stealth_proxy=true&wait=3000`;
    const scraperResponse = await fetch(scraperUrl);
    const html = await scraperResponse.text();
    const cleanedText = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "").substring(0, 20000);

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
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Analyze: ${cleanedText}` }]
      })
    });

    const data = await anthropicResponse.json();
    const text = data.content[0].text.trim();
    const auditData = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));

    // 3. EMAIL LOGIC WITH DEBUGGING
    console.log("Service Type Received:", serviceType);
    
    // Check if it's a paid request
    const isPaidRequest = serviceType && (serviceType.includes('€') || serviceType.includes('Audit') || serviceType.includes('Full'));
    
    if (isPaidRequest) {
      if (!process.env.RESEND_API_KEY) {
        console.error("MISSING RESEND_API_KEY in Vercel Environment Variables");
      } else {
        console.log("Attempting to send email via Resend...");
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'ListSmart <onboarding@resend.dev>',
            to: 'steppfred@zohomail.eu', 
            subject: `🚨 PAID ORDER: ${name}`,
            html: `<p><strong>Service:</strong> ${serviceType}</p><p><strong>URL:</strong> ${url}</p>`
          })
        });

        const resendResult = await resendResponse.json();
        console.log("Resend API Response:", JSON.stringify(resendResult));
      }
    } else {
      console.log("Skipping email: Not a paid request or serviceType missing.");
    }

    res.status(200).json(auditData);

  } catch (error) {
    console.error('Audit error:', error);
    res.status(500).json({ error: 'Process failed', details: error.message });
  }
}
