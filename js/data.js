// Demo data for Sahyadri Foods (all fictional).
// RFX_SEED = the prepared RFx, used ONLY by the labelled backup button in stage 1 ("Load prepared RFx — skips the AI").
// lastYear / supplier2026 are PRIVATE: never sent to vendors or to the extraction AI.
window.QP = window.QP || {};

QP.COMPANY = {
  name: 'Sahyadri Foods Pvt. Ltd.',
  address: 'Office 402, Kalyani Business Park, Baner, Pune 411045',
  buyer: 'Priya Deshmukh, Packaging Category Manager',
  email: 'priya.deshmukh@sahyadrifoods.example',
  plants: ['Ranjangaon (Pune)', 'Jejuri (Pune)', 'Sinnar (Nashik)'],
  plantAddresses: {
    'Ranjangaon (Pune)': 'Plot B-17, Ranjangaon MIDC, Shirur, Pune 412220',
    'Jejuri (Pune)': 'Plot C-5, Jejuri MIDC, Purandar, Pune 412303',
    'Sinnar (Nashik)': 'Plot F-41, Sinnar MIDC, Nashik 422103'
  },
  gstin: '27AAKCS4821M1Z6',
  phone: '+91 98220 00000',
  standardPaymentDays: 60
};

QP.COMPANY_DEFAULT = JSON.parse(JSON.stringify(QP.COMPANY));   // edits (Company profile → Edit) are stored in QP.state.company

// Stage 1 demo inputs (Priya's own material). The AI structures these; nothing below is an AI answer.
QP.SAMPLE_CONTRACT_FILE = 'samples/rfx/Sahyadri_Box_Contract_2026.xlsx';
QP.SAMPLE_BRIEF = `Renewing our box contract for 1 Jan 2027 to 31 Dec 2027. Use last year's contract (attached) as the base.

Changes for 2027:
- Keep the same specs, plants and annual quantities as 2026 for all continuing lines.
- Drop the pickle jar carton (Line 25). We stopped the glass jar range.
- Add 2 new sizes:
  1. Makhana snack shipper, 5-ply, 460 x 340 x 300 mm, 2-colour flexo print, 46,000 pcs a year, delivered to Ranjangaon.
  2. Quick-commerce small box, 3-ply, 300 x 200 x 150 mm, 1-colour flexo print, box weight 160 g, 60,000 pcs a year, delivered to Ranjangaon.

Commercials: prices in Rs per piece, landed at plant, excluding GST. Our standard is 60 days payment from GRN. Quote validity at least 90 days. Any foreign-currency quote will be converted at 1 USD = Rs 88.00.

Need vendors to confirm: ISO 9001 (with certificate), monthly capacity, box compression/bursting test report, food-safe inks for printed boxes.

Quotes due 23 Nov 2026.`;

QP.RFX_SEED = {
  id: 'SF/RFX/2027/003',
  title: 'Corrugated boxes — annual contract 2027',
  period: '1 Jan 2027 – 31 Dec 2027',
  contractEnd: '2027-12-31',
  dueDate: '2026-11-23',
  priceBasis: 'Rs per piece, landed at plant, excluding GST',
  fxRates: { USD: 88.0 },
  gstRate: 0.05,
  paymentDaysStandard: 60,
  minValidityDays: 90,
  questionnaire: [
    { id: 'iso_9001', text: 'Do you hold ISO 9001 certification? Attach the certificate.', mustPass: true },
    { id: 'monthly_capacity', text: 'What is your monthly production capacity (boxes per month)?', mustPass: true },
    { id: 'test_report', text: 'Attach a box compression / bursting strength test report.', mustPass: true },
    { id: 'food_safe_inks', text: 'Do you use food-safe inks for printed boxes?', mustPass: true },
    { id: 'box_weight', text: 'Confirm box weights match our specification.', mustPass: false }
  ],
  lines: [
 {
  "line": 1,
  "code": "PKG-CB-001",
  "desc": "Chips master shipper",
  "use": "Potato chips 52g x 48",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "520x360x330",
  "weightG": 545,
  "printing": "1-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 93000,
  "lastYear": 21.43,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 2,
  "code": "PKG-CB-002",
  "desc": "Chips master shipper",
  "use": "Potato chips 52g x 48",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "520x360x330",
  "weightG": 545,
  "printing": "1-colour flexo",
  "plant": "Sinnar (Nashik)",
  "qty": 82000,
  "lastYear": 21.21,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 3,
  "code": "PKG-CB-003",
  "desc": "Chips family-pack shipper",
  "use": "Chips 150g x 24",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "560x380x300",
  "weightG": 575,
  "printing": "1-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 49000,
  "lastYear": 23.03,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 4,
  "code": "PKG-CB-004",
  "desc": "Namkeen shipper",
  "use": "Namkeen 200g x 40",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "480x320x280",
  "weightG": 770,
  "printing": "1-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 70000,
  "lastYear": 31.16,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 5,
  "code": "PKG-CB-005",
  "desc": "Namkeen shipper",
  "use": "Namkeen 200g x 40",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "480x320x280",
  "weightG": 770,
  "printing": "1-colour flexo",
  "plant": "Sinnar (Nashik)",
  "qty": 58000,
  "lastYear": 32.04,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 6,
  "code": "PKG-CB-006",
  "desc": "Namkeen 1kg shipper",
  "use": "Namkeen 1kg x 12",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "450x340x300",
  "weightG": 810,
  "printing": "2-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 36000,
  "lastYear": 33.74,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 7,
  "code": "PKG-CB-007",
  "desc": "5 Ply Brown Box",
  "use": "General bulk, namkeen & masala",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "400x300x250",
  "weightG": 620,
  "printing": "Plain brown",
  "plant": "Ranjangaon (Pune)",
  "qty": 91000,
  "lastYear": 24.75,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 8,
  "code": "PKG-CB-008",
  "desc": "5 Ply Brown Box",
  "use": "General bulk, namkeen & masala",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "400x300x250",
  "weightG": 620,
  "printing": "Plain brown",
  "plant": "Sinnar (Nashik)",
  "qty": 68000,
  "lastYear": 25.43,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 9,
  "code": "PKG-CB-009",
  "desc": "Masala 100g carton shipper",
  "use": "Masala mono-cartons 100g x 96",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "420x310x260",
  "weightG": 670,
  "printing": "2-colour flexo",
  "plant": "Jejuri (Pune)",
  "qty": 84000,
  "lastYear": 27.51,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 10,
  "code": "PKG-CB-010",
  "desc": "Masala 50g carton shipper",
  "use": "Masala mono-cartons 50g x 144",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "380x290x240",
  "weightG": 570,
  "printing": "2-colour flexo",
  "plant": "Jejuri (Pune)",
  "qty": 75000,
  "lastYear": 24.08,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 11,
  "code": "PKG-CB-011",
  "desc": "Masala pouch shipper",
  "use": "Masala pouches 200g x 50",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "440x330x270",
  "weightG": 740,
  "printing": "1-colour flexo",
  "plant": "Jejuri (Pune)",
  "qty": 61000,
  "lastYear": 29.96,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 12,
  "code": "PKG-CB-012",
  "desc": "Whole spice 1kg shipper",
  "use": "Whole spices 1kg x 10",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "400x320x300",
  "weightG": 720,
  "printing": "1-colour flexo",
  "plant": "Jejuri (Pune)",
  "qty": 39000,
  "lastYear": 29.2,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 13,
  "code": "PKG-CB-013",
  "desc": "Spice bulk carton 10kg",
  "use": "Chilli / turmeric powder 10kg",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "420x300x320",
  "weightG": 720,
  "printing": "Plain brown",
  "plant": "Jejuri (Pune)",
  "qty": 34000,
  "lastYear": 29.39,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 14,
  "code": "PKG-CB-014",
  "desc": "Spice bulk carton 25kg",
  "use": "Bulk spice powder 25kg, B2B",
  "ply": 7,
  "board": "7-ply, 1150 GSM, BCB-flute",
  "size": "500x380x420",
  "weightG": 1650,
  "printing": "Plain brown",
  "plant": "Jejuri (Pune)",
  "qty": 21000,
  "lastYear": 74.02,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 15,
  "code": "PKG-CB-015",
  "desc": "Export carton 7 ply",
  "use": "Export masala 100g x 192",
  "ply": 7,
  "board": "7-ply, 1150 GSM, BCB-flute",
  "size": "560x400x380",
  "weightG": 1755,
  "printing": "2-colour flexo",
  "plant": "Jejuri (Pune)",
  "qty": 17000,
  "lastYear": 76.28,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 16,
  "code": "PKG-CB-016",
  "desc": "Export carton 7 ply",
  "use": "Export namkeen 400g x 30",
  "ply": 7,
  "board": "7-ply, 1150 GSM, BCB-flute",
  "size": "600x420x400",
  "weightG": 1955,
  "printing": "2-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 13000,
  "lastYear": 85.39,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 17,
  "code": "PKG-CB-017",
  "desc": "Small pack shipper 3 ply",
  "use": "Chips 25g x 96",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "480x330x300",
  "weightG": 460,
  "printing": "1-colour flexo",
  "plant": "Sinnar (Nashik)",
  "qty": 79000,
  "lastYear": 18.48,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 18,
  "code": "PKG-CB-018",
  "desc": "Small pack shipper 3 ply",
  "use": "Chips 25g x 96",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "480x330x300",
  "weightG": 460,
  "printing": "1-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 86000,
  "lastYear": 18.82,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 19,
  "code": "PKG-CB-019",
  "desc": "Biscuit-style snack shipper",
  "use": "Baked snacks 75g x 60",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "460x310x250",
  "weightG": 690,
  "printing": "1-colour flexo",
  "plant": "Sinnar (Nashik)",
  "qty": 45000,
  "lastYear": 28.82,
  "supplier2026": "Deccan Corrugators"
 },
 {
  "line": 20,
  "code": "PKG-CB-020",
  "desc": "Gift hamper outer",
  "use": "Festive hamper outer",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "450x350x200",
  "weightG": 705,
  "printing": "4-colour",
  "plant": "Ranjangaon (Pune)",
  "qty": 15000,
  "lastYear": 30.73,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 21,
  "code": "PKG-CB-021",
  "desc": "Gift hamper outer",
  "use": "Festive hamper outer",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "450x350x200",
  "weightG": 705,
  "printing": "4-colour",
  "plant": "Jejuri (Pune)",
  "qty": 11000,
  "lastYear": 31.73,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 22,
  "code": "PKG-CB-022",
  "desc": "Display tray shipper",
  "use": "Retail display tray, masala",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "400x300x150",
  "weightG": 285,
  "printing": "4-colour",
  "plant": "Jejuri (Pune)",
  "qty": 27000,
  "lastYear": 12.81,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 23,
  "code": "PKG-CB-023",
  "desc": "E-commerce mailer box",
  "use": "Online orders, mixed SKUs",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "350x250x200",
  "weightG": 245,
  "printing": "2-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 40000,
  "lastYear": 10.56,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 24,
  "code": "PKG-CB-024",
  "desc": "E-commerce mailer box",
  "use": "Online orders, mixed SKUs",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "350x250x200",
  "weightG": 245,
  "printing": "2-colour flexo",
  "plant": "Jejuri (Pune)",
  "qty": 25000,
  "lastYear": 10.23,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 25,
  "code": "PKG-CB-026",
  "desc": "Heavy-duty 5 ply",
  "use": "Papad & fryums 5kg",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "500x400x350",
  "weightG": 1080,
  "printing": "Plain brown",
  "plant": "Sinnar (Nashik)",
  "qty": 32000,
  "lastYear": 43.26,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 26,
  "code": "PKG-CB-027",
  "desc": "Heavy-duty 5 ply",
  "use": "Papad & fryums 5kg",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "500x400x350",
  "weightG": 1080,
  "printing": "Plain brown",
  "plant": "Ranjangaon (Pune)",
  "qty": 28000,
  "lastYear": 43.77,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 27,
  "code": "PKG-CB-028",
  "desc": "Inter-plant transfer box 7 ply",
  "use": "Semi-finished goods transfer",
  "ply": 7,
  "board": "7-ply, 1150 GSM, BCB-flute",
  "size": "600x450x450",
  "weightG": 2210,
  "printing": "Plain brown",
  "plant": "Ranjangaon (Pune)",
  "qty": 20000,
  "lastYear": 99.08,
  "supplier2026": "Maharashtra Kraft Pack"
 },
 {
  "line": 28,
  "code": "PKG-CB-029",
  "desc": "Sample & trade kit carton",
  "use": "Sales samples kit",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "300x220x180",
  "weightG": 190,
  "printing": "4-colour",
  "plant": "Ranjangaon (Pune)",
  "qty": 9000,
  "lastYear": 9.27,
  "supplier2026": "Shree Ganesh Packaging"
 },
 {
  "line": 29,
  "code": "PKG-CB-030",
  "desc": "Makhana snack shipper",
  "use": "Makhana snacks (new 2027)",
  "ply": 5,
  "board": "5-ply, 785 GSM, BC-flute",
  "size": "460x340x300",
  "weightG": 820,
  "printing": "2-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 46000,
  "lastYear": null,
  "supplier2026": null
 },
 {
  "line": 30,
  "code": "PKG-CB-031",
  "desc": "Quick-commerce small box",
  "use": "Quick-commerce orders (new 2027)",
  "ply": 3,
  "board": "3-ply, 440 GSM, B-flute",
  "size": "300x200x150",
  "weightG": 160,
  "printing": "1-colour flexo",
  "plant": "Ranjangaon (Pune)",
  "qty": 60000,
  "lastYear": null,
  "supplier2026": null
 }
]
};

QP.VENDORS = [
  { id: 'A', email: 'rakesh@shreeganeshpack.example', name: 'Shree Ganesh Packaging', contact: 'Rakesh Kulkarni', status2026: 'Incumbent',
    samples: ['Quotation SGP-Q-311.xlsx', 'ISO 9001 Certificate.pdf', 'Test Report BCT.pdf'] },
  { id: 'B', email: 'anand.joshi@deccancorrugators.example', name: 'Deccan Corrugators', contact: 'Anand Joshi', status2026: 'Incumbent',
    samples: ['DC-SF-1142 Quotation.pdf', 'ISO 9001-2015 Certificate.pdf', 'Test Report.pdf'] },
  { id: 'C', email: 'vikram.shah@packriteasia.example', name: 'PackRite Asia', contact: 'Vikram Shah', status2026: 'New',
    samples: ['PRA-IN-2026-0457 Sahyadri Proposal.docx', 'ISO Certificate Sanand Works.pdf', 'Lab Test Report.pdf'] },
  { id: 'D', email: 'sandeep@omsaiboxworks.example', name: 'Om Sai Box Works', contact: 'Sandeep More', status2026: 'New',
    samples: ['IMG_20261121_104512.jpg'] },
  { id: 'E', email: 'mahesh@mkraftpack.example', name: 'Maharashtra Kraft Pack', contact: 'Mahesh Patil', status2026: 'Incumbent',
    samples: [] , pasteSample: 'email.txt' }
];

// Internal supplier performance Jan–Oct 2026 (fictional). Information only; never changes rupee totals.
QP.VENDOR_HISTORY = {
  A: { deliveries: 412, onTime: 0.94, rejection: 0.008, complaints: 1, note: 'Reliable; slightly higher prices' },
  B: { deliveries: 538, onTime: 0.88, rejection: 0.015, complaints: 3, note: 'Delays during monsoon (Jul–Aug)' },
  E: { deliveries: 367, onTime: 0.91, rejection: 0.021, complaints: 4, note: 'Weight variation complaints on 5-ply' },
  C: null, D: null
};
