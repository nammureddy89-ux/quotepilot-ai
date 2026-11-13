# QuotePilot AI — Kill the Quote Spreadsheet

Prototype for the Aerchain product assignment. Fictional buyer: Priya Deshmukh, Sahyadri Foods — annual corrugated box contract, 30 lines, 5 vendors.

- Frontend: plain HTML/CSS/JS (no build step).
- AI: Google Gemini (free tier) via one Vercel serverless function `api/ai.js` that keeps the key secret.
- AI reads vendor replies (Excel, PDF, Word, photo, email) and reports raw values with sources. All conversions, totals and checks are plain JavaScript (`js/normalize.js`).
- Data is stored in the browser only. "Reset demo" clears it.

Setup: in Vercel → Settings → Environment Variables add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`), then redeploy.
