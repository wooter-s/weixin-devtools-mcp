import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const CONTENT_ADDRESSED_SCHEMA_ID =
  /^urn:weixin-devtools-mcp:schema:output:sha256:[a-f0-9]{64}$/;

class SchemaCompilationProfiler {
  constructor() {
    this.resetCompiler();
  }

  resetCompiler() {
    this.delegate = new AjvJsonSchemaValidator();
    this.beginPass();
  }

  beginPass() {
    this.durationMs = 0;
    this.validatorCount = 0;
  }

  getValidator(schema) {
    const startedAt = performance.now();
    try {
      return this.delegate.getValidator(schema);
    } finally {
      this.durationMs += performance.now() - startedAt;
      this.validatorCount += 1;
    }
  }

  snapshot() {
    return {
      durationMs: this.durationMs,
      validatorCount: this.validatorCount,
    };
  }
}

function responseBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function hasMeta(meta, toolName) {
  return Boolean(
    meta &&
    typeof meta === 'object' &&
    typeof meta.requestId === 'string' &&
    meta.requestId.length > 0 &&
    meta.tool === toolName &&
    typeof meta.durationMs === 'number' &&
    meta.durationMs >= 0
  );
}

function hasSuccessEnvelope(result, toolName) {
  const value = result?.structuredContent;
  return Boolean(
    !result?.isError &&
    value?.schemaVersion === '1.0' &&
    value.ok === true &&
    value.code === 'OK' &&
    value.data &&
    typeof value.data === 'object' &&
    !Array.isArray(value.data) &&
    Array.isArray(value.warnings) &&
    Array.isArray(value.nextActions) &&
    hasMeta(value.meta, toolName)
  );
}

function hasFailureEnvelope(result, toolName, expectedCode) {
  const value = result?.structuredContent;
  return Boolean(
    result?.isError === true &&
    value?.schemaVersion === '1.0' &&
    value.ok === false &&
    value.code === expectedCode &&
    value.data === null &&
    value.error &&
    typeof value.error.message === 'string' &&
    typeof value.error.retryable === 'boolean' &&
    Array.isArray(value.warnings) &&
    Array.isArray(value.nextActions) &&
    hasMeta(value.meta, toolName)
  );
}

function failure(code, message, metrics) {
  return { ok: false, error: { code, message }, metrics };
}

export async function createBenchmarkAdapter(options) {
  const serverPath = path.resolve(process.env.BENCHMARK_SERVER_PATH ?? path.join(options.repoRoot, 'build/server.js'));
  const serverCwd = path.resolve(process.env.BENCHMARK_SERVER_CWD ?? options.repoRoot);
  let client = null;
  let schemaProfiler = null;

  async function createClient(profiler) {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter((entry) => typeof entry[1] === 'string'),
    );
    const instance = new Client(
      { name: 'weixin-mcp-protocol-benchmark', version: '1.0.0' },
      {
        capabilities: {},
        ...(profiler ? { jsonSchemaValidator: profiler } : {}),
      },
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: serverCwd,
      env: {
        ...environment,
        WEIXIN_MCP_TOOLS_PROFILE: 'full',
      },
    });
    await instance.connect(transport);
    return instance;
  }

  return {
    name: 'protocol-static',

    async setup() {
      if (!fs.existsSync(serverPath)) {
        throw new Error(`MCP server 不存在，请先构建: ${serverPath}`);
      }
      schemaProfiler = new SchemaCompilationProfiler();
      client = await createClient(schemaProfiler);
    },

    async healthCheck() {
      const result = await client.listTools();
      const ok = Array.isArray(result?.tools) && result.tools.length > 0;
      return {
        ok,
        ...(ok ? {} : { message: 'tools/list 未返回工具' }),
      };
    },

    async runScenario({ scenario }) {
      if (scenario.id === 'protocol_tools_list') {
        schemaProfiler.resetCompiler();
        const coldListStarted = performance.now();
        const coldResult = await client.listTools();
        const coldListMs = performance.now() - coldListStarted;
        const coldProfile = schemaProfiler.snapshot();

        schemaProfiler.beginPass();
        const listStarted = performance.now();
        const result = await client.listTools();
        const hotListMs = performance.now() - listStarted;
        const hotProfile = schemaProfiler.snapshot();
        const coldTools = Array.isArray(coldResult?.tools) ? coldResult.tools : [];
        const tools = Array.isArray(result?.tools) ? result.tools : [];
        const toolsWithOutputSchema = tools.filter((tool) => tool.outputSchema).length;
        const toolsWithContentAddressedSchemaId = tools.filter((tool) =>
          CONTENT_ADDRESSED_SCHEMA_ID.test(tool.outputSchema?.$id ?? '')
        ).length;
        const metrics = {
          responseBytes: responseBytes(result),
          roundTrips: 2,
          toolsTotal: tools.length,
          toolsWithOutputSchema,
          toolsWithContentAddressedSchemaId,
          coldListMs,
          hotListMs,
          coldSchemaCompileMs: coldProfile.durationMs,
          hotSchemaCompileMs: hotProfile.durationMs,
          coldSchemaValidatorCount: coldProfile.validatorCount,
          hotSchemaValidatorCount: hotProfile.validatorCount,
        };
        return coldTools.length === 31 && tools.length === 31 && toolsWithOutputSchema === 31 &&
          tools.every((tool) => tool.outputSchema?.type === 'object')
          ? { ok: true, metrics }
          : failure('OUTPUT_SCHEMA_INCOMPLETE', '工具数或对象根 outputSchema 不完整', metrics);
      }

      if (scenario.id === 'protocol_success') {
        const result = await client.callTool({ name: 'get_connection_status', arguments: {} });
        const metrics = {
          responseBytes: responseBytes(result),
          roundTrips: 1,
          structuredContentCount: Number(hasSuccessEnvelope(result, 'get_connection_status')),
        };
        return hasSuccessEnvelope(result, 'get_connection_status')
          ? { ok: true, metrics }
          : failure('SUCCESS_CONTRACT_INCOMPLETE', '成功响应不符合公共 envelope', metrics);
      }

      if (scenario.id === 'protocol_invalid_arguments') {
        // 使用已知字段 strategy 的非法枚举值，确保请求在 schema 校验阶段失败，绝不进入连接 handler。
        const result = await client.callTool({
          name: 'connect_devtools',
          arguments: { strategy: '__invalid_benchmark_strategy__' },
        });
        const metrics = {
          responseBytes: responseBytes(result),
          roundTrips: 1,
          structuredErrorCount: Number(hasFailureEnvelope(result, 'connect_devtools', 'INVALID_ARGUMENT')),
        };
        return hasFailureEnvelope(result, 'connect_devtools', 'INVALID_ARGUMENT')
          ? { ok: true, metrics }
          : failure('INVALID_ARGUMENT_CONTRACT_INCOMPLETE', '参数错误缺少稳定 INVALID_ARGUMENT envelope', metrics);
      }

      if (scenario.id === 'protocol_business_error') {
        const result = await client.callTool({ name: 'get_current_page', arguments: {} });
        const metrics = {
          responseBytes: responseBytes(result),
          roundTrips: 1,
          structuredErrorCount: Number(hasFailureEnvelope(result, 'get_current_page', 'NOT_CONNECTED')),
        };
        return hasFailureEnvelope(result, 'get_current_page', 'NOT_CONNECTED')
          ? { ok: true, metrics }
          : failure('BUSINESS_ERROR_CONTRACT_INCOMPLETE', '业务错误缺少稳定 NOT_CONNECTED envelope', metrics);
      }

      if (scenario.id === 'protocol_stdio_lifecycle') {
        const initializeStarted = performance.now();
        const isolatedClient = await createClient();
        const initializeMs = performance.now() - initializeStarted;
        let result;
        let firstListMs = 0;
        let closeMs = 0;
        try {
          const listStarted = performance.now();
          result = await isolatedClient.listTools();
          firstListMs = performance.now() - listStarted;
        } finally {
          const closeStarted = performance.now();
          await isolatedClient.close();
          closeMs = performance.now() - closeStarted;
        }
        return {
          ok: Array.isArray(result?.tools) && result.tools.length > 0,
          metrics: {
            responseBytes: responseBytes(result),
            roundTrips: 2,
            initializeMs,
            firstListMs,
            closeMs,
            lifecycleMs: initializeMs + firstListMs + closeMs,
          },
        };
      }

      return failure(
        'UNSUPPORTED_BY_PROTOCOL_STATIC_ADAPTER',
        `${scenario.id} 需要真实 DevTools/MCP 场景 adapter`,
        { roundTrips: 0 }
      );
    },

    async teardown() {
      await client?.close();
      client = null;
      schemaProfiler = null;
    },
  };
}
