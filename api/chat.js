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

  if (typeof body === "string") {
    return body.trim() || null;
  }

  const direct =
    body.user_message ??
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
    if (typeof last?.content === "string") return last.content.trim() || null;
    if (typeof last?.text === "string") return last.text.trim() || null;
    if (typeof last?.message === "string") return last.message.trim() || null;
  }

  return null;
}

function getMessagesArray(body) {
  const msgs =
    body?.messages ?? body?.chat ?? body?.history ?? body?.conversation;
  return Array.isArray(msgs) ? msgs : [];
}

function lastAssistantText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = (m?.role || m?.type || "").toString().toLowerCase();
    const content = (m?.content ?? m?.text ?? m?.message ?? "").toString();

    if ((role === "assistant" || role === "bot") && content) {
      return content;
    }
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

function detectWasteType(lower) {
  if (lower.includes("house")) return "household";
  if (lower.includes("business")) return "business";
  if (lower.includes("trade")) return "trade";
  if (lower.includes("green") || lower.includes("garden")) return "green_waste";
  if (lower.includes("single")) return "single_items";
  return "unknown";
}

function getImageUrls(body) {
  const urls =
    body?.uploaded_image_urls ??
    body?.image_urls ??
    body?.images ??
    body?.photos ??
    [];

  if (!Array.isArray(urls)) return [];
  return urls.filter((u) => typeof u === "string" && u.trim());
}

function normalizeYardSize(yards) {
  if (yards <= 1) return 1;
  if (yards <= 2) return 2;
  if (yards <= 5) return 4;
  if (yards <= 7) return 7;
  if (yards <= 10) return 10;
  if (yards <= 14) return 14;
  return 14;
}

function buildVisionPrompt(context) {
  const postcode = context?.postcode || "unknown";
  const wasteType = context?.wasteType || "unknown";
  const extras = context?.extras || "none";

  return [
    "You are a waste volume estimation assistant for a UK rubbish removal company.",
    "Your job is to estimate the total visible waste volume in cubic yards from the uploaded photo or photos.",
    "You must NOT choose pricing, business rules, or service decisions.",
    "Your job is only to estimate visible waste volume.",
    "",
    "PROCESS",
    "1. Identify the visible waste items in the photo or photos.",
    "2. Estimate the approximate volume of each visible item.",
    "3. Add the volumes together to produce a raw volume estimate.",
    "4. Use that raw estimate as the most likely real visible waste volume.",
    "5. Do NOT add extra volume for rubbish that cannot be seen.",
    "6. Do NOT assume hidden waste exists outside the photos.",
    "",
    "IMPORTANT RULES",
    "- Estimate ONLY what is visible in the photos.",
    "- Never return a range.",
    "- Return one exact whole-number cubic-yard estimate only.",
    "- Do not add a safety buffer.",
    "- Do not increase the estimate just because extra-charge items are present.",
    "- Customers are told to include all rubbish in the photos, including extras.",
    "",
    "VOLUME GUIDELINES",
    "- 5 full black bags ≈ 1 cubic yard",
    "- Sofa ≈ 1.5 cubic yards",
    "- Mattress ≈ 1 cubic yard",
    "- Wardrobe ≈ 2 cubic yards",
    "- Fridge ≈ 1.5 cubic yards",
    "- Washing machine ≈ 1 cubic yard",
    "",
    "After estimating the raw visible volume, convert it to the company's standard job sizes using these rules:",
    "- 1 returns 1",
    "- 2 returns 2",
    "- 3, 4, or 5 returns 4",
    "- 6 or 7 returns 7",
    "- 8, 9, or 10 returns 10",
    "- 11, 12, 13, or 14 returns 14",
    "",
    "OUTPUT",
    "Return JSON only in this exact shape:",
    "{",
    '  "items_identified": ["string"],',
    '  "raw_volume": number,',
    '  "estimated_yards": number,',
    '  "confidence": "high | medium | low",',
    '  "reason": "short explanation of the estimate"',
    "}",
    "",
    "Context:",
    `- postcode: ${postcode}`,
    `- waste_type: ${wasteType}`,
    `- extras mentioned: ${extras}`,
  ].join("\n");
}

async function estimateFromImages(imageUrls, context) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const content = [
    { type: "text", text: buildVisionPrompt(context) },
    ...imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
      max_tokens: 300,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI error: ${text}`);
  }

  const data = await resp.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";

  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  let estimatedYards = Number(parsed.estimated_yards) || 0;
  estimatedYards = Math.max(1, Math.round(estimatedYards));
  estimatedYards = normalizeYardSize(estimatedYards);

  return {
    estimatedYards,
    summary: parsed.reason || "Estimated from the uploaded photo(s).",
    notes: parsed.confidence ? `Confidence: ${parsed.confidence}` : "",
  };
}

function buildEstimateReply(estimate) {
  const unit = estimate.estimatedYards === 1 ? "yard" : "yards";
  return `Estimated volume: ${estimate.estimatedYards} ${unit}.`;
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: "Method not allowed",
      });
    }

    const body = req.body || {};
    const messages = getMessagesArray(body);
    const lastBot = lastAssistantText(messages).toLowerCase();
    const imageUrls = getImageUrls(body);

    const message = extractMessage(body);
    const lower = (message || "").toLowerCase();
    const postcode = findPostcodeInText(message);

    if (imageUrls.length > 0) {
      const context = {};
      const estimate = await estimateFromImages(imageUrls, context);
      const text = buildEstimateReply(estimate);

      return reply(res, text, { estimate });
    }

    if (!message) {
      return reply(res, "Hi 👋 How can I help you?");
    }

    if (
      lower === "hi" ||
      lower === "hello" ||
      lower === "hey" ||
      lower.includes("good morning") ||
      lower.includes("good afternoon")
    ) {
      return reply(res, "Hi 👋 How can I help you?");
    }

    if (
      lower.includes("hours") ||
      lower.includes("open") ||
      lower.includes("opening") ||
      lower.includes("what time") ||
      lower.includes("when are you open")
    ) {
      return reply(res, "We work from 7:30 to 5.");
    }

    if (
      lower.includes("area") ||
      lower.includes("areas") ||
      lower.includes("where do you cover") ||
      lower.includes("what areas do you cover") ||
      lower.includes("location") ||
      lower.includes("do you cover")
    ) {
      return reply(res, "We cover most of the country.");
    }

    if (
      lower.includes("how much") ||
      lower.includes("price") ||
      lower.includes("cost") ||
      lower.includes("quote") ||
      lower.includes("charge")
    ) {
      return reply(res, "Please enter your postcode.");
    }

    if (lastBot.includes("please enter your postcode")) {
      if (!postcode) {
        return reply(res, "Please enter a valid postcode.");
      }

      return reply(
        res,
        "What type of waste is it: household, business, trade, green waste, or single items?"
      );
    }

    if (lastBot.includes("what type of waste is it")) {
      const wasteType = detectWasteType(lower);

      if (wasteType === "unknown") {
        return reply(
          res,
          "Please tell me if it is household, business, trade, green waste, or single items."
        );
      }

      return reply(
        res,
        "Any extras? For example mattresses, sofas, arm chairs, fridges, freezers, or tins of paint."
      );
    }

    if (lastBot.includes("any extras")) {
      return reply(
        res,
        "Please upload photos of the waste so I can estimate the volume."
      );
    }

    return reply(
      res,
      "I’m not sure about that. Please WhatsApp us on 07841669084 and we’ll help you."
    );
  } catch (err) {
    console.error("CHAT ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: "Chat failed",
    });
  }
}
