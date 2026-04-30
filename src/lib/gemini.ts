import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: API_KEY });

const GEMINI_MODEL = "gemini-flash-latest"; 
const GEMINI_PRO_MODEL = "gemini-3.1-pro-preview";

function extractJSON(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.substring(start, end + 1);
  }
  return text;
}

function extractHTML(text: string): string {
  // Try to find code block first
  const match = text.match(/```html\s*([\s\S]*?)```/) || text.match(/```\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  
  // If no markdown, try to find DOCTYPE or <html>
  const lower = text.toLowerCase();
  const startIdx = Math.max(lower.indexOf('<!doctype'), lower.indexOf('<html'));
  if (startIdx !== -1) {
    const endIdx = lower.lastIndexOf('</html>');
    if (endIdx !== -1) return text.substring(startIdx, endIdx + 7);
    return text.substring(startIdx);
  }
  return text.trim();
}

const AIPLEX_API_CONTEXT = `
AIPLEX PLATFORM CONTEXT — READ CAREFULLY:

You are generating a mini-app that will run inside the AIPLEX platform. The platform
injects a global object \`window.AIPLEX\` before your app code runs.

═══════════════════════════════════════════════════════════════
AIPLEX MULTI-PAGE MINI-APP ARCHITECTURE — GENERATION RULES
═══════════════════════════════════════════════════════════════

You are generating a complete, multi-page mini-app for the AIPLEX platform.
The app uses a client-side navigation shell with the <open> tag for page
transitions. You must generate the FULL app HTML including the shell, all
screen definitions, and all shared components.

APP SHELL REQUIREMENTS:
1. Define a <main id="screen-container"> for screen rendering.
2. Include a persistent bottom navigation bar with <open> tags linking
   to all main screens. Active screen is highlighted with class "active".
3. All screens must use AppShell.registerScreen('name', { template, onInit, onEnter, onExit }).
4. The home screen must be registered and navigated to on app start.
5. Use smooth, GPU-accelerated CSS transitions between screens (200ms ease-out).

<open> TAG USAGE:
<open target="screenName">Link Text</open>
<open target="screenName" params="key=value&key2=value2">Link</open>
<open target="back">Go Back</open>

- target="back" triggers history.back().
- params are passed to onEnter(params) as an object.
- The <open> tag must be styled as a tappable element (min 44x44px).

SCREEN LIFECYCLE:
Each screen object:
{
  template: \`HTML string\`,
  async onInit() { /* called once, setup data listeners */ },
  async onEnter(params) { /* called every time screen is shown */ },
  onExit() { /* save state, clean up */ }
}

DATASET API — Real-time Firebase-like database (window.AIPLEX.dataset):
  await AIPLEX.dataset.set('path', value)
  await AIPLEX.dataset.update('path', { key: val })
  const id = await AIPLEX.dataset.push('path', value)
  const val = await AIPLEX.dataset.get('path')
  const unsub = AIPLEX.dataset.on('path', (value) => { ... })
  await AIPLEX.dataset.remove('path')

STORAGE API — Base64 file storage (window.AIPLEX.storage):
  await AIPLEX.storage.write('id.png', dataUri, 'image/png')
  const src = await AIPLEX.storage.read('id.png')

AUTH API — Per-app user authentication (window.AIPLEX.auth):
  const user = await AIPLEX.auth.signup(email, password, name)
  const user = await AIPLEX.auth.login(email, password)
  const session = await AIPLEX.auth.verify(token)

APP NAV API (window.AIPLEX.app):
  AIPLEX.app.navigate(target, params)

1. ALL persistent state must use AIPLEX.dataset.
2. The app must be a SINGLE self-contained HTML file.
`;

export async function analyzeMultiImages(images: { data: string, mimeType: string }[], userPrompt: string) {
  const prompt = `
    Analyze these ${images.length} interface images and provide a cohesive, multi-page technical specification for the app.
    
    User description/context: "${userPrompt}"
    
    CRITICAL REQUIREMENT: 
    1. The "appDescription" MUST be a massive, exhaustive masterclass in technical specification (min 2100 words). 
    2. EACH page in the "pages" array MUST have a "prompt" field that is NO LESS THAN 1500 words of dense, actionable instructions covering typography, color logic, exact layout metrics, and sophisticated functional behavior.
    3. The overall architecture must use the AIPLEX Multi-Page API (<open> tags and AppShell).

    Return a JSON object: {
      "appName": "...",
      "appDescription": "EXTREMELY DETAILED SPEC (2100+ words)...",
      "primaryColor": "#...",
      "theme": "light" | "dark",
      "techSpecs": {
        "colors": [...],
        "fonts": "..."
      },
      "pages": [
        {
          "id": "home",
          "name": "...",
          "description": "...",
          "components": [...],
          "needsAuth": true,
          "referenceImageIndex": 0,
          "prompt": "EXTREMELY DETAILED PAGE PROMPT (1500+ words)..."
        }
      ],
      "sharedComponents": [...],
      "globalState": {}
    }
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_PRO_MODEL,
    contents: {
      parts: [
        { text: prompt },
        ...images.map(img => ({
          inlineData: {
            data: img.data.split(',')[1] || img.data,
            mimeType: img.mimeType
          }
        }))
      ]
    }
  });

  const text = extractJSON(response.text || '');
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON", text);
    return null;
  }
}

export async function generateMiniApp(prompt: string, context?: string, images?: { data: string, mimeType: string }[]) {
  const fullPrompt = `
    You are an expert mobile-first web developer. 
    ${AIPLEX_API_CONTEXT}
    Create a complete, self-contained HTML file (including CSS and JavaScript in the same file) for a mini-app based on this idea: "${prompt}".
    ${context ? `Detailed Technical Specs from Analysis: ${context}` : ''}
    
    ${images && images.length > 0 ? "REFER TO THE ATTACHED IMAGES FOR VISUAL STYLE, LAYOUT, AND UI PATTERNS. Recreate them as accurately as possible while adapting to the functional requirements." : ""}

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

  const contents: any[] = [{ role: 'user', parts: [{ text: fullPrompt }] }];
  
  if (images && images.length > 0) {
    images.forEach(img => {
      contents[0].parts.push({
        inlineData: {
          data: img.data.split(',')[1] || img.data,
          mimeType: img.mimeType
        }
      });
    });
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents
  });

  return extractHTML(response.text || '');
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

  return extractHTML(response.text || '');
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

  const text = extractJSON(response.text || '');
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

  const text = extractJSON(response.text || '');
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

  const match = (response.text || '').match(/```(?:svg|xml)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return (response.text || '').trim();
}
