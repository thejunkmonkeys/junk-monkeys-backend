import crypto from 'crypto';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    requireAuth(req);

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { job_id, count } = req.body || {};

    if (!job_id || !Number.isInteger(count) || count < 1 || count > 6) {
      throw new Error('Invalid request');
    }

    const uploads = [];

    for (let i = 0; i < count; i++) {
      const path = `${job_id}/${crypto.randomUUID()}.jpg`;

      const { data, error } = await supabase.storage
        .from('chat-uploads')
        .createSignedUploadUrl(path);

      if (error) throw error;

      uploads.push({
        path,
        uploadUrl: data.signedUrl,
        token: data.token
      });
    }

    return res.status(200).json({ uploads });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
