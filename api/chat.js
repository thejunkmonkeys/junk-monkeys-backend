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

  if (typeof body === "string") {
    return body.trim() || null;
  }

  const direct =
    body.message ??
    body.text ??
    body.input ??
    body.prompt ??
    body.query ??
    body.question ??
    body.content;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const msgs = body.messages ?? body.chat ?? body.history ?? body.conversation;
  if (Array.isArray(msgs) && msgs.length) {
    const last = msgs[msgs.length - 1];
    if (typeof last === "string") return last.trim() || null;
    if (last?.content) return last.content.trim();
    if (last?.text) return last.text.trim();
    if (last?.message) return last.message.trim();
  }

  if (body.data && typeof body.data === "object") {
    return extractMessage(body.data);
  }

  return null;
}

export default async function handler(req, res) {
  setCors(req, res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(200).json({
      ok: false,
      reply: "Method not allowed",
      text: "Method not allowed",
      message: "Method not allowed",
    });
  }

  const body = req.body || {};
  console.log("Incoming body:", body);

  const message = extractMessage(body);

  if (!message) {
    return res.status(200).json({
      ok: false,
      reply: "I didn’t receive a message. Please try again.",
      text: "I didn’t receive a message. Please try again.",
      message: "I didn’t receive a message. Please try again.",
    });
  }

  // 🔥 SMART RESPONSE SECTION
  let replyText;

  const lower = message.toLowerCase();

  if (lower.includes("how much") || lower.includes("price")) {
    replyText =
      "Prices depend on load size. You can send photos or click 'Get A Quote Or Book Now' above.";
  }
  else if (lower.includes("book")) {
    replyText =
      "You can book instantly using the pink button above. Would you like help choosing a service?";
  }
  else if (lower.includes("garden")) {
    replyText =
      "We offer garden waste clearance. Is it bags, loose waste, or large items?";
  }
  else {
    replyText =
      "Thanks for your message. A team member will assist you shortly.";
  }

  return res.status(200).json({
    ok: true,
    reply: replyText,
    text: replyText,
    message: replyText,
  });
}

