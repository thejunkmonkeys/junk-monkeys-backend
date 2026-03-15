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

function outwardCode(pcNoSpace) {
  return pcNoSpace.slice(0, -3);
}

function isLocalPostcode(pcNoSpace) {
  const outward = outwardCode(pcNoSpace);
  if (outward.startsWith("WF")) return true;
  const localLS = new Set(["LS10","LS11","LS9","LS8","LS7","LS26","LS27","LS28"]);
  return localLS.has(outward);
}

function detectWasteType(lower) {
  if (lower.includes("house")) return "household";
  if (lower.includes("business") || lower.includes("commercial")) return "business";
  if (lower.includes("trade")) return "trade";
  if (lower.includes("green") || lower.includes("garden")) return "green_waste";
  if (lower.includes("bulky") || lower.includes("single item")) return "single_bulky_items";
  return "unknown";
}

const EXTRAS_KEYWORDS = [
  "mattress","fridge","freezer","tyre","paint","sofa","armchair"
];

function looksLikeExtrasAnswer(lower) {
  if (
    lower === "no" ||
    lower === "none" ||
    lower.includes("no extras") ||
    lower.includes("nothing extra")
  ) return true;

  if (EXTRAS_KEYWORDS.some((k) => lower.includes(k))) return true;

  return false;
}

function isGreeting(lower) {
  return [
    "hi","hello","hey","hiya","good morning","good afternoon","good evening"
  ].includes(lower.trim());
}

function getFaqReply(lower) {
  if (
    lower.includes("how do your services work") ||
    lower.includes("how does it work") ||
    lower.includes("how do you work") ||
    lower.includes("how does your service work") ||
    lower.includes("how does rubbish removal work")
  ) {
    return "You can book a collection through our online booking portal. On the day of collection our team will call to arrange a time. We arrive in an 18 cubic yard truck, load the rubbish for you, and take it away for responsible disposal.";
  }

  if (
    lower.includes("what areas") ||
    lower.includes("which areas") ||
    lower.includes("areas do you cover") ||
    lower.includes("do you cover") ||
    lower.includes("coverage") ||
    lower.includes("locations")
  ) {
    return "We cover most locations across the country. Send me your postcode and I’ll point you in the right direction for a quote.";
  }

  if (
    lower.includes("time") ||
    lower.includes("open") ||
    lower.includes("hours") ||
    lower.includes("opening")
  ) {
    return "We operate Monday to Friday, 7am – 5pm. If you'd like a quote, just send me your postcode.";
  }

  if (
    lower.includes("same day") ||
    lower.includes("today") ||
    lower.includes("urgent")
  ) {
    return "We may be able to offer same-day collection depending on availability. Send me your postcode and I can help with a quote.";
  }

  if (
    lower.includes("what do you take") ||
    lower.includes("what waste") ||
    lower.includes("what rubbish do you take")
  ) {
    return "We usually collect household rubbish, furniture, garden waste, bulky items and some commercial waste. If you'd like a quote, just send your postcode.";
  }

  if (lower.includes("sofa")) {
    return "Yes, we can usually collect sofas. If you'd like, I can give you a quick quote.";
  }

  if (lower.includes("mattress")) {
    return "Yes, we can usually collect mattresses. If you'd like, I can give you a quick quote.";
  }

  if (lower.includes("fridge") || lower.includes("freezer")) {
    return "Yes, we can usually collect fridges and freezers. If you'd like, I can give you a quick quote.";
  }

  if (lower.includes("garden waste")) {
    return "Yes, we can usually collect garden waste. If you'd like, I can give you a quick quote.";
  }

  if (lower.includes("book")) {
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
    lastBot.includes("what type of rubbish");

  const botAskedExtras =
    lastBot.includes("any extras") ||
    lastBot.includes("mattress") ||
    lastBot.includes("fridge") ||
    lastBot.includes("sofa");

  if (!message || isGreeting(lower)) {
    return reply(res, "Hi 👋 How can I help you today?");
  }

  const foundPc = findPostcodeInText(message);
  if (foundPc) {
    const local = isLocalPostcode(foundPc);
    return reply(
      res,
      "Thanks! What type of rubbish do you have?\nHousehold / Business / Trade / Green waste / Single bulky items",
      { postcode: foundPc, local_area: local, next_step: "waste_type" }
    );
  }

  const wasteType = detectWasteType(lower);

  if ((botAskedWasteType && wasteType !== "unknown") || wasteType !== "unknown") {
    return reply(
      res,
      "Thanks! Are there any extras?\nMattress, Fridge, Freezer, Car tyres, Tin of paint, Sofas, Arm chairs.\nTell me how many of each (or say none).",
      { waste_type: wasteType, next_step: "extras" }
    );
  }

  if (botAskedExtras && looksLikeExtrasAnswer(lower)) {
    return reply(
      res,
      "Great. Please upload 1–3 photos of the rubbish and we’ll estimate it.",
      { next_step: "photos" }
    );
  }

  if (looksLikeExtrasAnswer(lower)) {
    return reply(
      res,
      "Great. Please upload 1–3 photos of the rubbish and we’ll estimate it.",
      { next_step: "photos" }
    );
  }

  const wantsPriceOrQuote =
    lower.includes("how much") ||
    lower.includes("price") ||
    lower.includes("quote") ||
    lower.includes("cost") ||
    lower.includes("charge");

  if (wantsPriceOrQuote) {
    return reply(res, "Sure 👍 What’s the postcode for the collection?");
  }

  const faqReply = getFaqReply(lower);
  if (faqReply) {
    return reply(res, faqReply);
  }

  return reply(
    res,
    "Sorry, I can't answer that at the moment. Please call us on 07841 669084.\n\nOur team is available Monday to Friday, 7am – 5pm."
  );
}