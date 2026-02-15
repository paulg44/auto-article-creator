const fs = require("fs");

// --- CONFIGURATION ---
const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;
const FRESHDESK_FOLDER_ID = "205000025212"; // <--- CHECK YOUR FOLDER ID
const AI_API_KEY = process.env.AI_API_KEY;

// --- SAFETY: TIMEOUT FUNCTION ---
// This prevents the script from hanging forever
const fetchWithTimeout = async (url, options, timeout = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw new Error(`Request timed out or failed: ${error.message}`);
  }
};

async function run() {
  try {
    // --- 1. GET PR DETAILS ---
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const prBody = eventData.pull_request.body || "";
    const prTitle = eventData.pull_request.title;

    // --- 2. EXTRACT NOTES (SIMPLE VERSION) ---
    // We reverted to the simple version to prevent infinite loops.
    // Make sure you only have ONE set of tags in your PR description!
    const startTag = "## AI GENERATION START";
    const endTag = "## AI GENERATION END";
    const startIndex = prBody.indexOf(startTag);
    const endIndex = prBody.indexOf(endTag);

    if (startIndex === -1 || endIndex === -1) {
      console.log("Skipping: Tags not found.");
      process.exit(0);
    }

    const rawNotes = prBody
      .substring(startIndex + startTag.length, endIndex)
      .trim();

    console.log(`DEBUG: Found notes length: ${rawNotes.length}`);

    if (rawNotes.length < 5) {
      console.log("Skipping: Notes are empty.");
      process.exit(0);
    }

    // --- 3. CALL AI ---
    console.log("📝 contacting AI (15s timeout)...");

    const aiReq = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a support writer. Output HTML only.",
            },
            {
              role: "user",
              content: `Write a support article for: ${rawNotes}`,
            },
          ],
        }),
      },
    );

    const aiJson = await aiReq.json();
    if (aiJson.error) throw new Error(JSON.stringify(aiJson.error));
    const articleContent = aiJson.choices[0].message.content;

    // --- 4. POST TO FRESHDESK ---
    console.log("🚀 Uploading to Freshdesk (15s timeout)...");

    const fdAuth = Buffer.from(`${FRESHDESK_API_KEY}:X`).toString("base64");

    const fdReq = await fetchWithTimeout(
      `https://${FRESHDESK_DOMAIN}.freshdesk.com/api/v2/solutions/folders/${FRESHDESK_FOLDER_ID}/articles`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${fdAuth}`,
        },
        body: JSON.stringify({
          title: `[Draft] ${prTitle}`,
          description: articleContent,
          status: 1,
        }),
      },
    );

    if (!fdReq.ok) {
      const errText = await fdReq.text();
      // DEBUG: Print the Status Code (404, 401, etc.)
      throw new Error(
        `Freshdesk Error [${fdReq.status} ${fdReq.statusText}]: ${errText}`,
      );
    }

    console.log("✅ DONE.");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

run();
