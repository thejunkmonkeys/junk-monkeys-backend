import { supabase } from "../lib/supabase.js";
import { requireAuth } from "../lib/auth.js";

export default async function handler(req, res) {
  try {
    requireAuth(req);

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { jobId, job_id } = req.body || {};
    const resolvedJobId = jobId || job_id;

    if (!resolvedJobId) {
      return res.status(400).json({ ok: false, error: "Missing jobId" });
    }

    const { data: photos, error: photosError } = await supabase
      .from("job_photos")
      .select("id, path, created_at")
      .eq("job_id", resolvedJobId)
      .order("created_at", { ascending: true });

    if (photosError) throw photosError;

    const signedPhotos = [];

    for (const photo of photos || []) {
      const { data, error } = await supabase.storage
        .from("chat-uploads")
        .createSignedUrl(photo.path, 3600);

      if (error) throw error;

      signedPhotos.push({
        id: photo.id,
        path: photo.path,
        created_at: photo.created_at,
        signedUrl: data.signedUrl,
      });
    }

    return res.status(200).json({
      ok: true,
      jobId: resolvedJobId,
      photos: signedPhotos,
    });
  } catch (err) {
    console.error("SIGNED URL ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to create signed URLs",
    });
  }
}
