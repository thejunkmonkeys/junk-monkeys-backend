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

// Extract message from different possible payload shapes
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

// Read conversation history if plugin sends it
function getMessagesArray(body) {
  const msgs = body?.messages ?? body?.chat ?? body?.history ?? body?.conversation;
  return Array.isArray(msgs) ? msgs : [];
}

function lastAssistantText(messages) {
  // Try to find the most recent assistant/bot reply in the history
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = (m?.role || m?.type || "").toString().toLowerCase();
    const content = (m?.content ?? m?.text ?? m?.message ?? "").toString();
    if ((role === "assistant" || role === "bot") && content) return content;
  }
  return "";
}

function normalizePostcode(raw) {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/\s+/g, "").trim();
  // Rough UK postcode pattern (good enough for routing)
  // Examples: WF1 1AA, LS10 1AB, LS9 8ZZ, etc.
  const match = s.match(/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/);
  return match ? s : null;
}

function outwardCode(pcNoSpace) {
  // Outward code = everything before the last 3 chars (inward)
  // e.g. LS101AB -> LS10
  return pcNoSpace.slice(0, -3);
}

function isLocalPostcode(pcNoSpace) {
  const outward = outwardCode(pcNoSpace); // e.g. WF1, LS10, LS9, LS27
  if (outward.startsWith("WF")) return true;

  const localLS = new Set(["LS10", "LS11", "LS9", "LS8", "LS7", "LS26", "LS27", "LS28"]);
  if (localLS.has(outward)) return true;

  return false;
}

function reply(res, text, extra = {}) {
  // Return multiple keys so the plugin accepts it
  return res.status(200).json({
    ok: true,
    reply: text,
    text,
    message: text,
    ...extra,
  });
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: false,
      reply: "Method not allowed",
      text: "Method not allowed",
      message: "Method not allowed",
    });
  }

  const body = req.body || {};
  const message = extractMessage(body) || "";
  const messages = getMessagesArray(body);
  const lastBot = (lastAssistantText(messages) || "").toLowerCase();
  const lower = message.toLowerCase();

  // --- Step detection based on what the bot asked last ---
  const botAskedPostcode =
    lastBot.includes("postcode") || lastBot.includes("post code");

  const botAskedWasteType =
    lastBot.includes("what are we removing") ||
    lastBot.includes("household") ||
    lastBot.includes("garden waste") ||
    lastBot.includes("business waste") ||
    lastBot.includes("single item");

  const botAskedSize =
    lastBot.includes("rough size") ||
    lastBot.includes("small van") ||
    lastBot.includes("medium") ||
    lastBot.includes("large") ||
    lastBot.includes("not sure");

  const botAskedPhotos =
    lastBot.includes("upload") ||
    lastBot.includes("photos") ||
    lastBot.includes("photo");

  // --- 1) If user is answering postcode ---
  if (botAskedPostcode) {
    const pc = normalizePostcode(message);
    if (!pc) {
      return reply(res, "What’s your postcode? (e.g. WF1 1AA or LS10 1AB)");
    }

    const local = isLocalPostcode(pc);

    if (local) {
      return reply(
        res,
        `Thanks! ✅ ${pc} is in our local area.\nWhat are we removing? (Household / Garden waste / Business waste / Single item)`,
        { local_area: true, postcode: pc }
      );
    }

    return reply(
      res,
      `Thanks! ℹ️ ${pc} is outside our local area.\nFor now, please use the booking button above or contact us, and we’ll confirm availability.\nWhat are we removing? (Household / Garden waste / Business waste / Single item)`,
      { local_area: false, postcode: pc }
    );
  }

  // --- 2) If user is answering waste type ---
  if (botAskedWasteType) {
    // Simple classify
    let wasteType = "other";
    if (lower.includes("house")) wasteType = "household";
    else if (lower.includes("garden")) wasteType = "garden";
    else if (lower.includes("business") || lower.includes("commercial")) wasteType = "business";
    else if (lower.includes("single") || lower.includes("sofa") || lower.includes("fridge") || lower.includes("mattress"))
      wasteType = "single_item";

    return reply(
      res,
      `Got it ✅ (${wasteType.replace("_", " ")}).\nRough size? (Small van / Medium / Large / Not sure)`,
      { waste_type: wasteType }
    );
  }

  // --- 3) If user is answering size ---
  if (botAskedSize) {
    let size = "not_sure";
    if (lower.includes("small")) size = "small";
    else if (lower.includes("medium")) size = "medium";
    else if (lower.includes("large")) size = "large";
    else if (lower.includes("not sure") || lower.includes("unsure")) size = "not_sure";

    return reply(
      res,
      `Thanks ✅ (${size}).\nPlease upload 1–3 photos (or describe the items) and we’ll estimate it.`,
      { load_size: size }
    );
  }

  // --- 4) If user is at photos step, acknowledge ---
  if (botAskedPhotos) {
    return reply(
      res,
      `Thanks! If you’ve uploaded photos, we’ll review them. If not, you can upload now or describe what needs removing.`,
      { photos_step: true }
    );
  }

  // --- Intent triggers (start of flow) ---
  const wantsPriceOrQuote =
    lower.includes("how much") ||
    lower.includes("price") ||
    lower.includes("quote") ||
    lower.includes("cost") ||
    lower.includes("charge");

  const wantsBooking = lower.includes("book");

  const mentionsGarden = lower.includes("garden");

  if (wantsPriceOrQuote) {
    return reply(res, "No problem — what’s your postcode? (e.g. WF1 1AA or LS10 1AB)");
  }

  if (wantsBooking) {
    return reply(
      res,
      "You can book instantly using the pink button above. If you want a quick estimate first, tell me your postcode."
    );
  }

  if (mentionsGarden) {
    return reply(res, "We offer garden waste clearance. What’s your postcode so I can confirm if you’re local?");
  }

  // Default fallback
  return reply(res, "Hi! Ask for a quote (tell me your postcode), or click ‘Get A Quote Or Book Now’ above.");
}

