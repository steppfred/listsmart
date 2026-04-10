import { Resend } from 'resend';

// Initialize Resend with your API Key
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { name, email, url, serviceType, message } = req.body;

    console.log(`--- REQUEST RECEIVED FOR ${serviceType} ---`);
    console.log(`URL: ${url}`);

    // 1. DATA SCRAPING & AI ANALYSIS (The "Heavy" Work)
    // We keep this 'await'ed because the "Audit" button users need to see the results on screen.
    let aiResponseText = "No analysis performed for basic contact request.";
    let auditScore = 0;

    // We only run the full scraper/AI if it's a dedicated audit request or if you want it for every lead
    try {
      const scraperUrl = `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`;
      const scrapeRes = await fetch(scraperUrl);
      const html = await scrapeRes.text();

      // Simple extraction logic (Title/Description) - adapt to your specific scraper needs
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      const title = titleMatch ? titleMatch[1] : "Unknown Title";

      // Call Claude for the analysis
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Analyze this Airbnb listing title for SEO and conversion: "${title}". Provide a score out of 100 and 3 tips.`
          }]
        })
      });

      const claudeData = await claudeRes.json();
      aiResponseText = claudeData.content[0].text;
    } catch (scrapeErr) {
      console.error("Scraping/AI failed, proceeding with email only:", scrapeErr);
    }

    // 2. TRIGGER EMAIL IN BACKGROUND (Non-Blocking)
    // We do NOT use 'await' here so the server responds to the user immediately.
    resend.emails.send({
      from: 'onboarding@resend.dev', // Ensure domain is verified in Resend for custom domains
      to: 'listsmart@zohomail.eu',
      subject: `New Lead: ${name} (${serviceType})`,
      html: `
        <h3>New Business Inquiry</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Service:</strong> ${serviceType}</p>
        <p><strong>Listing URL:</strong> <a href="${url}">${url}</a></p>
        <p><strong>Message:</strong> ${message || 'N/A'}</p>
        <hr />
        <h4>AI Preliminary Analysis:</h4>
        <div style="background: #f4f4f4; padding: 15px; border-radius: 8px;">
          ${aiResponseText.replace(/\n/g, '<br>')}
        </div>
      `
    }).then(id => console.log("Email sent successfully in background:", id))
      .catch(err => console.error("Background email failed:", err));

    // 3. RESPOND TO CLIENT
    // This sends the data back to the browser so the website can show the results/success.
    return res.status(200).json({
      success: true,
      analysis: aiResponseText,
      message: "Your request has been processed successfully!"
    });

  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message 
    });
  }
}
