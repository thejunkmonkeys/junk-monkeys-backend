import OpenAI from "openai";
import { calculateQuote, parseExtras } from "../lib/pricing.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function outwardCode(pcNoSpace) {
  return pcNoSpace.slice(0, -3);
}

function isLocalPostcode(pcNoSpace) {
  const outward = outwardCode(pcNoSpace);
  if (outward.startsWith("WF")) return true;
  const localLS = new Set(["LS10", "LS11", "LS9", "LS8", "LS7", "LS26", "LS27", "LS28"]);
  return localLS.has(outward);
}

// --- Waste type detection ---
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

// --- FAQ replies ---
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

// --- helpers for photo flow ---
function getTextFromMessage(m) {
  return (m?.content ?? m?.text ?? m?.message ?? "").toString();
}

function getUserTexts(messages) {
  return messages
    .filter((m) => {
      const role = (m?.role || m?.type || "").toString().toLowerCase();
      return role === "user" || role === "human" || role === "";
    })
    .map(getTextFromMessage)
    .filter(Boolean);
}

function findPostcodeInHistory(messages, currentMessage) {
  const candidates = [currentMessage, ...getUserTexts(messages).reverse()];
  for (const text of candidates) {
    const pc = findPostcodeInText(text);
    if (pc) return pc;
  }
  return null;
}

function inferExtrasFromHistory(messages, currentMessage) {
  const combined = [...getUserTexts(messages), currentMessage]
    .filter(Boolean)
    .join(" \n ");
  return parseExtras(combined);
}

function collectPhotoUrls(value, results = new Set(), seen = new Set()) {
  if (!value || seen.has(value)) return results;

  if (typeof value === "object") {
    seen.add(value);
  }

  if (typeof value === "string") {
    const s = value.trim();
    const looksLikeUrl =
      /^https?:\/\//i.test(s) &&
      (
        s.includes("/storage/") ||
        s.includes("/uploads/") ||
        s.includes("supabase") ||
        s.includes("blob") ||
        s.includes("amazonaws") ||
        s.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
      );

    if (looksLikeUrl) results.add(s);
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectPhotoUrls(item, results, seen);
    return results;
  }

  if (typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();

      if (
        lowerKey.includes("photo") ||
        lowerKey.includes("image") ||
        lowerKey.includes("upload") ||
        lowerKey.includes("attachment") ||
        lowerKey.includes("file") ||
        lowerKey.includes("url")
      ) {
        collectPhotoUrls(val, results, seen);
      } else if (typeof val === "object") {
        collectPhotoUrls(val, results, seen);
      } else if (typeof val === "string") {
        collectPhotoUrls(val, results, seen);
      }
    }
  }

  return results;
}

function formatExtras(extras = []) {
  if (!extras.length) return "No extras";
  return extras.map((item) => `${item.qty} x ${item.name}`).join(", ");
}

async function analysePhotosWithOpenAI(photoUrls) {
  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "You are estimating rubbish volume for a UK junk removal company. " +
            "The customer may upload multiple photos. Some photos may show the same rubbish from different angles. " +
            "Do not double count the same pile. Only add volumes together if the photos clearly show separate piles or separate waste groups. " +
            "Return the closest yard bucket only from: 2, 4, 6, 8, 10, 12, 14, 16, 18. " +
            "Estimate volume only. Do not price the job. Return structured JSON matching the schema.",
        },
        ...photoUrls.map((url) => ({
          type: "input_image",
          image_url: url,
        })),
      ],
    },
  ];

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input,
    text: {
      format: {
        type: "json_schema",
        name: "junk_volume_estimate",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            estimated_yards: {
              type: "integer",
              enum: [2, 4, 6, 8, 10, 12, 14, 16, 18],
            },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            photos_same_load: {
              type: "boolean",
            },
            separate_piles_count: {
              type: "integer",
            },
            summary: {
              type: "string",
            },
          },
          required: [
            "estimated_yards",
            "confidence",
            "photos_same_load",
            "separate_piles_count",
            "summary",
          ],
        },
      },
    },
  });

  return JSON.parse(response.output_text);
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return reply(res, "Method not allowed", { ok: false });
  }

  try {
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

    // 1) If uploaded photo URLs are present, analyse and quote
    const photoUrls = Array.from(collectPhotoUrls(body));
    const looksLikePhotoStep =
      photoUrls.length > 0 ||
      lower.includes("photos uploaded") ||
      lower.includes("photo uploaded");

    if (looksLikePhotoStep) {
      const postcode = findPostcodeInHistory(messages, message);
      if (!postcode) {
        return reply(res, "Thanks. Before I can price this, what’s the postcode for the collection?");
      }

      if (!photoUrls.length) {
        return reply(res, "Thanks. I can see the upload step happened, but I didn’t receive the photo link. Please try uploading the photo again.");
      }

      const extras = inferExtrasFromHistory(messages, message);
      const analysis = await analysePhotosWithOpenAI(photoUrls);
      const quote = calculateQuote({
        postcode,
        yards: Number(analysis.estimated_yards),
        extras,
      });

      const text =
        `Based on the photos, this looks closest to a ${quote.yards} yard collection.\n\n` +
        `Base price: £${quote.base_price}\n` +
        `Extras: £${quote.extras_total} (${formatExtras(extras)})\n` +
        `Estimated total: £${quote.total}\n\n` +
        `Final price is confirmed on arrival once the load is assessed on site.`;

      return reply(res, text, {
        next_step: "quote_complete",
        estimated_yards: quote.yards,
        base_price: quote.base_price,
        extras_total: quote.extras_total,
        total: quote.total,
        local_area: quote.local_area,
        postcode: quote.postcode,
        confidence: analysis.confidence,
        analysis_summary: analysis.summary,
        photo_count: photoUrls.length,
      });
    }

    // 2) Greeting
    if (!message || isGreeting(lower)) {
      return reply(res, "Hi 👋 How can I help you today?");
    }

    // 3) Postcode
    const foundPc = findPostcodeInText(message);
    if (foundPc) {
      const local = isLocalPostcode(foundPc);
      return reply(
        res,
        "Thanks! What type of rubbish do you have?\nHousehold / Business / Trade / Green waste / Single bulky items",
        { postcode: foundPc, local_area: local, next_step: "waste_type" }
      );
    }

    // 4) Waste type
    const wasteType = detectWasteType(lower);
    if ((botAskedWasteType && wasteType !== "unknown") || wasteType !== "unknown") {
      return reply(
        res,
        "Thanks! Are there any extras?\nMattress, Fridge, Freezer, Car tyres, Tin of paint, Sofas, Arm chairs.\nTell me how many of each (or say none).",
        { waste_type: wasteType, next_step: "extras" }
      );
    }

    // 5) Extras → photos
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

    // 6) Quote intent
    const wantsPriceOrQuote =
      lower.includes("how much") ||
      lower.includes("price") ||
      lower.includes("quote") ||
      lower.includes("cost") ||
      lower.includes("charge");

    if (wantsPriceOrQuote) {
      return reply(res, "Sure 👍 What’s the postcode for the collection?");
    }

    // 7) FAQ
    const faqReply = getFaqReply(lower);
    if (faqReply) {
      return reply(res, faqReply);
    }

    // 8) Final fallback
    return reply(
      res,
      "Sorry, I can't answer that at the moment. Please call us on 07841 669084.\n\nOur team is available Monday to Friday, 7am – 5pm."
    );
  } catch (error) {
    console.error("chat.js error:", error);

    return res.status(200).json({
      ok: true,
      reply: "Sorry — I couldn’t reach the quote service. Please try again, or contact us.",
      text: "Sorry — I couldn’t reach the quote service. Please try again, or contact us.",
      message: "Sorry — I couldn’t reach the quote service. Please try again, or contact us.",
      debug_error: error?.message || "Unknown error",
    });
  }
}