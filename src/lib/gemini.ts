import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: API_KEY });

const GEMINI_MODEL = "gemini-flash-latest"; 
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";

const AIPLEX_API_CONTEXT = `
AIPLEX PLATFORM CONTEXT — READ CAREFULLY:

You are generating a mini-app that will run inside the AIPLEX platform. The platform
injects a global object ` + "`window.AIPLEX`" + ` before your app code runs. You have access to
a real-time Firebase database, a base64 file storage system, and a full authentication
system — all scoped to this app.

NEW: This platform has native OFFLINE-FIRST support. 
- AIPLEX.dataset.read() and getAll() automatically cache data locally for offline viewing.
- AIPLEX.dataset.write() and delete() queue changes while offline and sync automatically when online.
- AIPLEX.auth.verify() works offline if a session was previously active.
- AIPLEX.auth.logout() handles session termination correctly.
- AIPLEX.storage.read() caches files locally after the first fetch.

Use these freely to build apps that work everywhere!

═══════════════════════════════════════════════════════════════
AIPLEX DATASET API — IDENTICAL TO FIREBASE REALTIME DATABASE
═══════════════════════════════════════════════════════════════

The AIPLEX platform gives your mini-app a real-time database that works
exactly like Firebase Realtime Database. You access it via window.AIPLEX.dataset.
The database is a single JSON tree. Paths are slash or dot separated strings.

CRITICAL RULE — NO DUPLICATION:
Writing to a path that already has data UPDATES it. It never creates a duplicate.
The path IS the identity. "users/uid_jacob" is one node. Always. You cannot have two.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WRITE:
  await AIPLEX.dataset.set('path/to/key', value)
  await AIPLEX.dataset.update('path/to/object', { key: val })  // non-destructive merge
  const id = await AIPLEX.dataset.push('path/to/list', value) // auto push key

READ:
  const val = await AIPLEX.dataset.get('path/to/key')
  // Returns the value (string, number, boolean, object) or null if not found
  // Getting an object path returns the full nested object

LIVE:
  const unsub = AIPLEX.dataset.on('path', (value) => { ... })
  const unsub = AIPLEX.dataset.onChildAdded('path', (child, key) => { ... })
  unsub() // stop listening

DELETE:
  await AIPLEX.dataset.remove('path/to/key') // removes node and all children

UTILS:
  const id = AIPLEX.dataset.newId()          // unique push key
  const yes = await AIPLEX.dataset.exists('path') // true | false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

═══════════════════════════════════════════════
STORAGE API — Base64 file storage
═══════════════════════════════════════════════

// Save an image (pass full base64 data URI)
await AIPLEX.storage.write('avatar.png', dataUri, 'image/png');

// Retrieve a file — returns base64 data URI, use directly as <img src>
const src = await AIPLEX.storage.read('avatar.png');
document.querySelector('#avatar').src = src;

// Delete a file
await AIPLEX.storage.delete('avatar.png');

// List all files
const files = await AIPLEX.storage.list();
// → [{ id: 'avatar.png', mimeType: 'image/png', sizeBytes: 12400, createdAt: 1234567 }]

To store user-uploaded images: use FileReader to get base64, then storage.write().

═══════════════════════════════════════════════
AUTH API — Per-app user authentication
═══════════════════════════════════════════════

// Sign up a new user
const user = await AIPLEX.auth.signup(email, password, displayName, { role: 'player' });
// → { authUserId, token, email, displayName }
// Store token in localStorage for session persistence

// Log in
const user = await AIPLEX.auth.login(email, password);
// → { authUserId, token, email, displayName }

// Verify a stored token (call on app load to restore session)
const session = await AIPLEX.auth.verify(localStorage.getItem('token'));
if (!session) { showLoginScreen(); }

// Log out
await AIPLEX.auth.logout(localStorage.getItem('token'));
localStorage.removeItem('token');

// Update user profile
await AIPLEX.auth.updateUser(authUserId, { displayName: 'New Name', metadata: { score: 99 } });

// Delete a user
await AIPLEX.auth.deleteUser(authUserId);

// List all users (admin use)
const users = await AIPLEX.auth.listUsers();

IMPORTANT: Passwords are hashed with SHA-256 client-side before storage.
Never store or transmit raw passwords.
Sessions expire after 24 hours. Always check verify() on app load.

═══════════════════════════════════════════════
RULES FOR AI APP GENERATION
═══════════════════════════════════════════════

1. ALL state that should persist must use AIPLEX.dataset.write — never rely on localStorage
   alone for data that should survive across users or devices.
2. Use AIPLEX.auth for any app that has the concept of users, profiles, or login.
3. Use AIPLEX.storage for any user-uploaded images or binary data.
4. All AIPLEX API calls are async — always use await or .then().
5. The app must be a SINGLE self-contained HTML file. No external JS files.
6. CDN libraries are allowed (e.g. from cdnjs.cloudflare.com).
7. Always design mobile-first. The iframe viewport is ~390px wide on mobile.
8. Add a loading state shown while async operations are in progress.
9. Handle errors from AIPLEX calls gracefully — show user-friendly messages.
10. AIPLEX.context.appId and AIPLEX.context.ownerUid are available if needed.
`;

export async function analyzeNativeVideo(file: File) {
    try {
        // 1. Upload the file to Google's servers
        const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`, {
            method: 'POST',
            headers: { 
              'X-Goog-Upload-Command': 'start, upload, finalize', 
              'X-Goog-Upload-Protocol': 'resumable', 
              'Content-Type': file.type 
            },
            body: file
        });
        
        if (!uploadResponse.ok) {
          const err = await uploadResponse.text();
          console.error("Upload failed", err);
          return null;
        }

        const uploadResult = await uploadResponse.json();
        const fileUri = uploadResult.file.uri;

        // 2. Use the SDK to analyze
        const response = await ai.models.generateContent({
          model: GEMINI_PRO_MODEL,
          contents: [{
            parts: [
              { text: `
                Watch this video and provide an EXHAUSTIVE, high-fidelity technical specification for the app interface shown. 
                Your response MUST be a masterclass in UI/UX reverse-engineering.
                
                CRITICAL REQUIREMENT: The "description" field in the JSON MUST contain a massive, dense, actionable detail of NO LESS THAN 1200 WORDS. This is non-negotiable. Do not summarize in the description. The description field MUST contain the full 1200+ word specification.
                
                Break down every single atom of the design inside the "description" field:
                - TYPOGRAPHY: Identify font families (or closest web-safe/Google Font equivalents), weights (e.g., 400, 600, 700), line-heights, letter-spacing, and responsive font-size scales for every heading and body element.
                - COLOR PALETTE: Provide exact Hex codes for primary, secondary, background, surface, error, and success states. Describe gradient stops, opacity levels, and color theory used (e.g., monochromatic, complementary).
                - LAYOUT & SPACING: Define the grid system (columns/gutters), flexbox configurations, exact padding/margin scales (in px/rem), and max-widths for all containers.
                - VISUAL DEPTH: Document box-shadow values (offset, blur, spread, color), border-radii, and backdrop-filters (blur/saturation).
                - INTERACTIVE LOGIC & TRANSITIONS: Describe every transition duration, easing function (e.g., cubic-bezier), hover effects, active states, and complex interaction logic (e.g., "when button X is clicked, container Y slides in from the left with a bounce effect").
                - ASSETS & ICONOGRAPHY: Describe the style of icons (line vs solid), stroke widths, and provide descriptions for any custom illustrations.
                - FUNCTIONAL SPEC: Outline the precise logic for data handling, state management, and edge cases.

                The goal is to provide a blueprint so perfect that an expert developer can recreate the app 1:1 without ever seeing the video.
                
                Return a JSON object: { 
                  "appType": "...", 
                  "description": "YOUR 1200+ WORD EXHAUSTIVE SPECIFICATION GOES HERE", 
                  "features": [...], 
                  "suggestedName": "...", 
                  "suggestedTags": [...],
                  "techSpecs": {
                    "colors": [...],
                    "fonts": "..."
                  }
                }
              ` },
              { 
                fileData: { 
                  mimeType: file.type, 
                  fileUri: fileUri 
                } 
              }
            ]
          }]
        });

        const text = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (e) {
      console.error("Video analysis error", e);
      return null;
    }
}

export async function generateMiniApp(prompt: string, context?: string) {
  const fullPrompt = `
    You are an expert mobile-first web developer. 
    ${AIPLEX_API_CONTEXT}
    Create a complete, self-contained HTML file (including CSS and JavaScript in the same file) for a mini-app based on this idea: "${prompt}".
    ${context ? `Detailed Technical Specs from Analysis: ${context}` : ''}
    
    Requirements:
    - Fully functional and interactive.
    - Mobile-responsive design with professional polish.
    - Works offline.
    - Replicate the exact visual style, colors, and layout described in the specs.
    - Use clean, modern aesthetics.
    - Use standard Web APIs.
    - No external dependencies except major CDNs (like Lucide or fonts).
    
    Return ONLY the raw HTML code starting with <!DOCTYPE html>. Do not include markdown code blocks or explanations.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: fullPrompt
  });

  let text = response.text || '';
  text = text.replace(/```html/g, '').replace(/```/g, '').trim();
  return text;
}

export async function editAppCode(currentCode: string, editDescription: string) {
  const prompt = `
    ${AIPLEX_API_CONTEXT}
    Here is the current code for a mini-app:
    ---
    ${currentCode}
    ---
    The user wants to make the following changes: "${editDescription}".
    
    Modify the code to implement these changes while maintaining the existing quality and structure.
    Return ONLY the updated raw HTML code. Do not include explanations.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });

  let text = response.text || '';
  text = text.replace(/```html/g, '').replace(/```/g, '').trim();
  return text;
}

export async function generateUpdateSummary(oldCode: string, newCode: string, editDescription: string) {
  const prompt = `
    The user updated an app. 
    Requested change: "${editDescription}"
    Create a short, punchy summary (max 2 sentences) of what was improved or added in this version.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });

  return response.text || "Improved app with new features and fixes.";
}

export async function analyzeVideoOrImage(base64Data: string, mimeType: string) {
  const prompt = `
    Analyze this interface image and provide an EXHAUSTIVE, high-fidelity technical specification for the app interface shown. 
    Your response MUST be a masterclass in UI/UX reverse-engineering.
    
    CRITICAL REQUIREMENT: The "description" field in the JSON MUST contain a massive, dense, actionable detail of NO LESS THAN 1200 WORDS. This is non-negotiable. Do not summarize in the description. The description field MUST contain the full 1200+ word specification.
    
    Break down every single atom of the design inside the "description" field:
    - TYPOGRAPHY: Identify font families (or closest web-safe/Google Font equivalents), weights (e.g., 400, 600, 700), line-heights, letter-spacing, and responsive font-size scales for every heading and body element.
    - COLOR PALETTE: Provide exact Hex codes for primary, secondary, background, surface, error, and success states. Describe gradient stops, opacity levels, and color theory used.
    - LAYOUT & SPACING: Define the grid system (columns/gutters), flexbox configurations, exact padding/margin scales (in px/rem), and max-widths for all containers.
    - VISUAL DEPTH: Document box-shadow values (offset, blur, spread, color), border-radii, and backdrop-filters.
    - INTERACTIVE LOGIC & TRANSITIONS: Describe every transition duration, easing function, hover effects, active states, and complex interaction logic (e.g., "when button X is clicked, container Y slides in from the left with a bounce effect").
    - ASSETS & ICONOGRAPHY: Describe the style of icons (line vs solid), stroke widths, and provide descriptions for any custom illustrations.
    - FUNCTIONAL SPEC: Outline the precise logic for data handling, state management, and edge cases.

    The goal is to provide a blueprint so perfect that an expert developer can recreate the app 1:1 without ever seeing the image.
    
    Return a JSON object: { 
      "appType": "...", 
      "description": "YOUR 1200+ WORD EXHAUSTIVE SPECIFICATION GOES HERE", 
      "features": [...], 
      "suggestedName": "...", 
      "suggestedTags": [...],
      "techSpecs": {
        "colors": [...],
        "fonts": "..."
      }
    }
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_PRO_MODEL,
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            data: base64Data.split(',')[1] || base64Data,
            mimeType
          }
        }
      ]
    }
  });

  const text = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON", text);
    return null;
  }
}

export async function analyzeCodeForMetadata(code: string) {
  const prompt = `
    Analyze this HTML/JS/CSS code for a mini-app and provide suitable metadata for it.
    Code:
    ---
    ${code}
    ---
    Return a JSON object: { 
      "name": "Short catchy name", 
      "tagline": "A one sentence summary",
      "description": "A full paragraph describing what the app does and its features.",
      "category": "Utility" // choose from: Utility, Game, Productivity, Education, Social
    }
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });

  const text = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON", text);
    return null;
  }
}
export async function generateAppIcon(appName: string, appDescription: string) {
  const prompt = `Create a simple, flat SVG icon for an app called "${appName}" that "${appDescription}". The icon should be 100x100, minimalist, and use professional colors. Return ONLY the SVG code.`;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });

  let text = response.text || '';
  text = text.replace(/```svg/g, '').replace(/```xml/g, '').replace(/```/g, '').trim();
  return text;
}
