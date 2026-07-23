import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

const InputSchema = z.object({
  prompt: z.string().min(1),
  imageDataUrl: z.string().optional(),
});

const SYSTEM_PROMPT = `You are an SVG generator for math teachers. Given a description (and optionally a reference image), return ONE complete, self-contained SVG diagram.

Strict requirements:
- Output ONLY the raw SVG markup starting with <svg and ending with </svg>. No prose, no markdown fences, no explanation.
- Root <svg> must include xmlns="http://www.w3.org/2000/svg", a viewBox (e.g. "0 0 400 300"), width="100%" and height="100%".
- Include a white background <rect width="100%" height="100%" fill="#ffffff" />.
- Give every meaningful element an id (e.g. id="label-A", id="side-AB", id="circle-1"). Labels/text must have ids so users can drag them.
- Group related elements in <g> with an id, and precede each group / key element with an XML comment acting as a section heading, e.g. <!-- Vertex Labels -->. These headings help users navigate the code.
- Use clean coordinates, readable serif italic labels for math variables, and a neutral color palette (#0f172a for primary lines, #2563eb for auxiliary, black text).`;

export const generateSvg = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3.6-flash");

    const userContent: Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    > = [{ type: "text", text: data.prompt }];
    if (data.imageDataUrl) {
      userContent.push({ type: "image", image: data.imageDataUrl });
    }

    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const svg = extractSvg(text);
    if (!svg) {
      throw new Error("The model did not return a valid SVG. Try rephrasing your prompt.");
    }
    return { svg };
  });

function extractSvg(text: string): string | null {
  const fenced = text.match(/```(?:svg|xml|html)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const match = body.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0].trim() : null;
}
