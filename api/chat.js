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

function extractMessage(body) {
  if (!body) return null;

  if (typeof body === "string") return body.trim() || null;

  const direct =
    body.message ??
    body.text ??
    body.input ??
    body.prompt ??
    body.query ??
    body.question ??
    body.content;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const msgs = body.messages ?? body.chat ?? body.history ?? body.conversation;
  if (Array.isArray(msgs) && msgs.length) {
    const last = msgs[msgs.length - 1];
    if (typeof last === "string") return last.trim() || null;
    if (typeof last?.content === "string") return last.content.trim() || null;
    if (typeof last?.text === "string") return last.text.trim() || null;
    if (typeof last?.message === "string") return last.message.trim() || null;
  }

  if (body.data && typeof body.data === "object") return extractMessage(body.data);

  return null;
}

function getMessagesArray(body) {
  const msgs = body?.messages ?? body?.chat ?? body?.history ?? body?.conversation;
  return Array.isArray(msgs) ? msgs : [];
}

function lastAssistantText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = (m?.role || m?.type || "").toString().toLowerCase();
    const content = (m?.content ?? m?.text ?? m?.message ?? "").toString();
    if ((role === "assistant" || role === "bot") && content) return content;
  }
  return "";
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

// Keep this internal for later (don’t show customer)
function outwardCode(pcNoSpace) {
  return pcNoSpace.slice(0, -3);
}

function isLocalPostcode(pcNoSpace) {
  const outward = outwardCode(pcNoSpace);
  if (outward.startsWith("WF")) return true;
  const localLS = new Set(["LS10", "LS11", "LS9", "LS8", "LS7", "LS26", "LS27", "LS28"]);
  return localLS.has(outward);
}

// --- Flow helpers ---
function detectWasteType(lower) {
  if (lower.includes("house")) return "household";
  if (lower.includes("business") || lower.includes("commercial")) return "business";
  if (lower.includes("trade")) return "trade";
  if (lower.includes("green") || lower.includes("garden")) return "green_waste";
  if (
    lower.includes("bulky") ||
    lower.includes("single bulky") ||
    lower.includes("single item")
  ) {
    return "single_bulky_items";
  }
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

function looksLikeExtrasAnswer(lower) {
  if (
    lower === "no" ||
    lower === "none" ||
    lower.includes("no extras") ||
    lower.includes("nothing extra")
  ) {
    return true;
  }

  if (EXTRAS_KEYWORDS.some((k) => lower.includes(k))) return true;

  return false;
}

function isGreeting(lower) {
  return [
    "hi",
    "hello",
    "hey",
    "hiya",
    "good morning",
    "good afternoon",
    "good evening",
  ].includes(lower.trim());
}

function getFaqReply(lower) {
  if (
    lower.includes("sofa") ||
    lower.includes("sofas") ||
    lower.includes("mattress") ||
    lower.includes("fridge") ||
    lower.includes("freezer") ||
    lower.includes("garden waste") ||
    lower.includes("green waste") ||
    lower.includes("house clearance") ||
    lower.includes("commercial waste")
  ) {
    return "Yes, we can usually help with that. If you'd like, I can give you a quick quote.";
  }

  if (
    lower.includes("area") ||
    lower.includes("areas") ||
    lower.includes("cover") ||
    lower.includes("postcode")
  ) {
    return "Send me your postcode and I’ll point you in the right direction for a quote.";
  }

  if (
    lower.includes("same day") ||
    lower.includes("today") ||
    lower.includes("urgent")
  ) {
    return "We may be able to help, depending on availability. If you'd like a quick quote, send me your postcode.";
  }

  if (
    lower.includes("book online") ||
    lower.includes("booking") ||
    lower.includes("book a collection")
  ) {
    return "You can book online using the pink button above. If you'd like a quick quote first, just send me your postcode.";
  }

  return null;
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return reply(res, "Method not allowed", { ok: false });
  }

  const body = req.body || {};
  const message = (extractMessage(body) || "").trim();
  const lower = message.toLowerCase();

  const messages = getMessagesArray(body);
  const lastBot = (lastAssistantText(messages) || "").toLowerCase();

  const botAskedWasteType =
    lastBot.includes("what type of rubbish") ||
    lastBot.includes("household / business") ||
    lastBot.includes("single bulky");

  const botAskedExtras =
    lastBot.includes("any extras") ||
    lastBot.includes("mattress") ||
    lastBot.includes("fridge") ||
    lastBot.includes("freezer") ||
    lastBot.includes("car tyres") ||
    lastBot.includes("tin of paint") ||
    lastBot.includes("sofas") ||
    lastBot.includes("arm chairs");

  // 1) Greeting / first message
  if (!message || isGreeting(lower)) {
    return reply(res, "Hi 👋 How can I help you today?");
  }

  // 2) If user includes postcode -> ask waste type
  const foundPc = findPostcodeInText(message);
  if (foundPc) {
    const local = isLocalPostcode(foundPc); // internal only
    return reply(
      res,
      "Thanks. What type of rubbish do you have?\nHousehold / Business / Trade / Green waste / Single bulky items",
      { postcode: foundPc, local_area: local, next_step: "waste_type" }
    );
  }

  // 3) If bot asked waste type, and user answers with one -> ask extras
  const wasteType = detectWasteType(lower);

  if ((botAskedWasteType && wasteType !== "unknown") || wasteType !== "unknown") {
    return reply(
      res,
      "Thanks. Do you have any extras?\nMattress, Fridge, Freezer, Car tyres, Tin of paint, Sofas, Arm chairs.\nPlease tell me how many of each, or say none.",
      { waste_type: wasteType, next_step: "extras" }
    );
  }

  // 4) If bot asked extras, and user replies with extras/none -> ask for photos
  if (botAskedExtras && looksLikeExtrasAnswer(lower)) {
    return reply(
      res,
      "Great. Please upload 1–3 photos of the rubbish and we’ll estimate it.",
      { next_step: "photos" }
    );
  }

  // Also allow extras answers even if history missing
  if (looksLikeExtrasAnswer(lower)) {
    return reply(
      res,
      "Great. Please upload 1–3 photos of the rubbish and we’ll estimate it.",
      { next_step: "photos" }
    );
  }

  // 5) Quote intent -> ask postcode
  const wantsPriceOrQuote =
    lower.includes("how much") ||
    lower.includes("price") ||
    lower.includes("quote") ||
    lower.includes("cost") ||
    lower.includes("charge") ||
    lower.includes("estimate");

  if (wantsPriceOrQuote) {
    return reply(res, "Sure 👍 What’s the postcode for the collection?");
  }

  // 6) Booking intent
  if (lower.includes("book")) {
    return reply(
      res,
      "No problem — would you like a quick quote first, or are you ready to book?"
    );
  }

  // 7) Basic FAQ handling
  const faqReply = getFaqReply(lower);
  if (faqReply) {
    return reply(res, faqReply);
  }

  // 8) Default fallback
  return reply(
    res,
    "Hi 👋 How can I help you today? You can ask a question or request a quote."
  );
}
