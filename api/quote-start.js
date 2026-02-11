import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    requireAuth(req);

    const {
      postcode,
      waste_type,
      access_notes,
      service_used,
      extras
    } = req.body || {};

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        postcode,
        waste_type,
        access_notes,
        service_used,
        extras
      })
      .select('id')
      .single();

    if (error) throw error;

    res.status(200).json({ job_id: data.id });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}
