import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const {
      job_id,
      final_price,
      actual_yards,
      waste_type,
      extras,
      summary
    } = req.body || {};

    if (!job_id || !actual_yards) {
      return res.status(400).json({
        ok: false,
        error: "Missing job_id or actual_yards"
      });
    }

    const { data, error } = await supabase
      .from("completed_job_references")
      .insert({
        job_id,
        final_price,
        actual_yards,
        waste_type,
        extras: extras || {},
        summary
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      reference_job: data
    });

  } catch (err) {
    console.error("SAVE COMPLETED JOB ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to save completed job"
    });
  }
}