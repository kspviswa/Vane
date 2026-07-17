import { handleMcpRequest } from '@/lib/mcp/server';

export const POST = async (req: Request) => {
  try {
    const body = await req.json();

    if (!body || body.jsonrpc !== '2.0' || !body.method) {
      return Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Invalid Request' },
          id: null,
        },
        { status: 400 },
      );
    }

    const response = await handleMcpRequest(body);

    if (body.method === 'notifications/initialized') {
      return new Response(null, { status: 204 });
    }

    return Response.json(response);
  } catch (err: any) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      },
      { status: 400 },
    );
  }
};

export const GET = async () => {
  return Response.json({
    name: 'uttaram',
    version: '1.0.0',
    protocol: 'mcp',
    endpoint: '/api/mcp',
    description: 'Uttaram MCP server — search and crawl tools',
  });
};
