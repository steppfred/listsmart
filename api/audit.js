export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    // --- STEP 1: SCRAPE THE LISTING ---
    // We use ScrapingBee to bypass Airbnb's "Access Denied" blocks.
    const scraperUrl = `https://app.scrapingbee.com/api/v1/?api_key=${process.env.SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=false&premium_proxy=true`;
    
    const scraperResponse = await fetch(scraperUrl);
    if (!scraperResponse.ok) throw new Error('Failed to scrape listing. Airbnb might be blocking the request.');
    
    const html = await scraperResponse.text();
    // Clean the HTML slightly so we don't waste tokens
    const cleanedText = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, "").replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, "").substring(0, 50000);

    // --- STEP 2: SEND TO CLAUDE ---
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
        system: "You are an Airbnb expert. Analyze the provided HTML data and return a professional audit in JSON format.",
        messages: [
          { role: 'user', content: `Audit this actual Airbnb listing data: ${cleanedText}` }
        ]
      })
    });

    const data = await anthropicResponse.json();
    const text = data.content[0].text.trim();
    
    // Final Parse
    const cleanJson = text.startsWith('
http://googleusercontent.com/immersive_entry_chip/0

### Why this fixes the "hallucination":
1.  **Actual Data:** Instead of guessing, the code sends the raw text from the Airbnb page to Claude. 
2.  **Premium Proxies:** Airbnb blocks standard Vercel servers. ScrapingBee uses "Residential Proxies" that make the request look like a real person browsing from home.
3.  **Token Management:** The `.substring(0, 50000)` part makes sure we don't send too much garbage (like tracking codes) to Claude, keeping your costs down.

### Summary Checklist:
1.  Add `SCRAPINGBEE_API_KEY` to Vercel.
2.  Update `api/audit.js` with the code above.
3.  **Redeploy** on Vercel.

Once you do this, Claude will actually see the real listing title, the real description, and the real amenities! Do you have the ScrapingBee key ready?
