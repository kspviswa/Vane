import { toolDefinitions, callTool } from './tools';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id?: string | number | null;
}

const MCP_PROTOCOL_VERSION = '2025-03-26';

const SERVER_INFO = {
  name: 'uttaram',
  version: '1.0.0',
};

function createResponse(
  id: string | number | null | undefined,
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', result, id: id ?? null };
}

function createError(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', error: { code, message, data }, id: id ?? null };
}

async function handleInitialize(
  params: Record<string, unknown> | undefined,
): Promise<JsonRpcResponse> {
  return createResponse(params?.id as any, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: SERVER_INFO,
  });
}

function handleToolsList(id: string | number | null | undefined): JsonRpcResponse {
  return createResponse(id, {
    tools: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
}

async function handleToolsCall(
  params: Record<string, unknown> | undefined,
): Promise<JsonRpcResponse> {
  const name = params?.name as string;
  const args = (params?.arguments as Record<string, unknown>) ?? {};

  if (!name) {
    return createError(params?.id as any, -32602, 'Missing tool name');
  }

  const result = await callTool(name, args);
  return createResponse(params?.id as any, result);
}

export async function handleMcpRequest(
  body: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const { method, params, id } = body;

  try {
    switch (method) {
      case 'initialize':
        return await handleInitialize({ ...params, id });
      case 'notifications/initialized':
        return createResponse(id, undefined);
      case 'tools/list':
        return handleToolsList(id);
      case 'tools/call':
        return await handleToolsCall({ ...params, id });
      default:
        return createError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    return createError(
      id,
      -32603,
      err.message ?? 'Internal error',
    );
  }
}
