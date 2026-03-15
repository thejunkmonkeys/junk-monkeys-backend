import OpenAI from "openai";

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

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { photo_urls = [] } = req.body || {};

    if (!Array.isArray(photo_urls) || photo_urls.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "photo_urls must be a non-empty array",
      });
    }

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
              "Estimate volume only. Do not price the job. " +
              "Return structured JSON matching the schema.",
          },
          ...photo_urls.map((url) => ({
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

    const raw = response.output_text;
    const parsed = JSON.parse(raw);

    return res.status(200).json({
      ok: true,
      ...parsed,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Photo analysis failed",
    });
  }
}