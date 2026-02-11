import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    requireAuth(req);

    const { job_id, count } = req.body || {};

    if (!job_id || !count || count < 1 || count > 6) {
      throw new Error('Invalid request');
    }

    const uploads = [];

    for (let i = 0; i < count; i++) {
      const path = `${job_id}/${crypto.randomUUID()}.jpg`;

      const { data, error } = await supabase
        .storage
        .from('job-photos')
        .createSignedUploadUrl(path);

      if (error) throw error;

      uploads.push({
        path,
        uploadUrl: data.signedUrl
      });
    }

    res.status(200).json({ uploads });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
