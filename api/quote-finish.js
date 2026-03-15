import { calculateQuote, parseExtras } from "../lib/pricing.js";

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

function formatExtras(extras = []) {
  if (!extras.length) return "No extras";

  return extras.map((item) => `${item.qty} x ${item.name}`).join(", ");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { postcode, estimated_yards, extras } = req.body || {};

    if (!postcode) {
      return res.status(400).json({ ok: false, error: "Missing postcode" });
    }

    if (!estimated_yards) {
      return res.status(400).json({ ok: false, error: "Missing estimated_yards" });
    }

    const parsedExtras = Array.isArray(extras) ? extras : parseExtras(extras);

    const quote = calculateQuote({
      postcode,
      yards: Number(estimated_yards),
      extras: parsedExtras,
    });

    const reply =
      `Based on the photos, this looks closest to a ${quote.yards} yard collection.\n\n` +
      `Base price: £${quote.base_price}\n` +
      `Extras: £${quote.extras_total} (${formatExtras(parsedExtras)})\n` +
      `Estimated total: £${quote.total}\n\n` +
      `Final price is confirmed on arrival once the load is assessed on site.`;

    return res.status(200).json({
      ok: true,
      reply,
      ...quote,
      extras: parsedExtras,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Quote calculation failed",
    });
  }
}