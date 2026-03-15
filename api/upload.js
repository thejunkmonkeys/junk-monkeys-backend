import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
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

function parseForm(req) {
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

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Auth check
    const token = req.headers["x-tjm-token"];
    const expected = process.env.BACKEND_TOKEN;

    if (!token || token !== expected) {
      return res.status(401).json({
        ok: false,
        error: "Invalid backend token",
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing Supabase configuration",
      });
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const { files } = await parseForm(req);

    let incoming =
      files.files || files.file || files.images || files.image || [];

    if (!Array.isArray(incoming)) incoming = [incoming];

    incoming = incoming.flat().filter(Boolean);

    if (!incoming.length) {
      return res.status(400).json({
        ok: false,
        error: "No files received",
      });
    }

    const bucket = "chat-uploads";
    const uploaded = [];

    for (const f of incoming) {
      const filepath = f.filepath || f.path;
      const originalName = f.originalFilename || "upload.jpg";

      const ext = (originalName.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext)
        ? ext
        : "jpg";

      const filename =
        Date.now() +
        "-" +
        Math.random().toString(16).slice(2) +
        "." +
        safeExt;

      const storagePath = `uploads/${filename}`;

      const buffer = fs.readFileSync(filepath);

      const { error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType: f.mimetype || "image/jpeg",
          upsert: false,
        });

      if (error) {
        console.error("SUPABASE UPLOAD ERROR:", error);

        return res.status(500).json({
          ok: false,
          error: error.message,
        });
      }

      const { data } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

      uploaded.push({
        url: data.publicUrl,
        path: storagePath,
        name: originalName,
      });
    }

    return res.status(200).json({
      ok: true,
      files: uploaded,
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: "Upload failed",
    });
  }
}