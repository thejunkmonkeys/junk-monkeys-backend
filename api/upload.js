import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false }, // required for multipart uploads
};

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

function parseForm(req) {
  // formidable v3+: "multiples" still supported, files come back as arrays sometimes
  const form = formidable({ multiples: true, keepExtensions: true });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  try {
    setCors(req, res);

    if (req.method === "OPTIONS") return res.status(204).end();

    if (req.method !== "POST") {
      return reply(res, "Method not allowed", { ok: false });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return reply(res, "Upload not configured", {
        ok: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { files } = await parseForm(req);

    // Support common field names the widget might use
    let incoming =
      files.files || files.file || files.images || files.image || files.upload || [];

    if (!Array.isArray(incoming)) incoming = [incoming];

    // Some formidable versions return nested arrays
    incoming = incoming.flat().filter(Boolean);

    if (!incoming.length) {
      return reply(res, "No photos received. Please try again.", {
        ok: false,
        error: "No files in request",
      });
    }

    const bucket = "chat-uploads"; // create this bucket in Supabase Storage
    const uploaded = [];

    for (const f of incoming) {
      const filepath = f.filepath || f.path;
      const originalName = f.originalFilename || f.name || "upload.jpg";
      const ext = (originalName.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";

      const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;
      const storagePath = `uploads/${filename}`;

      const buffer = fs.readFileSync(filepath);

      const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
        contentType: f.mimetype || "image/jpeg",
        upsert: false,
      });

      if (upErr) {
        return reply(res, "Upload failed. Please try again.", {
          ok: false,
          error: upErr.message,
        });
      }

      // Public URL (make bucket public for easiest setup)
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(storagePath);

      uploaded.push({
        url: pub.publicUrl,
        path: storagePath,
        name: originalName,
      });
    }

    return reply(
      res,
      `Got it — ${uploaded.length} photo(s) uploaded. Add a short message if you like, then press Send.`,
      { files: uploaded }
    );
  } catch (e) {
    console.error("UPLOAD ERROR:", e);
    return res.status(200).json({
      ok: false,
      reply: "Sorry — upload failed. Please try again.",
      text: "Sorry — upload failed. Please try again.",
      message: "Sorry — upload failed. Please try again.",
    });
  }
}
