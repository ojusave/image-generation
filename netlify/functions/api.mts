import type { Config, Context } from '@netlify/functions';
import serverless from 'serverless-http';
import server from '../../server.js';

declare const Netlify: { env: { get(name: string): string | undefined } };

export default async (request: Request, _context: Context) => {
  const app = server.createApp({
    BFL_API_KEY: Netlify.env.get('BFL_API_KEY'),
    CLAUDE_API_KEY: Netlify.env.get('CLAUDE_API_KEY'),
  });
  const handler = serverless(app);
  const url = new URL(request.url);
  const result = await handler({
    httpMethod: request.method,
    path: url.pathname,
    headers: Object.fromEntries(request.headers),
    multiValueQueryStringParameters: Object.fromEntries(
      [...new Set(url.searchParams.keys())].map(key => [key, url.searchParams.getAll(key)])
    ),
    body: request.body ? Buffer.from(await request.arrayBuffer()).toString('base64') : null,
    isBase64Encoded: true,
    requestContext: { identity: {} },
  }, {});

  const headers = new Headers(result.headers);
  for (const [key, values] of Object.entries(result.multiValueHeaders || {})) {
    for (const value of values as string[]) headers.append(key, value);
  }
  return new Response(
    result.body ? Buffer.from(result.body, result.isBase64Encoded ? 'base64' : 'utf8') : null,
    { status: result.statusCode, headers }
  );
};

export const config: Config = {
  path: ['/api/*', '/health'],
};
