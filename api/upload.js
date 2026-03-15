import { createClient } from "@supabase/supabase-js";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
};

function getAllowedOrigins() {
  const envValue = process.env.ALLOWED_ORIGINS || "";
  const envOrigins = envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const defaults = [
    "https://thejunkmonkeys.co.uk",
    "https://www.thejunkmonkeys.co.uk",
  ];

  return new Set(envOrigins.length ? envOrigins : defaults);
}

function setCors(req, res) {
  const allowed = getAllowedOrigins();
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

function fail(res, text, error, extra = {}) {
  return res.status(200).json({
    ok: false,
    reply: text,
    text,
    message: text,
    ...(error ? { error } : {}),
    ...extra,
  });
}

function parseForm(req) {
  const form = formidable({
    multiples: true,
    keepExtensions: true,
    maxFiles: 10,
    maxFileSize: 15 * 1024 * 1024, // 15MB per file
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function getTokenFromRequest(req) {
  const raw = req.headers["x-tjm-token"];
  if (Array.isArray(raw)) return raw[0] || "";
  return raw || "";
}

function getIncomingFiles(files) {
  let incoming =
    files?.files ||
    files?.file ||
    files?.images ||
    files?.image ||
    files?.upload ||
    [];

  if (!Array.isArray(incoming)) incoming = [incoming];
  return incoming.flat().filter(Boolean);
}

function getSafeExtension(originalName) {
  const ext = (originalName.split(".").pop() || "jpg").toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
}

function getContentType(file, safeExt) {
  if (file?.mimetype) return file.mimetype;

  switch (safeExt) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
    default:
      return "image/jpeg";
  }
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return fail(res, "Method not allowed", "Method not allowed");
  }

  try {
    const backendToken = process.env.BACKEND_TOKEN || "";
    const requestToken = getTokenFromRequest(req);

    if (!backendToken) {
      console.error("UPLOAD ERROR: Missing BACKEND_TOKEN env var");
      return fail(
        res,
        "Upload not configured. Please contact us.",
        "Missing BACKEND_TOKEN"
      );
    }

    // IMPORTANT: plain string comparison only. No JWT parsing/verification.
    if (requestToken !== backendToken) {
      return fail(
        res,
        "Unauthorized upload request.",
        "Invalid X-TJM-Token"
      );
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || "";
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("UPLOAD ERROR: Missing Supabase env vars", {
        hasUrl: Boolean(SUPABASE_URL),
        hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
      });

      return fail(
        res,
        "Upload not configured. Please contact us.",
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { files } = await parseForm(req);
    const incoming = getIncomingFiles(files);

    if (!incoming.length) {
      return fail(
        res,
        "No photos received. Please try again.",
        "No files in request"
      );
    }

    const bucket = "chat-uploads";
    const uploaded = [];

    for (const f of incoming) {
      const filepath = f.filepath || f.path;
      const originalName = f.originalFilename || f.name || "upload.jpg";

      if (!filepath) {
        return fail(
          res,
          "Upload failed. Please try again.",
          "Uploaded file path missing"
        );
      }

      const safeExt = getSafeExtension(originalName);
      const filename = `${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${safeExt}`;
      const storagePath = `uploads/${filename}`;
      const buffer = fs.readFileSync(filepath);
      const contentType = getContentType(f, safeExt);

      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, {
          contentType,
          upsert: false,
        });

      if (upErr) {
        console.error("SUPABASE UPLOAD ERROR:", upErr);
        return fail(
          res,
          "Upload failed. Please try again.",
          upErr.message || "Supabase upload failed"
        );
      }

      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      const publicUrl = pub?.publicUrl || "";

      uploaded.push({
        url: publicUrl,
        path: storagePath,
        name: originalName,
      });
    }

    // Backwards compatible:
    // - files: [{ url, path, name }]
    // - image_urls: ["..."]
    return reply(
      res,
      `Got it — ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded. Add a short message if you like, then press Send.`,
      {
        files: uploaded,
        image_urls: uploaded.map((f) => f.url).filter(Boolean),
      }
    );
  } catch (e) {
    console.error("UPLOAD ERROR:", e);

    return fail(
      res,
      "Sorry — upload failed. Please try again.",
      e?.message || "Unknown upload error"
    );
  }
}