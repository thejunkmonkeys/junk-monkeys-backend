import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

function getImageUrls(body) {
  const direct =
    body?.uploaded_image_urls ??
    body?.image_urls ??
    body?.photo_urls ??
    body?.images ??
    body?.photos ??
    [];

  const urls = [];

  if (Array.isArray(direct)) {
    for (const item of direct) {
      if (typeof item === "string" && item.trim()) {
        urls.push(item.trim());
      } else if (item && typeof item.url === "string" && item.url.trim()) {
        urls.push(item.url.trim());
      } else if (item && typeof item.signedUrl === "string" && item.signedUrl.trim()) {
        urls.push(item.signedUrl.trim());
      }
    }
  }

  if (Array.isArray(body?.files)) {
    for (const file of body.files) {
      if (file && typeof file.url === "string" && file.url.trim()) {
        urls.push(file.url.trim());
      } else if (file && typeof file.signedUrl === "string" && file.signedUrl.trim()) {
        urls.push(file.signedUrl.trim());
      }
    }
  }

  return [...new Set(urls)];
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
  if (lower.includes("business") || lower.includes("commercial")) return "business";
  if (lower.includes("trade")) return "trade";
  if (lower.includes("green") || lower.includes("garden")) return "green_waste";
  if (lower.includes("single")) return "single_items";
  return "unknown";
}

function isGreeting(lower) {
  const t = lower.trim();
  return [
    "hi",
    "hello",
    "hey",
    "hiya",
    "good morning",
    "good afternoon",
    "good evening",
  ].includes(t);
}

function getFaqReply(lower) {
  if (
    lower.includes("what areas") ||
    lower.includes("which areas") ||
    lower.includes("areas do you cover") ||
    lower.includes("what area do you cover") ||
    lower.includes("do you cover") ||
    lower.includes("coverage") ||
    lower.includes("locations")
  ) {
    return "We cover most of the country.";
  }

  if (
    lower.includes("hours") ||
    lower.includes("open") ||
    lower.includes("opening") ||
    lower.includes("what time") ||
    lower.includes("when are you open")
  ) {
    return "We work from 7:30 to 5.";
  }

  if (
    lower.includes("how does it work") ||
    lower.includes("how do you work") ||
    lower.includes("how does your service work") ||
    lower.includes("how do your services work")
  ) {
    return "You can book a collection through our online booking portal. On the day of collection our team will call to arrange a time. We arrive, load the rubbish, and take it away for responsible disposal.";
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
    return "We usually collect household rubbish, furniture, garden waste, bulky items and some commercial waste.";
  }

  if (lower.includes("book")) {
    return "You can book online using the pink button above.";
  }

  return null;
}

async function estimateFromImages(imageUrls) {
  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text:
            "You are estimating rubbish volume for a UK junk removal company. The customer may upload multiple photos. Some photos may show the same rubbish from different angles. Do not double count the same pile. Only add volumes together if the photos clearly show separate piles or separate waste groups. Return the closest yard bucket only from: 2, 4, 6, 8, 10, 12, 14, 16, 18. Estimate volume only. Do not price the job. Return structured JSON matching the schema.",
        },
        ...imageUrls.map((url) => ({
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

  const raw = response.output_text || "{}";

  let parsed = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  return {
    estimated_yards: Number(parsed.estimated_yards) || 2,
    confidence: parsed.confidence || "medium",
    photos_same_load: Boolean(parsed.photos_same_load),
    separate_piles_count: Number(parsed.separate_piles_count) || 1,
    summary: parsed.summary || "Estimated from the uploaded photo(s).",
  };
}

async function saveEstimateToJob(body, estimate) {
  const resolvedJobId = body?.jobId || body?.job_id;

  if (!resolvedJobId) return;

  try {
    const { error } = await supabase
      .from("jobs")
      .update({
        estimated_yards: estimate.estimated_yards,
        recommended_loads: { loads: [estimate.estimated_yards] },
      })
      .eq("id", resolvedJobId);

    if (error) {
      console.error("SAVE ESTIMATE TO JOB ERROR:", error);
    }
  } catch (err) {
    console.error("SAVE ESTIMATE TO JOB EXCEPTION:", err);
  }
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

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
    const imageUrls = getImageUrls(body);

    if (imageUrls.length > 0) {
      try {
        if (!process.env.OPENAI_API_KEY) {
          return reply(
            res,
            "Thanks — we received the photo(s). Please WhatsApp us on 07841669084 and we’ll help with the estimate."
          );
        }

        const estimate = await estimateFromImages(imageUrls);

        await saveEstimateToJob(body, estimate);

        return reply(
          res,
          `Estimated volume: ${estimate.estimated_yards} cubic yards.\n\n${estimate.summary}`,
          {
            estimate,
            uploaded_image_urls: imageUrls,
            next_step: "estimate_complete",
          }
        );
      } catch (err) {
        console.error("CHAT IMAGE ESTIMATE ERROR:", err);

        return reply(
          res,
          "Thanks — we received the photo(s), but I couldn’t estimate them automatically just now. Please WhatsApp us on 07841669084 and we’ll help you."
        );
      }
    }

    if (!message) {
      return reply(
        res,
        "I’m not sure about that. Please WhatsApp us on 07841669084 and we’ll help you."
      );
    }

    if (isGreeting(lower)) {
      return reply(res, "Hi 👋 How can I help you?");
    }

    const faqReply = getFaqReply(lower);
    if (faqReply) {
      return reply(res, faqReply);
    }

    const wantsPriceOrQuote =
      lower.includes("how much") ||
      lower.includes("price") ||
      lower.includes("quote") ||
      lower.includes("cost") ||
      lower.includes("charge");

    if (wantsPriceOrQuote) {
      return reply(res, "Please enter your postcode.");
    }

    const postcode = findPostcodeInText(message);
    if (postcode) {
      return reply(
        res,
        "What type of waste is it: household, business, trade, green waste, or single items?",
        { postcode, next_step: "waste_type" }
      );
    }

    const wasteType = detectWasteType(lower);
    if (wasteType !== "unknown") {
      return reply(
        res,
        "Any extras? For example mattresses, sofas, arm chairs, fridges, freezers, or tins of paint.",
        { waste_type: wasteType, next_step: "extras" }
      );
    }

    if (
      lower === "no" ||
      lower === "none" ||
      lower.includes("no extras") ||
      lower.includes("nothing extra") ||
      lower.includes("mattress") ||
      lower.includes("sofa") ||
      lower.includes("arm chair") ||
      lower.includes("armchair") ||
      lower.includes("fridge") ||
      lower.includes("freezer") ||
      lower.includes("paint")
    ) {
      return reply(
        res,
        "Please upload photos of the waste so I can estimate the volume.",
        { next_step: "photos" }
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
