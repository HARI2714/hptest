// netlify/functions/gemini-proxy.js
// A simple Netlify Function that forwards a prompt to Gemini. No auth required (demo).
// Make sure to set GEMINI_API_KEY in Netlify environment variables.

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Only POST allowed' }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { prompt, systemInstruction } = body;
    if (!prompt) return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt' }) };

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured: GEMINI_API_KEY missing' }) };

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    };

    // Basic in-memory rate limit (demo only): limit to 8 calls per minute per function instance
    if (!global.__ai_calls) global.__ai_calls = { count: 0, start: Date.now() };
    const now = Date.now();
    if (now - global.__ai_calls.start > 60_000) {
      global.__ai_calls.count = 0;
      global.__ai_calls.start = now;
    }
    global.__ai_calls.count++;
    if (global.__ai_calls.count > 120) { // coarse global cap per instance
      return { statusCode: 429, body: JSON.stringify({ error: 'Rate limit exceeded (demo).' }) };
    }

    const aiResp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error('Gemini API error', aiResp.status, t);
      return { statusCode: 502, body: JSON.stringify({ error: 'Gemini returned error', details: t }) };
    }

    const json = await aiResp.json();
    // Forward the Gemini response as-is
    return {
      statusCode: 200,
      body: JSON.stringify(json),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    console.error('Proxy error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'AI proxy error', details: err.message }) };
  }
};
