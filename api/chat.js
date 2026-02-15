function setCors(req, res) {
  const allowed = new Set([
    "https://thejunkmonkeys.co.uk",
    "https://www.thejunkmonkeys.co.uk",
  ]);

  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-TJM-Token");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function reply(res, text, extra = {}) {
  return res.status(200).json({
    ok: true,
    reply: text,
    text,
    message: text,
    ...extra,
  });
}

function extractMessage(body) {
  if (!body) return "";

  if (typeof body === "string") return body.trim();

  const direct =
    body.message ??
    body.text ??
    body.input ??
    body.prompt ??
    body.query ??
    body.question ??
    body.content;

  if (typeof direct === "string") return direct.trim();

  // sometimes nested
  if (body.data && typeof body.data === "object") return extractMessage(body.data);

  return "";
}

// --- postcode helpers (internal use only)
function normalizePostcode(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase().trim().replace(/\s+/g, "");
  const m = s.match(/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/);
  return m ? s : null;
}

function findPostcodeInText(text) {
  if (!text) return null;
  const s = text.toUpperCase().replace(/\s+/g, "");
  const m = s.match(/[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}/);
  return m ? normalizePostcode(m[0]) : null;
}

function detectWasteType(lower) {
  if (lower.includes("household")) return "household";
  if (lower.includes("business") || lower.includes("commercial")) return "business";
  if (lower.includes("trade")) return "trade";
  if (lower.includes("green") || lower.includes("garden")) return "green_waste";
  if (lower.includes("bulky") || lower.includes("single")) return "single_bulky_items";
  return "unknown";
}

const EXTRAS_KEYWORDS = [
  "mattress",
  "fridge",
  "freezer",
  "tyre",
  "tire",
  "paint",
  "sofa",
  "armchair",
  "arm chair",
];

function isExtrasAnswer(lower) {
  if (lower === "none" || lower === "no" || lower.includes("no extras")) return true;
  return EXTRAS_KEYWORDS.some((k) => lower.includes(k));
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "POST") {
      return reply(res, "Method not allowed", { ok: false });
    }

    const body = req.body || {};
    const message = extractMessage(body);
    const lower = (message || "").toLowerCase();

    // Always respond even if message missing
    if (!message) {
      return reply(res, "No problem — what’s your postcode?");
    }

    // If message contains a postcode -> ask waste type
    const pc = findPostcodeInText(message);
    if (pc) {
      return reply(
        res,
        "Thanks! What type of rubbish is it?\nHousehold / Business / Trade / Green waste / Single bulky items",
        { next_step: "waste_type" }
      );
    }

    // If message looks like waste type -> ask extras
    const wasteType = detectWasteType(lower);
    if (wasteType !== "unknown") {
      return reply(
        res,
        "Thanks! Are there any extras?\nMattress, Fridge, Freezer, Car tyres, Tin of paint, Sofas, Arm chairs.\nPlease tell me how many of each (or say “none”).",
        { next_step: "extras", waste_type: wasteType }
      );
    }

    // If message looks like extras answer -> ask photos
    if (isExtrasAnswer(lower)) {
      return reply(
        res,
        "Thanks! Please upload 1–3 photos of the rubbish (or type a short description) and we’ll estimate it.",
        { next_step: "photos" }
      );
    }

    // Price intent -> ask postcode
    if (
      lower.includes("how much") ||
      lower.includes("price") ||
      lower.includes("quote") ||
      lower.includes("cost") ||
      lower.includes("charge")
    ) {
      return reply(res, "No problem — what’s your postcode?");
    }

    // Default
    return reply(res, "If you want a quote, tell me your postcode.");
  } catch (e) {
    // Never let the widget “fail to fetch”
    return res.status(200).json({
      ok: false,
      reply: "Sorry — please try again.",
      text: "Sorry — please try again.",
      message: "Sorry — please try again.",
    });
  }
}
