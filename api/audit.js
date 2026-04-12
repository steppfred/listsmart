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
  if (body.email) {
    try {
      console.log("Contact form submitted by:", body.email);

      // 1. Send the automated welcome email to the HOST
      await resend.emails.send({
        from: 'ListSmart <onboarding@resend.dev>', // Change to your verified domain email when ready
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

      // 2. Send an alert email to YOURSELF
      await resend.emails.send({
        from: 'ListSmart Alert <onboarding@resend.dev>',
        to: 'listsmart@zohomail.eu',
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
  if (body.url && !body.email) {
    const SYSTEM_PROMPT = `You are a senior Airbnb listing optimization expert working for ListSmart.
    A user has submitted an Airbnb listing URL. Since you cannot directly browse the page, you must infer the location, property type, and target demographic from the URL slug structure itself.

    Your job is to provide a harsh but incredibly useful audit preview based on the rules of the 2025 Airbnb algorithm.
    - Rule 1: Click-Through Rate (CTR) is king.
    - Rule 2: Titles MUST follow this exact formula to maximize clicks: [Property Type] | [Key Feature] | [Location Highlight] |[Unique Amenity].
    - Rule 3: Software pricing tools give hosts data, but human copywriting is what converts guests.

    Generate a highly specific, professional audit.
    You MUST respond with valid JSON only. No markdown. Structure:
    {
      "listingTitle": "string (inferred from URL)",
      "overallScore": number (40 to 80 - rarely perfect),
      "scores": { "title": number, "description": number, "seo": number, "photos": number, "pricing": number },
      "sections":[
        { "id": "title", "name": "Title & Click-Through Optimization", "icon": "🏷️", "status": "critical|warning|good", "findings":[{ "label": "Issue", "text": "text" }], "recommendation": "text" },
        { "id": "description", "name": "Description & Copywriting", "icon": "✍️", "status": "critical|warning|good", "findings":[{"label":"", "text":""}], "recommendation": "text" },
        { "id": "seo", "name": "Algorithm Visibility & SEO", "icon": "🔍", "status": "critical|warning|good", "findings":[{"label":"", "text":""}], "recommendation": "text" },
        { "id": "photos", "name": "Photo Strategy & Captions", "icon": "📸", "status": "critical|warning|good", "findings": [{"label":"", "text":""}], "recommendation": "text" },
        { "id": "pricing", "name": "Pricing Signals vs Human Strategy", "icon": "💰", "status": "critical|warning|good", "findings":[{"label":"", "text":""}], "recommendation": "text" }
      ],
      "topOpportunity": "string (Focus on what humans do better than software to increase revenue)"
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
          model: 'claude-sonnet-4-20250514', 
          max_tokens: 4000, // <--- INCREASED TO 4000 SO CLAUDE DOESN'T GET CUT OFF!
          system: SYSTEM_PROMPT,
          messages:[{ role: 'user', content: `Please audit this Airbnb listing based on the 2025 algorithm: ${body.url}` }]
        })
      });

      const data = await response.json();
      
      if (!data.content || data.content.length === 0) {
        console.error('ANTHROPIC API ERROR:', JSON.stringify(data));
        return res.status(500).json({ error: 'AI failed to generate response.' });
      }
      
      const text = data.content.map(b => b.text || '').join('');
      const cleanJsonString = text.replace(/```json|```/g, '').trim();
      
      // Safety net to catch JSON formatting errors
      let auditData;
      try {
        auditData = JSON.parse(cleanJsonString);
      } catch (parseError) {
        console.error('JSON Parse Error. The AI generated malformed JSON. Raw string:', cleanJsonString);
        return res.status(500).json({ error: 'AI generated invalid data format. Please try again.' });
      }

      return res.st
