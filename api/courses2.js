// api/courses2.js — Vercel serverless function
// Backup golf course API using RapidAPI Golf Course Finder
// Called when primary /api/courses returns default slope 113

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { search, state } = req.query;
  if (!search) return res.status(400).json({ error: "search param required" });

  try {
    const url = new URL("https://golf-course-finder.p.rapidapi.com/courses");
    url.searchParams.set("name", search);
    if (state) url.searchParams.set("state", state);

    const response = await fetch(url.toString(), {
      headers: {
        "x-rapidapi-host": "golf-course-finder.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Upstream API error", status: response.status });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("courses2 error:", err);
    return res.status(500).json({ error: err.message });
  }
}