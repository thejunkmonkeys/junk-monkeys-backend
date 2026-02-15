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

// Extract message from different payload shapes
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

// Normalize + validate UK postcode (simple)
function normalizePostcode(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase().trim().replace(/\s+/g, "");
  const m = s.match(/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/);
  return m ? s : null;
}

// Find a postcode anywhere in a sentence
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
  const outward = outwardCode(pcNoSpace); // e.g. WF1, LS10, LS27
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

  // 1) If user included a postcode anywhere, classify it
  const foundPc = findPostcodeInText(message);
  if (foundPc) {
    const local = isLocalPostcode(foundPc);

    if (local) {
      return reply(
        res,
        `Thanks! ✅ ${foundPc} is in our local area.\nWhat are we removing? (Household / Garden waste / Business waste / Single item)`,
        { postcode: foundPc, local_area: true }
      );
    }

    return reply(
      res,
      `Thanks! ℹ️ ${foundPc} is outside our local area.\nFor now, please use the booking button above or contact us, and we’ll confirm availability.\nWhat are we removing? (Household / Garden waste / Business waste / Single item)`,
      { postcode: foundPc, local_area: false }
    );
  }

  // 2) If user asks about price/quote/cost, ALWAYS ask postcode
  const wantsPriceOrQuote =
    lower.includes("how much") ||
    lower.includes("price") ||
    lower.includes("quote") ||
    lower.includes("cost") ||
    lower.includes("charge");

  if (wantsPriceOrQuote) {
    return reply(res, "No problem — what’s your postcode? (e.g. WF1 1AA or LS10 1AB)");
  }

  // 3) Booking intent
  if (lower.includes("book")) {
    return reply(
      res,
      "You can book instantly using the pink button above. If you want a quick estimate first, tell me your postcode."
    );
  }

  // 4) Garden mention → ask postcode
  if (lower.includes("garden")) {
    return reply(res, "We offer garden waste clearance. What’s your postcode so I can confirm if you’re local?");
  }

  // Default
  return reply(res, "Hi! Ask for a quote (tell me your postcode), or click ‘Get A Quote Or Book Now’ above.");
}



