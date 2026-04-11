import { Resend } from 'resend';

export const maxDuration = 60; 

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // ==========================================
  // SCENARIO 1: CONTACT FORM SUBMITTED
  // ==========================================
  // If the request includes an email address, it came from the contact form.
  if (body.email) {
    try {
      console.log("Contact form submitted by:", body.email);

      // 1. Send the automated welcome email to the HOST
      await resend.emails.send({
        from: 'ListSmart <onboarding@resend.dev>', // See note below about this email!
        to: body.email,
        subject: 'We got your request! (Let’s get you more bookings 🚀)',
        html: `
          <p>Hi ${body.name || 'there'},</p>
          <p>Just sending a quick note to say thank you for reaching out to ListSmart! This is an automated email to confirm that we successfully received your request and your Airbnb link.</p>
          <p>Our team is going to take a look at your listing to see exactly where you are leaving money on the table, and how we can help you boost your visibility and bookings.</p>
          <p>We are reviewing your details now and will follow up with you personally as soon as possible (usually within 24 hours).</p>
          <p>If there is anything else you forgot to mention about your property or your goals, feel free to just reply directly to this email!</p>
          <br>
          <p>Talk to you soon,</p>
          <p><strong>The ListSmart Team</strong></p>
        `
      });

      // 2. Send an alert email to YOURSELF so you know you have a new lead
      await resend.emails.send({
        from: 'ListSmart Alert <onboarding@resend.dev>',
        to: 'listsmart@zohomail.eu', // Your actual email
        subject: '🎉 NEW LISTSMART LEAD: ' + (body.name || 'Unknown'),
        text: `You have a new client request!\n\nName: ${body.name}\nEmail: ${body.email}\nService: ${body.serviceType}\nURL: ${body.url}\nMessage: ${body.message}`
      });

      return res.status(200).json({ success: true, message: 'Emails sent successfully' });

    } catch (error) {
      console.error("Email sending failed:", error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
  }


  // ==========================================
  // SCENARIO 2: LIVE AI AUDIT REQUEST
  // ==========================================
  // If there is a URL but NO email, it came from the "Analyze Listing" button
  if (body.url && !body.email) {
    const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert working for ListSmart.
    A user has submitted an Airbnb listing URL. Analyze the URL structure to infer what you can (location, property type), then generate a realistic, expert-level audit preview.
    You MUST respond with valid JSON only. No markdown. Structure:
    {
      "listingTitle": "string",
      "overallScore": number,
      "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number },
      "sections": [
        { "id": "title", "name": "Title & First Impression", "icon": "🏷️", "status": "critical|warning|good", "findings": [{ "label": "Issue", "text": "text" }], "recommendation": "text" },
        { "id": "description", "name": "Description & Copywriting", "icon": "✍️", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "text" },
        { "id": "seo", "name": "SEO & Search Visibility", "icon": "🔍", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "text" },
        { "id": "photos", "name": "Photo Strategy", "icon": "📸", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "text" },
        { "id": "pricing", "name": "Pricing Signals", "icon": "💰", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "text" }
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
          model: 'claude-3-5-sonnet-20240620',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Please audit this Airbnb listing: ${body.url}` }]
        })
      });

      const data = await response.json();
      
      // Safety check so the code never crashes on [0] again!
      if (!data.content || data.content.length === 0) {
        console.error('ANTHROPIC API ERROR:', JSON.stringify(data));
        return res.status(500).json({ error: 'AI failed to generate response.' });
      }
      
      const text = data.content.map(b => b.text || '').join('');
      const cleanJsonString = text.replace(/```json|```/g, '').trim();
      const auditData = JSON.parse(cleanJsonString);

      return res.status(200).json(auditData);
    } catch (error) {
      console.error('Audit generation error:', error);
      return res.status(500).json({ error: 'Failed to generate audit' });
    }
  }

  // Fallback if neither matches
  return res.status(400).json({ error: 'Invalid request data' });
}
