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

  const localLS = new Set(["LS10", "LS11", "LS9", "LS8", "LS7", "LS26", "LS27", "LS28"]);
  return localLS.has(outward);
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

  // If user included a postcode anywhere, we store/compute local internally but DON'T tell them
  const foundPc = findPostcodeInText(message);
  if (foundPc) {
    const local = isLocalPostcode(foundPc); // internal only (for later use)

    return reply(
      res,
      "Thanks! What type of rubbish is it?\nHousehold / Business / Trade / Green waste / Single bulky items",
      { postcode: foundPc, local_area: local }
    );
  }

  // If user asks about price/quote/cost, ask for postcode
  const wantsPriceOrQuote =
    lower.includes("how much") ||
    lower.includes("price") ||
    lower.includes("quote") ||
    lower.includes("cost") ||
    lower.includes("charge");

  if (wantsPriceOrQuote) {
    return reply(res, "No problem — what’s your postcode?");
  }

  // If they mention any waste type without giving postcode, ask postcode first
  const mentionsWasteType =
    lower.includes("household") ||
    lower.includes("business") ||
    lower.includes("trade") ||
    lower.includes("green") ||
    lower.includes("garden") ||
    lower.includes("bulky") ||
    lower.includes("single item");

  if (mentionsWasteType) {
    return reply(res, "Thanks — what’s your postcode?");
  }

  // Booking intent
  if (lower.includes("book")) {
    return reply(
      res,
      "You can book instantly using the pink button above. If you want a quick estimate first, tell me your postcode."
    );
  }

  // Default
  return reply(res, "Hi! If you want a quote, tell me your postcode.");
}
