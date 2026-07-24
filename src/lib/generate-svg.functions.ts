import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import {
  TEMPLATES_BY_ID,
  templateCatalogue,
  renderTemplate,
  type ParamValues,
} from "./svg/templates";

const InputSchema = z.object({
  prompt: z.string().min(1),
  imageDataUrl: z.string().optional(),
});

export type GenerateResult = {
  svg: string;
  mode: "template" | "custom";
  templateId?: string;
  params?: ParamValues;
};

// House style distilled from the cie.py / cie0580.py library, used for the
// open-ended fallback so free-hand diagrams still match the deterministic ones.
const HOUSE_STYLE = `House style (Cambridge IGCSE):
- White background <rect width="100%" height="100%" fill="#ffffff"/>.
- Serif labels: font-family="'Times New Roman','Liberation Serif',Times,serif". Math variables in italic (font-style="italic").
- Main outlines stroke #000000 stroke-width 1.5; arcs, ticks and construction lines stroke-width 1.1; hidden edges stroke-dasharray "7,4".
- Angle numbers ~16px, point/length labels ~19px. Place labels clear of the figure, never overlapping lines.
- Compute every coordinate; do not eyeball. Mark "NOT TO SCALE" (top-right, ~16px) when the drawing is not to scale.
- Give every meaningful element an id (e.g. id="label-A", id="side-AB") so it can be selected and dragged.`;

const ROUTER_SYSTEM = `You convert a math/science teacher's request into a diagram.
You have a library of exact, parameterized diagram templates. Prefer a template whenever one reasonably fits — templates are computed and always geometrically correct.

Templates:
${templateCatalogue()}

Respond with ONLY a JSON object, no prose, no code fence:
{"template": "<template-id or 'custom'>", "params": { ...only keys from that template, matching the request... }}

Rules:
- Use the exact template id and only its documented param keys.
- Fill params from the request; omit a param to accept its default.
- Numeric params must be numbers, text params strings, booleans true/false.
- If no template reasonably fits the request, return {"template":"custom","params":{}}.`;

const CUSTOM_SYSTEM = `You are an SVG generator for math and science teachers. Given a description (and optionally a reference image), return ONE complete, self-contained SVG diagram.

Strict requirements:
- Output ONLY raw SVG markup starting with <svg and ending with </svg>. No prose, no markdown fences.
- Root <svg> must include xmlns="http://www.w3.org/2000/svg", a viewBox, width="100%" and height="100%".
${HOUSE_STYLE}`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function extractSvg(text: string): string | null {
  const fenced = text.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const match = body.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0].trim() : null;
}

export const generateSvg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<GenerateResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3.6-flash");

    // A reference image means "reproduce this specific figure" — go straight to
    // the vision-capable custom path rather than trying to route to a template.
    if (!data.imageDataUrl) {
      try {
        const { text } = await generateText({
          model,
          system: ROUTER_SYSTEM,
          messages: [{ role: "user", content: data.prompt }],
        });
        const routed = extractJson(text) as { template?: string; params?: ParamValues } | null;
        const id = routed?.template;
        if (id && id !== "custom" && TEMPLATES_BY_ID[id]) {
          const params = routed?.params ?? {};
          const svg = renderTemplate(id, params);
          return { svg, mode: "template", templateId: id, params };
        }
      } catch {
        // fall through to the custom generator
      }
    }

    // Custom / open-ended: free-hand SVG guided by the house style.
    const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
      { type: "text", text: data.prompt },
    ];
    if (data.imageDataUrl) {
      userContent.push({ type: "image", image: data.imageDataUrl });
    }

    const { text } = await generateText({
      model,
      system: CUSTOM_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    const svg = extractSvg(text);
    if (!svg) {
      throw new Error("The model did not return a valid SVG. Try rephrasing your prompt.");
    }
    return { svg, mode: "custom" };
  });
