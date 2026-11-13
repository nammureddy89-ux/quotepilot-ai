// AI extraction: reads one vendor's reply (all its files) and returns structured data with a source for every value.
// The AI only READS and REPORTS. It never converts units, currencies or GST — plain code does that (normalize.js).
window.QP = window.QP || {};

(function () {
  const SYSTEM = `You are a careful procurement data-extraction assistant. You read vendor quotations for a buyer and report exactly what the documents say.

Hard rules:
- Report values exactly as written by the vendor: the number, its unit basis and currency. Do NOT convert units, currencies or remove GST. Do NOT do arithmetic.
- Never invent or guess a value. If a value is missing, smudged, cut off or unreadable, say so (price_status "unreadable" or "not_quoted") and leave price_value null.
- If a document has both a price excluding GST and a price including GST, report the price EXCLUDING GST and set includes_gst=false.
- Every value you report must have a source: which file and where, plus a short verbatim quote (max 15 words). Location formats: Excel → "Sheet <name>, cell <A1-ref of the value>" (e.g. "Sheet Quotation, cell G17"); PDF → "Page <n>, <table row / paragraph / footnote>"; Word → the label shown, e.g. "Table 1, row 8" or "Paragraph 9"; email/text → "Line <n>" as labelled; photo → "Row <n>, <column>, <where on the image>".
- Match vendor items to the buyer's RFx lines using line numbers if the vendor gives them, otherwise by size + ply + delivery plant. Say how you matched. If unsure, set match_confidence "low".
- If the vendor states a rule that applies to several lines (e.g. "Rs 42/kg for 5-ply"), apply it to every RFx line it covers, one entry per line, quoting the rule as the source.
- If the vendor refers to something outside the documents (e.g. "same as last year", "as per previous rate"), do NOT supply a number: set price_status "reference_only" and copy the wording into reference_text.
- Clarity: "clear" = read with certainty; "unclear" = readable but some doubt (blur, angle, ambiguous wording); "unreadable" = cannot be read.
- Money thresholds must be full numbers in the stated currency (e.g. "₹1.5 crore" → 15000000, "₹40 lakh" → 4000000); keep the original words in "text".
- "conflicts" means ONLY contradictions inside the vendor's own documents (e.g. a price in the table differs from the price in the text, two different payment terms). Do NOT report differences from what the buyer's RFx asked for (other currency, ex-works instead of delivered, per kg instead of per piece, GST included, missing items) as conflicts — report those facts in their normal fields; the buyer's rules handle them.
- Output JSON only, matching the schema exactly.`;

  function schemaText() {
    return `Return JSON with this shape:
{
  "vendor_name_in_documents": string,         // company name printed on the quote / letterhead / signature
  "quote_reference": string|null,
  "quote_date": string|null,
  "lines": [
    {
      "rfx_line": number,                       // buyer's RFx line number (1-30)
      "vendor_item_text": string,               // vendor's own description for this item
      "match_basis": "line number given by vendor" | "size + ply + plant" | "vendor rule applied" | "other",
      "match_confidence": "high" | "medium" | "low",
      "price_status": "quoted" | "not_quoted" | "unreadable" | "reference_only",
      "price_value": number|null,               // exactly as written, no conversion
      "price_basis": "per_piece" | "per_100" | "per_1000" | "per_kg" | "other" | null,
      "price_basis_text": string|null,          // e.g. "Rate / 1000 pcs (Rs)", "USD / piece", "Rate / 100 pcs"
      "currency": "INR" | "USD" | "EUR" | "other" | null,
      "includes_gst": true | false | null,
      "stated_weight_g": number|null,           // box weight the vendor states for this item, if any
      "reference_text": string|null,            // only for reference_only, e.g. "rest same as last year"
      "clarity": "clear" | "unclear" | "unreadable",
      "clarity_note": string|null,              // why unclear/unreadable
      "source": { "file": string, "location": string, "quote": string }
    }
  ],
  "not_quoted": [ { "rfx_line": number, "reason": string|null, "source": {"file": string, "location": string, "quote": string} } ],
  "commercial_terms": {
    "payment": { "stated": boolean, "days": number|null, "text": string|null, "source": {"file": string, "location": string, "quote": string}|null },
    "validity": { "stated": boolean, "days": number|null, "until_date": string|null, "text": string|null, "source": {...}|null },
    "freight": { "basis": "included" | "extra_amount_stated" | "extra_amount_not_stated" | "not_mentioned",
                 "amount": number|null, "currency": string|null, "per": "truck" | "box" | "kg" | "lump_sum" | "other" | null,
                 "boxes_per_unit": number|null, "text": string|null, "source": {...}|null },
    "lead_time": { "stated": boolean, "days": number|null, "text": string|null, "source": {...}|null },
    "gst": { "text": string|null, "rate_percent": number|null, "source": {...}|null },
    "price_variation_clause": { "present": boolean, "text": string|null, "source": {...}|null },
    "discounts": [ { "percent": number|null, "condition_type": "annual_order_value_above" | "quantity_above" | "early_payment" | "none" | "other",
                     "threshold_amount": number|null, "threshold_currency": string|null, "threshold_basis": string|null,
                     "text": string, "source": {...} } ],
    "other_conditions": [ { "text": string, "source": {...} } ]
  },
  "questionnaire": {
    "iso_9001": { "answer": "yes" | "no" | "in_process" | "not_stated", "claim_text": string|null, "evidence_file": string|null, "source": {...}|null },
    "monthly_capacity": { "answer": "stated" | "not_stated", "boxes_per_month": number|null, "text": string|null, "source": {...}|null },
    "test_report": { "answer": "attached" | "claimed_not_attached" | "not_stated", "evidence_file": string|null, "source": {...}|null },
    "food_safe_inks": { "answer": "yes" | "no" | "not_stated", "text": string|null, "source": {...}|null },
    "box_weight_confirmation": { "answer": "confirmed" | "deviations_stated" | "not_stated", "text": string|null, "source": {...}|null }
  },
  "attachments": [
    { "file": string, "type": "iso_certificate" | "test_report" | "quotation" | "other",
      "company_named": string|null, "certificate_number": string|null, "standard": string|null,
      "valid_until": string|null,             // ISO date YYYY-MM-DD if a validity date is printed
      "summary": string }
  ],
  "conflicts": [ { "description": string, "rfx_line": number|null, "sources": [ {"file": string, "location": string, "quote": string} ] } ],   // ONLY contradictions within the vendor's own documents; never differences from the RFx
  "notes": [ string ]                          // anything else the buyer should know (e.g. "subject to artwork approval")
}
"lines" must contain one entry for EVERY RFx line the vendor priced, referred to, or which is unreadable. RFx lines the vendor did not address at all go in "not_quoted" (reason null if no reason given).`;
  }

  function rfxContext(rfx) {
    const rows = rfx.lines.map(l =>
      `${l.line} | ${l.desc} | ${l.ply}-ply | ${l.size} mm | ${l.weightG ?? 'weight not specified'} g | ${l.printing} | ${l.plant} | ${l.qty.toLocaleString('en-IN')} pcs/yr`
    ).join('\n');
    return `BUYER'S RFx (${rfx.id}, ${rfx.title}, ${rfx.period})
Requested price basis: ${rfx.priceBasis}.
RFx lines (line | description | ply | size LxWxH | spec box weight | printing | delivery plant | annual qty):
${rows}

Questionnaire asked: ${rfx.questionnaire.map(q => q.text).join(' / ')}`;
  }

  QP.extractVendor = async function (vendorId, opts = {}) {
    const vs = QP.vendorState(vendorId);
    const rfx = QP.state.rfx;
    if (!vs.files.length) throw new Error('No reply has been added for this vendor yet.');
    const parts = [{ type: 'text', text: rfxContext(rfx) + '\n\nThe vendor reply follows. It may span several files.' }];
    for (const f of vs.files) {
      const prep = await QP.prepareFile(f);
      parts.push(...prep.aiParts);
    }
    parts.push({ type: 'text', text: schemaText() });
    const { data, model, timing } = await QP.callAI({ system: SYSTEM, parts, json: true, signal: opts.signal, onStatus: opts.onStatus });
    if (!data || !Array.isArray(data.lines)) throw new Error('The AI answer was missing the line items. Press Retry.');
    return { data, model, timing };
  };
})();
