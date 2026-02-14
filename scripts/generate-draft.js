const fs = require("fs");

const FRESHDESK_FOLDER_ID = "205000025212";
const AI_MODEL = "gpt-5-mini";

// --- 1. GET PR DETAILS ---
const eventPath = process.env.GITHUB_EVENT_PATH;
const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const prBody = eventData.pull_request.body || "";
const prTitle = eventData.pull_request.title;

// --- 2. EXTRACT NOTES ---
// This regex looks for content between the tags globally /g
const regex = /([\s\S]*?)/g;
let match;
let rawNotes = "";

// Loop through ALL matches found in the text
while ((match = regex.exec(prBody)) !== null) {
  const content = match[1].trim();
  // If we found a block that actually has text, use it!
  if (content.length > 5) {
    rawNotes = content;
    break;
  }
}

if (!rawNotes) {
  console.log("Skipping: Found tags, but they were all empty.");
  process.exit(0);
}

console.log(`DEBUG: Found valid notes: "${rawNotes.substring(0, 50)}..."`);

// --- 3. DEFINE YOUR STYLE ---
const SYSTEM_PROMPT = `
You are a technical support writer. 
Output ONLY HTML. Do not use Markdown backticks.
Structure the article with these headers: <h3>Summary</h3>, <h3>Instructions</h3>.
Tone: Professional, concise, and friendly.
Refine the user's raw notes into a polished support article.
`;

async function run() {
  try {
    console.log("📝 Generating content with AI...");

    // --- 4. CALL AI API (OpenAI Example) ---
    const aiReq = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Draft an article from these notes:\n${rawNotes}`,
          },
        ],
      }),
    });

    const aiJson = await aiReq.json();
    if (aiJson.error) throw new Error(aiJson.error.message);
    const articleContent = aiJson.choices[0].message.content;

    // --- 5. POST TO FRESHDESK ---
    console.log("🚀 Uploading to Freshdesk...");

    const fdDomain = process.env.FRESHDESK_DOMAIN;
    const fdAuth = Buffer.from(`${process.env.FRESHDESK_API_KEY}:X`).toString(
      "base64",
    );

    const fdReq = await fetch(
      `https://${fdDomain}.freshdesk.com/api/v2/solutions/folders/${FRESHDESK_FOLDER_ID}/articles`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${fdAuth}`,
        },
        body: JSON.stringify({
          title: `[Draft] ${prTitle}`,
          description: articleContent,
          status: 1, // 1 = Draft, 2 = Published
        }),
      },
    );

    if (!fdReq.ok) {
      const errText = await fdReq.text();
      throw new Error(`Freshdesk API Error: ${errText}`);
    }

    const fdJson = await fdReq.json();
    console.log(
      `✅ Success! Article created: https://${fdDomain}.freshdesk.com/a/solutions/articles/${fdJson.id}`,
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

run();
