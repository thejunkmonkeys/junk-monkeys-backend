import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../lib/auth.js';

function calculateLoads(estimatedYards) {
  const bands = [1, 2, 4, 7, 10, 14];
  let remaining = Math.ceil(estimatedYards);
  const loads = [];

  while (remaining > 0) {
    const band =
      bands.slice().reverse().find(b => b <= remaining) || 1;
    loads.push(band);
    remaining -= band;
  }

  return loads;
}

export default async function handler(req, res) {
  try {
    requireAuth(req);

    const {
      job_id,
      estimated_yards,
      fixed_price_total,
      photo_paths
    } = req.body || {};

    if (!job_id || !estimated_yards || !fixed_price_total) {
      throw new Error('Missing required data');
    }

    const loads = calculateLoads(estimated_yards);

    const { error } = await supabase
      .from('jobs')
      .update({
        estimated_yards,
        recommended_loads: {
          loads,
          total_yards: loads.reduce((a, b) => a + b, 0)
        },
        fixed_price_total,
        photo_paths,
        status: 'quoted'
      })
      .eq('id', job_id);

    if (error) throw error;

    res.status(200).json({
      loads_to_book: loads,
      fixed_price_total,
      disclaimer:
        'Final price subject to on-site verification if waste differs from photos provided.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
