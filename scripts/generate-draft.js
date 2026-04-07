const fs = require("fs");
const { readFileSync } = fs;
const { execFileSync } = require("child_process");

// --- CONFIGURATION ---
const FRESHDESK_DOMAIN = process.env.FRESHDESK_DOMAIN;
const FRESHDESK_API_KEY = process.env.FRESHDESK_API_KEY;
const FRESHDESK_FOLDER_ID = "205000025212"; // <--- CHECK YOUR FOLDER ID
const AI_API_KEY = process.env.AI_API_KEY;

const IGNORED_FILES = [
  "package-lock.json",
  "yarn.lock",
  "README.md",
  "docs/",
  "tests/",
  "test-data.md",
];

const articleData = JSON.parse(readFileSync("articles.json", "utf8"));
const articleExamples = articleData.articles;
const styleGuide = articleExamples.filter(a => a.title != "HearLink Article Style Guide")

console.log(...articleExamples.map((a) => ["\n--- ARTICLE EXAMPLE ---\n", a.title, a.content]));

// const getReadmeContext = () => {
//   try {
//     const readmePath = path.join(__dirname, "../../README.md");
//     const readmeContent = readFileSync(readmePath, 'utf8');
//     return readmeContent;
//   } catch (error) {
//     console.warn("⚠️ Could not read README.md file:", error.message);
//     return "";
//   }
// } 

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

// 
async function run() {
  try {
    // --- 1. GET PR DETAILS ---
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    const prBody = eventData.pull_request.body || "";
    const prTitle = eventData.pull_request.title;

    // --- 2. EXTRACT NOTES (SIMPLE VERSION) ---
    // const startTag = "## AI GENERATION START";
    // const endTag = "## AI GENERATION END";
    // const startIndex = prBody.indexOf(startTag);
    // const endIndex = prBody.indexOf(endTag);

    if (!prBody || prBody.trim().length < 5) {
  console.log("Skipping: PR body is empty.");
  process.exit(0);
}

    // if (startIndex === -1 || endIndex === -1) {
    //   console.log("Skipping: Tags not found.");
    //   process.exit(0);
    // }

    // const rawNotes = prBody
    //   .substring(startIndex + startTag.length, endIndex)
    //   .trim();

    // console.log(`DEBUG: Found notes length: ${rawNotes.length}`);

    // if (rawNotes.length < 5) {
    //   console.log("Skipping: Notes are empty.");
    //   process.exit(0);
    // }

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
              content: `You are the offical HearLink documentation writer. Output HTML only. You must follow these non-negotiable rules: STYLE
              - You must follow the formatting and style rules defined in this style guide: ${JSON.stringify(styleGuide)}
              - Use UK English - No marketing fluff.
- No emojis.
- No speculation.
- Do not invent functionality.
- Do not add features not explicitly described.

HELP CENTRE ARTICLE FORMAT
Always structure full articles exactly like this:

Title

Short introductory paragraph explaining what the feature allows.

Line break.

"In this article we'll cover how to:" or 
"In this article we'll cover:" followed by a clean bullet-style list (no numbered steps).

Then clear section headings using this format:

## Section Name

Instructions written as direct actions.
No numbered lists.
Short, clean sentences.
No over-explaining.

End naturally. No summaries unless explicitly requested.

If information is missing, ask concise clarification questions before writing.`,
            },
            {
              role: "user",
            content: `Using the HearLink documentation rules provided, and by reviewing these articles, including a draft article so you know how they should written: ${JSON.stringify(articleExamples)}. Write a full Help Centre article based ONLY on the PR description notes provided.
Only use the information provided in ${prBody}
Do not assume additional functionality.`,
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
