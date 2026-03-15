import OpenAI from "openai"
import { supabase } from "./supabase"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

function recommendCollectionYards(totalYards) {
  if (totalYards <= 2) return 2
  if (totalYards <= 3) return 3
  if (totalYards <= 5) return 5
  if (totalYards <= 7) return 7
  if (totalYards <= 10) return 10
  return 12
}

export async function analyzeJob(jobId) {

  const { data: photos, error } = await supabase
    .from("job_photos")
    .select("path")
    .eq("job_id", jobId)

  if (error) throw error

  const imageInputs = photos.map(photo => {

    const { data } = supabase.storage
      .from("chat-uploads")
      .getPublicUrl(photo.path)

    return {
      type: "input_image",
      image_url: data.publicUrl
    }

  })

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Estimate the volume of rubbish in these photos.

Return JSON:

{
  "volume_yd3": number,
  "confidence": number
}
`
          },
          ...imageInputs
        ]
      }
    ]
  })

  const result = JSON.parse(response.output_text)

  const recommended = recommendCollectionYards(result.volume_yd3)

  await supabase
    .from("jobs")
    .update({
      estimated_yards: result.volume_yd3
    })
    .eq("id", jobId)

  return {
    yards: result.volume_yd3,
    recommended_collection: recommended,
    confidence: result.confidence
  }
}