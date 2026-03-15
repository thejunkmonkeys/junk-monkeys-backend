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
    body.user_message ??
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

function fail(res, text, extra = {}, status = 200) {
  return res.status(status).json({
    ok: false,
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

function detectWasteType(lower) {
  if (lower.includes("house")) return "household";
  if (lower.includes("business") || lower.includes("commercial")) return "business";
  if (lower.includes("trade")) return "trade";
  if (lower.includes("green") || lower.includes("garden")) return "green_waste";
  if (lower.includes("bulky") || lower.includes("single item")) return "single_bulky_items";
  return "unknown";
}

const EXTRAS_KEYWORDS = [
  "mattress",
  "fridge",
  "freezer",
  "tyre",
  "paint",
  "sofa",
  "armchair",
  "arm chair",
  "car tyre",
  "car tires",
  "fridges",
  "freezers",
  "mattresses",
  "sofas",
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

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getLoadLabel(estimatedYards) {
  if (estimatedYards <= 2) return "a small load";
  if (estimatedYards <= 4) return "roughly a quarter load";
  if (estimatedYards <= 8) return "around a half load";
  if (estimatedYards <= 12) return "around three quarters of a load";
  return "close to a full load";
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
    "You are estimating rubbish removal volume from customer photos for a UK rubbish company.",
    "Estimate ONLY the rubbish that is visible in the uploaded photo or photos.",
    "Do not assume there is extra rubbish outside the photos.",
    "Do not guess hidden waste.",
    "Do not add a safety buffer.",
    "Return ONE exact whole-number cubic-yard estimate.",
    "Never return a range.",
    "Never return wording like '2-3 yards', 'around 2-3 yards', or 'approximately'.",
    "Customers are told to include ALL rubbish in the photos including any extras.",
    "Estimate the actual visible rubbish volume only.",
    "IMPORTANT SIZE REFERENCES:",
    "- Black bin bag ≈ 0.15 cubic yards when full",
    "- Wheelie bin ≈ 0.25 cubic yards",
    "- Mattress ≈ 1 cubic yard",
    "- Fridge or freezer ≈ 1 cubic yard",
    "- Armchair ≈ 1 cubic yard",
    "- 3 seat sofa ≈ 2 cubic yards",
    "A typical rubbish truck holds about 18 cubic yards.",
    "After estimating the visible volume, convert the estimate into one of the company's standard job sizes using these rules:",
    "1 yard stays 1 yard",
    "2 yards stays 2 yards",
    "3, 4, or 5 yards must return 4 yards",
    "6 or 7 yards must return 7 yards",
    "8, 9, or 10 yards must return 10 yards",
    "11, 12, 13, or 14 yards must return 14 yards",
    "Always return the final number AFTER applying these job size rules.",
    "Return ONLY valid JSON in this exact format:",
    "{",
    '  "estimated_yards": number,',
    '  "load_label": string,',
    '  "summary": string,',
    '  "notes": string',
    "}",
    "Context:",
    `- postcode: ${postcode}`,
    `- waste_type: ${wasteType}`,
    `- extras mentioned: ${extras}`,
  ].join("\n");
}

function extractConversationContext(messages) {
  let postcode = null;
  let wasteType = null;
  let extras = [];

  for (const m of messages) {
    const role = (m?.role || "").toLowerCase();
    const content = (m?.content ?? m?.text ?? m?.message ?? "").toString();
    if (role !== "user" || !content) continue;

    const pc = findPostcodeInText(content);
    if (pc) postcode = pc;

    const wt = detectWasteType(content.toLowerCase());
    if (wt !== "unknown") wasteType = wt;

    for (const keyword of EXTRAS_KEYWORDS) {
      if (content.toLowerCase().includes(keyword)) {
        extras.push(keyword);
      }
    }
  }

  return {
    postcode,
    wasteType,
    extras: extras.length ? [...new Set(extras)].join(", ") : "none",
  };
}

async function estimateFromImages(imageUrls, context) {
  const apiKey = process.env.OPENAI_API_KEY;

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
      messages: [
        {
          role: "user",
          content,
        },
      ],
      max_tokens: 300,
    }),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  const raw = data?.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  const estimatedYardsRaw = Number(parsed.estimated_yards) || 0;
  let estimatedYards = Math.max(1, Math.round(estimatedYardsRaw));
  estimatedYards = normalizeYardSize(estimatedYards);

  const loadLabel = parsed.load_label || getLoadLabel(estimatedYards);
  const summary = parsed.summary || "Estimated from the uploaded photo(s).";
  const notes = parsed.notes || "";

  return {
    estimatedYards,
    loadLabel,
    summary,
    notes,
  };
}

function buildEstimateReply(estimate) {
  const unit = estimate.estimatedYards === 1 ? "yard" : "yards";
  return `Estimated volume: ${estimate.estimatedYards} ${unit}.`;
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return fail(res, "Method not allowed", { error: "Method not allowed" }, 405);
  }

  const token = req.headers["x-tjm-token"];
  const expected = process.env.BACKEND_TOKEN;

  if (!token || !expected || token !== expected) {
    return fail(res, "Unauthorized", { error: "Invalid backend token" }, 401);
  }

  const body = req.body || {};
  const message = (extractMessage(body) || "").trim();
  const lower = message.toLowerCase();

  const messages = getMessagesArray(body);
  const lastBot = (lastAssistantText(messages) || "").toLowerCase();
  const imageUrls = getImageUrls(body);

  const botAskedWasteType = lastBot.includes("what type of rubbish");

  const botAskedExtras =
    lastBot.includes("any extras") ||
    lastBot.includes("mattress") ||
    lastBot.includes("fridge") ||
    lastBot.includes("sofa");

  if (imageUrls.length > 0) {
    try {
      if (!hasOpenAiKey()) {
        return reply(
          res,
          "Thanks — we received the photo(s). Please call us on 07841 669084 and we’ll help with the estimate."
        );
      }

      const context = extractConversationContext(messages);
      const estimate = await estimateFromImages(imageUrls, context);
      const text = buildEstimateReply(estimate);

      return reply(res, text, {
        next_step: "estimate_complete",
        uploaded_image_urls: imageUrls,
        estimate,
      });
    } catch (err) {
      console.error("CHAT IMAGE ESTIMATE ERROR:", err);
      return reply(
        res,
        "Thanks — we received the photo(s), but I couldn’t estimate them automatically just now. Please send one more photo showing all of the rubbish clearly, including any extra items, or call us on 07841 669084."
      );
    }
  }

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
      "Great. Please upload 1–3 photos showing all of the rubbish clearly, including any extra items. We will estimate one exact job size using only what is visible in the photos.",
      { next_step: "photos" }
    );
  }

  if (looksLikeExtrasAnswer(lower)) {
    return reply(
      res,
      "Great. Please upload 1–3 photos showing all of the rubbish clearly, including any extra items. We will estimate one exact job size using only what is visible in the photos.",
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
