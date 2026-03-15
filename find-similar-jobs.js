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

    const { estimated_yards, waste_type, extras } = req.body || {};

    if (!estimated_yards) {
      return res.status(400).json({
        ok: false,
        error: "Missing estimated_yards",
      });
    }

    const minYards = Math.max(1, Number(estimated_yards) - 2);
    const maxYards = Number(estimated_yards) + 2;

    let query = supabase
      .from("completed_job_references")
      .select("*")
      .gte("actual_yards", minYards)
      .lte("actual_yards", maxYards)
      .order("created_at", { ascending: false })
      .limit(5);

    if (waste_type) {
      query = query.eq("waste_type", waste_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      matches: data || [],
    });
  } catch (err) {
    console.error("FIND SIMILAR JOBS ERROR:", err);

    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to find similar jobs",
    });
  }
}