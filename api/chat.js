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

// Try hard to extract a user message from lots of possible shapes
function extractMessage(body) {
  if (!body) return null;

  // If body is already a string
  if (typeof body === "string") return body.trim() || null;

  // Common top-level fields
  const direct =
    body.message ??
    body.text ??
    body.input ??
    body.prompt ??
    body.query ??
    body.question ??
    body.content;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  // Common chat history formats: { messages: [{content:""}] }
  const msgs = body.messages ?? body.chat ?? body.history ?? body.conversation;
  if (Array.isArray(msgs) && msgs.length) {
    const last = msgs[msgs.length - 1];
    if (typeof last === "string") return last.trim() || null;
    if (last && typeof last.content === "string") return last.content.trim() || null;
    if (last && typeof last.text === "string") return last.text.trim() || null;
    if (last && typeof last.message === "string") return last.message.trim() || null;
  }

  // Sometimes nested: { data: {...} }
  if (body.data && typeof body.data === "object") {
    return extractMessage(body.data);
  }

  return null;
}

export default async function handler(req, res) {
  setCors(req, res);

  // Preflight
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
  console.log("Incoming body:", body);

  const message = extractMessage(body);

  // IMPORTANT: Return 200 even if message missing (so plugin doesn’t treat it as “failed fetch”)
  if (!message) {
    return res.status(200).json({
      ok: false,
      reply: "I didn’t receive a message from the website. Please try again.",
      text: "I didn’t receive a message from the website. Please try again.",
      message: "I didn’t receive a message from the website. Please try again.",
      receivedKeys: Object.keys(body || {}),
    });
  }

  const replyText = `Backend live. You said: ${message}`;

  // Return multiple keys so the plugin can pick what it expects
  return res.status(200).json({
    ok: true,
    reply: replyText,
    text: replyText,
    message: replyText,
  });
}
