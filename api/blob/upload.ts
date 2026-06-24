/**
 * Vercel Blob client-upload token endpoint (setlist MP3 uploads).
 *
 * The browser uploads MP3s directly to Blob; this route only issues short-lived
 * upload tokens — gated to signed-in users and restricted to audio. ESM, like the
 * other api/* functions (api/package.json sets "type": "module"); imports the
 * compiled server `dist` for auth. Requires BLOB_READ_WRITE_TOKEN on the project.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { fromNodeHeaders } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import { auth } from "../../packages/server/dist/auth.js";

const AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
];

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  try {
    const json = await handleUpload({
      body: req.body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async () => {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (!session) throw new Error("Unauthorized");
        return {
          allowedContentTypes: AUDIO_TYPES,
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // No-op: the setlist row is created by the GraphQL mutation with the URL.
      },
    });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(json));
  } catch (e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: (e as Error).message }));
  }
}
