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
  if (!body) return null;

  // common shapes
  const direct =
    body.message ??
    body.text ??
    body.input ??
    body.prompt ??
    body.query ??
    body.question ??
    body.content;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // sometimes message is nested
  if (body.data && typeof body.data === "object") return extractMessage(body.data);

  return null;
}

// --- Postcode helpers ---
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

// internal only (don’t show customer)
function outwardCode(pcNoSpace) {
  return pcNoSpace.slice(0, -3);
}
function isLocalPostcode(pcNoSpace) {
  const outward = outwardCode(pcNoSpace);
  if (outward.startsWith("WF")) return true;
  const localLS = new Set(["LS10", "LS11", "LS9", "LS8", "LS7", "LS26", "LS27", "LS28"]);
  return localLS.has(outward);
}

// --- Waste type + extras detection (simple + safe) ---
function detectWasteType(lower) {
  // match the button words users will type
  if (lower === "household" || lower.includes("household")) return "household";
  if (lower === "business" || lower.includes("business") || lower.includes("commercial"))
    return "business";
  if (lower === "trade" || lower.includes("trade")) return "trade";
  if (
    lower === "green waste" ||
    lower.includes("green waste") ||
    lower.includes("green") ||
    lower.includes("garden")
  )
    return "green_waste";
  if (
    lower.includes("single bulky") ||
    lower.includes("bulky") ||
    lower.includes("single item")
  )
    return "single_bulky_items";

  return "unknown";
}

const EXTRAS_KEYWORDS = [
  "mattress",
  "mattresses",
  "fridge",
  "fridges",
  "freezer",
  "freezers",
  "tyre",
  "tyres",
  "tire",
  "tires",
  "paint",
  "tin of paint",
  "sofa",
  "sofas",
  "armchair",
  "arm chair",
  "arm chairs",
];

function isExtrasAnswer(lower) {
  if (
    lower === "none" ||
    lower === "no" ||
    lower.includes("no extras") ||
    lower.includes("nothing extra")
  )
    return true;

  if (EXTRAS_KEYWORDS.some((k) => lower.includes(k))) return true;

  return false;
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(204).end();

    // IMPORTANT: Always return JSON (never throw)
    if (req.method !== "POST") {
      return reply(res, "Method not allowed", { ok: false });
    }

    const body = req.body || {};
    const message = (extractMessage(body) || "").trim();
    const lower = message.toLowerCase();

    // Debug (helps in Vercel logs)
    console.log("Incoming /chat body:", body);
    console.log("Parsed message:", message);

    if (!message) {
      return reply(res, "No problem — what’s your postcode?");
    }

    // 1) Postcode -> ask waste type
    const pc = findPostcodeInText(message);
    if (pc) {
      const local = isLocalPostcode(pc); // internal only
      return reply(
        res,
        "Thanks! What type of rubbish is it?\nHousehold / Business / Trade / Green waste / Single bulky items",
        { postcode: pc, local_area: local, next_step: "waste_type" }
      );
    }

    // 2) Waste type -> ask extras
    const wasteType = detectWasteType(lower);
    if (wasteType !== "unknown") {
      return reply(
        res,
        "Thanks! Are there any extras?\nMattress, Fridge, Freezer, Car tyres, Tin of paint, Sofas, Arm chairs.\nPlease tell me how many of each (or say “none”).",
        { waste_type: wasteType, next_step: "extras" }
      );
    }

    // 3) Extras answer -> ask photos
    if (isExtrasAnswer(lower)) {
      return reply(
        res,
        "Thanks! Please upload 1–3 photos of the rubbish (or type a short description) and we’ll estimate it.",
        { next_step: "photos" }
      );
    }

    // 4) Price/quote -> ask postcode
    const wantsPrice =
      lower.includes("how much") ||
      lower.includes("price") ||
      lower.includes("quote") ||
      lower.includes("cost") ||
      lower.includes("charge");

    if (wantsPrice) {
      return reply(res, "No problem — what’s your postcode?");
    }

    // Default
    return reply(res, "If you want a quote, tell me your postcode.");
  } catch (err) {
    console.error("CHAT ERROR:", err);
    // Never break the widget
    return reply(res, "Sorry — please try again.", { ok: false });
  }
}
