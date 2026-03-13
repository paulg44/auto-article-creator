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

console.log(...articleExamples.map((a) => ["\n--- ARTICLE EXAMPLE ---\n", a.title, a.content]));

const getReadmeContext = () => {
  try {
    const readmePath = path.join(__dirname, "../../README.md");
    const readmeContent = readFileSync(readmePath, 'utf8');
    return readmeContent;
  } catch (error) {
    console.warn("⚠️ Could not read README.md file:", error.message);
    return "";
  }
} 

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
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
      throw new Error('GITHUB_EVENT_PATH environment variable is not set');
    }
    const eventData = JSON.parse(readFileSync(eventPath, 'utf8'));
    const prTitle = eventData.pull_request.title;
    const baseSha = eventData.pull_request.base.sha;
    const mergeSha = eventData.pull_request.head.sha;

    console.log('Reading code changes from PR...');

    const changedFiles = execFileSync('git', [ 'diff', '--name-only', `${baseSha}...${mergeSha}`])
      .toString()
      .trim()
      .split('\n').filter(Boolean)


    const relevantFiles = changedFiles.filter(
      (file) =>
        !IGNORED_FILES.some((pattern) => {
          if (pattern.endsWith('/')) {
            return file.startsWith(pattern);
          }
          if (pattern.startsWith('.')) {
            return file.endsWith(pattern.slice(1));
          }
          return file === pattern;
        })
    );

    console.log('Base ref:', baseSha);
console.log('Head ref:', mergeSha);
console.log('Changed files:', changedFiles);
console.log('Relevant files:', relevantFiles);

    if (relevantFiles.length === 0) {
      console.log('No relevant code changes found. Exiting.');
      return;
    }

    const rawDiff = execFileSync('git', ['diff',`${baseSha}...${mergeSha}`, '--', ...relevantFiles]).toString();

    const readmeContext = getReadmeContext();

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
              content: `You are the offical HearLink documentation writer. Output HTML only. You must follow these non-negotiable rules: STYLE - Use UK English - No marketing fluff.
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
            content: `Using the HearLink documentation rules provided, the information in ${readmeContext} and by reviewing these articles so you know how they should written: ${articleExamples}. Write a full Help Centre article based ONLY on the PR description notes provided.

Only use the information provided in ${rawDiff}.
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
