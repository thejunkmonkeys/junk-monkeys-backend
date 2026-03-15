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

function fail(res, text, extra = {}, status = 200) {
  return res.status(status).json({
    ok: false,
    reply: text,
    text,
    message: text,
    ...extra,
  });
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
    lower.includes("how does it work") ||
    lower.includes("how do you work") ||
    lower.includes("how does rubbish removal work")
  ) {
    return "You can book a collection through our online booking portal. On the day our team will call to arrange a time. We arrive in an 18 yard truck, load the rubbish, and take it away for responsible disposal.";
  }

  if (
    lower.includes("what areas") ||
    lower.includes("areas do you cover") ||
    lower.includes("do you cover")
  ) {
    return "We cover most of the country.";
  }

  if (
    lower.includes("hours") ||
    lower.includes("opening") ||
    lower.includes("open") ||
    lower.includes("time")
  ) {
    return "We work from 7:30 to 5.";
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
    lower.includes("what rubbish do you take")
  ) {
    return "We usually collect household rubbish, furniture, garden waste and bulky items.";
  }

  if (lower.includes("book")) {
    return "You can book online using the pink button above.";
  }

  return null;
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

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function estimateFromImages(imageUrls) {

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Estimate the rubbish volume in cubic yards from these photos. Return JSON: { estimated_yards: number }",
            },
            ...imageUrls.map((url) => ({
              type: "image_url",
              image_url: { url },
            })),
          ],
        },
      ],
      max_tokens: 200,
    }),
  });

  const data = await resp.json();

  const raw = data?.choices?.[0]?.message?.content || "{}";

  let parsed = {};

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const yards = Math.max(1, Math.round(Number(parsed.estimated_yards) || 2));

  return yards;
}

export default async function handler(req, res) {

  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return fail(res, "Method not allowed", {}, 405);
  }

  const token = req.headers["x-tjm-token"];

  if (token !== process.env.BACKEND_TOKEN) {
    return fail(res, "Unauthorized", {}, 401);
  }

  const body = req.body || {};

  const message = (extractMessage(body) || "").trim();

  const lower = message.toLowerCase();

  const imageUrls = getImageUrls(body);

  if (imageUrls.length > 0) {

    try {

      if (!hasOpenAiKey()) {
        return reply(
          res,
          "Thanks — we received the photos. Please call us on 07841669084 and we will help with the estimate."
        );
      }

      const yards = await estimateFromImages(imageUrls);

      return reply(
        res,
        `Estimated volume: ${yards} cubic yards.\n\nPlease make sure all rubbish is included in the photos.`,
        {
          estimate: yards,
        }
      );

    } catch (err) {

      console.error("IMAGE ESTIMATE ERROR:", err);

      return reply(
        res,
        "Thanks — we received the photos but could not estimate automatically. Please call us on 07841669084."
      );
    }
  }

  if (!message || isGreeting(lower)) {
    return reply(res, "Hi 👋 How can I help you?");
  }

  const postcode = findPostcodeInText(message);

  if (postcode) {
    return reply(
      res,
      "Thanks! What type of rubbish do you have?\nHousehold / Business / Trade / Green waste / Single bulky items",
      { postcode }
    );
  }

  const wantsPrice =
    lower.includes("how much") ||
    lower.includes("price") ||
    lower.includes("quote") ||
    lower.includes("cost");

  if (wantsPrice) {
    return reply(res, "Sure 👍 What’s the postcode for the collection?");
  }

  const faq = getFaqReply(lower);

  if (faq) {
    return reply(res, faq);
  }

  return reply(
    res,
    "I’m not sure about that. Please WhatsApp us on 07841669084 and we’ll help you."
  );
}
