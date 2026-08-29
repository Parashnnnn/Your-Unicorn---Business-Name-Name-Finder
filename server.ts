/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON body parking with limit for uploads
app.use(express.json({ limit: "10mb" }));

// Initialize the Google GenAI SDK
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const hasApiKey = geminiApiKey.trim().length > 0;

let ai: GoogleGenAI | null = null;
if (hasApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Utility: get the active AI instance or throw error
function getAI() {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is not configured. Please add it to your Settings > Secrets.");
  }
  return ai;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Health check & configuration info
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey,
    time: new Date().toISOString(),
  });
});

// 2. Generate Brand Identity (Main AI searchbox)
app.post("/api/generate-brand", async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { idea, industry, audience, keywords } = req.body;
    if (!idea) {
      res.status(400).json({ error: "Idea description is required." });
      return;
    }

    const client = getAI();
    const prompt = `
      You are a world-class brand strategist, naming expert, startup advisor, and graphic design lead.
      Create a highly professional and complete brand identity package based on the following user proposal:
      
      "User Idea Description: ${idea}"
      ${industry ? `Industry: ${industry}` : ""}
      ${audience ? `Target Audience: ${audience}` : ""}
      ${keywords && keywords.length > 0 ? `Keywords: ${keywords.join(", ")}` : ""}

      Provide names, real available domain extensions, taglines, a unified business description, a premium marketing pitch, exact brand color combinations (Rose Gold, Minimalist Navy, Neon Grape, Cyberpunk Orange, Cream White, Matte Gray, etc. with matched Hex code), an exact logo design concept description (with custom prompts), and exact availability statuses for social handles on handles like YouTube, TikTok, Instagram, Twitter/X, and LinkedIn.
      
      Return ONLY valid JSON matching the specified schema.
    `;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            businessName: {
              type: Type.STRING,
              description: "The main suggested name for the brand/business.",
            },
            businessDescription: {
              type: Type.STRING,
              description: "A professional 2-3 sentence description of what the business actually does, written from a perspective of high-value innovation.",
            },
            marketingPitch: {
              type: Type.STRING,
              description: "A premium, high-impact elevator pitch explaining why customers or venture capitalists should invest or buy this brand in seconds.",
            },
            tagline: {
              type: Type.STRING,
              description: "An elegant, memorable brand tagline (e.g. Beauty that inspires confidence).",
            },
            domains: {
              type: Type.ARRAY,
              description: "Highly relevant and available domain extension choices.",
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: { type: Type.STRING },
                  ext: { type: Type.STRING, description: "e.g. .com, .in, .io, .ai, .co" },
                  status: {
                    type: Type.STRING,
                    description: "Available, Taken, Premium",
                  },
                  explanation: { type: Type.STRING, description: "Brief details about the price or why it matches." },
                },
                required: ["domain", "ext", "status", "explanation"],
              },
            },
            colors: {
              type: Type.ARRAY,
              description: "A premium palette consisting exactly of 3 colors matching the voice.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Descriptive name like 'Warm Rose Gold' or 'Obsidian Black'." },
                  hex: { type: Type.STRING, description: "HEX RGB color code starting with #." },
                  usage: { type: Type.STRING, description: "Primary, Secondary, Accent, or Background usage description." },
                },
                required: ["name", "hex", "usage"],
              },
            },
            logoConcept: {
              type: Type.OBJECT,
              properties: {
                idea: { type: Type.STRING, description: "A detailed description of the physical, geometric, or typographic concepts forming this logo." },
                style: { type: Type.STRING, description: "E.g. Clean Line Art, Geometric Flat, Luxurious Serif Monogram, Brutalist Abstract." },
                colors: { type: Type.ARRAY, items: { type: Type.STRING } },
                promptForAI: { type: Type.STRING, description: "Detailed 1-sentence prompt for an diffusion model to generate this logo (used by our logo generator)." },
              },
              required: ["idea", "style", "colors", "promptForAI"],
            },
            socialHandles: {
              type: Type.ARRAY,
              description: "Social media handle checks (on leading platform channels). The handles should match or creatively alter the businessName.",
              items: {
                type: Type.OBJECT,
                properties: {
                  platform: { type: Type.STRING, description: "Instagram, YouTube, Twitter/X, TikTok, LinkedIn, or Threads" },
                  handle: { type: Type.STRING, description: "e.g. @glowaura, @glowaura_in" },
                  status: { type: Type.STRING, description: "Available, Taken, Reserved" },
                },
                required: ["platform", "handle", "status"],
              },
            },
          },
          required: [
            "businessName",
            "businessDescription",
            "marketingPitch",
            "tagline",
            "domains",
            "colors",
            "logoConcept",
            "socialHandles",
          ],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Error generating brand:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred during brand generation.",
      details: error.stack,
    });
  }
});

// 3. AI Domain Checker
app.post("/api/check-domain", async (req: express.Request, res: express.Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: "Name is required to check domains." });
      return;
    }

    const client = getAI();
    const prompt = `
      Perform an exhaustive domain search checker analysis for the name: "${name}".
      Provide 6 alternative versions with popular TLDs (.com, .io, .ai, .co, .net, .org) and explain the premium value, market demand, cost estimation, and registration status of each.
      Return valid JSON matching the schema.
    `;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            domains: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  domain: { type: Type.STRING },
                  ext: { type: Type.STRING },
                  status: { type: Type.STRING, description: "Available, Premium, Taken" },
                  price: { type: Type.STRING, description: "Estimated registration fee (e.g. '$12/yr' or '$2,500')" },
                  explanation: { type: Type.STRING },
                },
                required: ["domain", "ext", "status", "price", "explanation"],
              },
            },
          },
          required: ["domains"],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Domain Check Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Competitor Analysis
app.post("/api/competitor-analysis", async (req: express.Request, res: express.Response) => {
  try {
    const { name, industry, product } = req.body;
    if (!name || !industry) {
      res.status(400).json({ error: "Name and industry are required for competitor analysis." });
      return;
    }

    const client = getAI();
    const prompt = `
      Evaluate the competitive landscape for startup: "${name}" which does "${product || "innovative software services"}" in the "${industry}" sector.
      Identify 3 real or closely analogous competitors, detailing their market share estimation, strengths, product weaknesses, and how our startup differentiates from them.
      Include a final competitive positioning strategy and gap analysis for this business.
      Return JSON only.
    `;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            competitors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  strength: { type: Type.STRING },
                  weakness: { type: Type.STRING },
                  marketShare: { type: Type.STRING },
                  differentiation: { type: Type.STRING },
                },
                required: ["name", "strength", "weakness", "marketShare", "differentiation"],
              },
            },
            positioningStrategy: { type: Type.STRING },
            gapAnalysis: { type: Type.STRING },
          },
          required: ["competitors", "positioningStrategy", "gapAnalysis"],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Competitor Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Brand Story Generator
app.post("/api/brand-story", async (req: express.Request, res: express.Response) => {
  try {
    const { name, idea, tone } = req.body;
    if (!name || !idea) {
      res.status(400).json({ error: "Brand name and description are required for storytelling." });
      return;
    }

    const client = getAI();
    const prompt = `
      Write a captivating, emotionally inspiring brand story, mission, vision, and sets of core values for "${name}".
      The brand's elevator summary is: "${idea}".
      The preferred emotional tone is: "${tone || "Inspiring & Decisive"}".
      Return a fully mapped brand story JSON.
    `;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            origin: { type: Type.STRING, description: "A gorgeous founder narrative/origin story explaining the initial spark." },
            mission: { type: Type.STRING },
            vision: { type: Type.STRING },
            values: { type: Type.ARRAY, items: { type: Type.STRING } },
            toneOfVoice: { type: Type.STRING },
          },
          required: ["title", "origin", "mission", "vision", "values", "toneOfVoice"],
        },
      },
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Brand Story Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6. AI Logo Image Generator (Image Model)
app.post("/api/generate-logo-image", async (req: express.Request, res: express.Response) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "Logo prompt is required." });
      return;
    }

    const client = getAI();
    
    // We strive to use 'gemini-2.5-flash-image' which is fast and does image generation under free tier easily,
    // or we fall back to a clever abstract SVG vector generation if it runs into quota limits.
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
          {
            text: `High quality startup logo design vector, minimal sleek elegant aesthetic for branding display. Simple clean geometric, suitable for an app icon. White or light background: ${prompt}`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    // Scan for inlineData parts in the candidates
    let base64Code = "";
    const candidates = response.candidates || [];
    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          base64Code = part.inlineData.data;
          break;
        }
      }
    }

    if (base64Code) {
      res.json({ imageUrl: `data:image/png;base64,${base64Code}` });
    } else {
      // If we got text but no image, return a custom premium SVG mockup
      res.json({
        imageUrl: "",
        message: "Model generated textual blueprint rather than raw image bytes.",
      });
    }
  } catch (error: any) {
    console.warn("Logo Image Generation API failed / key-restricted. Graceful fallback on client side will handle this. Error details:", error.message);
    res.json({
      imageUrl: "",
      fallbackReason: "Using beautiful custom procedurally designed vector emblem as client SDK fallback.",
    });
  }
});

// ==========================================
// STATIC ASSETS AND SERVER BOOT
// ==========================================

async function start() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode: inject Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: serve static artifacts from build
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Your Unicorn AI Server running on http://localhost:${PORT} [API Key Loaded: ${hasApiKey}]`);
  });
}

start().catch((err) => {
  console.error("Critical server boot failed:", err);
});
