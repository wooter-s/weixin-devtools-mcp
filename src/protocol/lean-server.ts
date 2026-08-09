import {
  safeParse,
  type AnyObjectSchema,
  type SchemaOutput,
} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { getMethodLiteral } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { Protocol, type ProtocolOptions, type RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ErrorCode,
  InitializedNotificationSchema,
  InitializeRequestSchema,
  LATEST_PROTOCOL_VERSION,
  McpError,
  SUPPORTED_PROTOCOL_VERSIONS,
  type ClientCapabilities,
  type Implementation,
  type Notification,
  type Request,
  type Result,
  type ServerCapabilities,
  type ServerNotification,
  type ServerRequest,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';

export interface LeanServerCapabilities {
  resources?: NonNullable<ServerCapabilities['resources']>;
  tools?: NonNullable<ServerCapabilities['tools']>;
}

export interface LeanServerOptions extends Pick<
  ProtocolOptions,
  'enforceStrictCapabilities' | 'debouncedNotificationMethods'
> {
  capabilities?: LeanServerCapabilities;
  instructions?: string;
}

/**
 * 面向 resources/tools 服务的精简 MCP Server。
 *
 * 传输、JSON-RPC 生命周期和 schema 分发仍由 SDK Protocol 提供；这里只实现
 * 高层 Server 中本服务实际需要的初始化协商与 tools/call 结果校验。
 */
type LeanServerRequest = ServerRequest | Request;
type LeanServerNotification = ServerNotification | Notification;
type LeanServerResult = ServerResult | Result;

export class LeanServer extends Protocol<
  LeanServerRequest,
  LeanServerNotification,
  LeanServerResult
> {
  readonly #serverInfo: Implementation;
  readonly #capabilities: LeanServerCapabilities;
  readonly #instructions?: string;
  #clientCapabilities?: ClientCapabilities;
  #clientVersion?: Implementation;

  oninitialized?: () => void;

  constructor(serverInfo: Implementation, options?: LeanServerOptions) {
    super({
      enforceStrictCapabilities: options?.enforceStrictCapabilities,
      debouncedNotificationMethods: options?.debouncedNotificationMethods,
    });

    this.#serverInfo = serverInfo;
    this.#capabilities = {
      ...(options?.capabilities?.resources
        ? { resources: options.capabilities.resources }
        : {}),
      ...(options?.capabilities?.tools
        ? { tools: options.capabilities.tools }
        : {}),
    };
    this.#instructions = options?.instructions;

    this.setRequestHandler(InitializeRequestSchema, request => {
      this.#clientCapabilities = request.params.capabilities;
      this.#clientVersion = request.params.clientInfo;

      const requestedVersion = request.params.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
        ? requestedVersion
        : LATEST_PROTOCOL_VERSION;

      return {
        protocolVersion,
        capabilities: this.#capabilities,
        serverInfo: this.#serverInfo,
        ...(this.#instructions ? { instructions: this.#instructions } : {}),
      };
    });
    this.setNotificationHandler(InitializedNotificationSchema, () => this.oninitialized?.());
  }

  getClientCapabilities(): ClientCapabilities | undefined {
    return this.#clientCapabilities;
  }

  getClientVersion(): Implementation | undefined {
    return this.#clientVersion;
  }

  override setRequestHandler<T extends AnyObjectSchema>(
    requestSchema: T,
    handler: (
      request: SchemaOutput<T>,
      extra: RequestHandlerExtra<LeanServerRequest, LeanServerNotification>,
    ) => LeanServerResult | Promise<LeanServerResult>,
  ): void {
    if (getMethodLiteral(requestSchema) !== 'tools/call') {
      super.setRequestHandler(requestSchema, handler);
      return;
    }

    super.setRequestHandler(requestSchema, async (request, extra) => {
      const validatedRequest = safeParse(CallToolRequestSchema, request);
      if (!validatedRequest.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid tools/call request: ${parseErrorMessage(validatedRequest.error)}`,
        );
      }
      if (validatedRequest.data.params.task) {
        throw new McpError(ErrorCode.InvalidRequest, 'This server does not support tasks');
      }

      const result = await handler(request, extra);
      const validatedResult = safeParse(CallToolResultSchema, result);
      if (!validatedResult.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid tools/call result: ${parseErrorMessage(validatedResult.error)}`,
        );
      }
      return validatedResult.data;
    });
  }

  protected assertCapabilityForMethod(method: LeanServerRequest['method']): void {
    switch (method) {
      case 'sampling/createMessage':
      case 'elicitation/create':
      case 'roots/list':
        throw new Error(`Client method is not supported by the lean server: ${method}`);
      default:
        return;
    }
  }

  protected assertNotificationCapability(method: LeanServerNotification['method']): void {
    switch (method) {
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/progress':
        return;
      case 'notifications/resources/updated':
      case 'notifications/resources/list_changed':
        if (this.#capabilities?.resources) return;
        break;
      case 'notifications/tools/list_changed':
        if (this.#capabilities?.tools) return;
        break;
      case 'notifications/message':
      case 'notifications/prompts/list_changed':
      case 'notifications/elicitation/complete':
        break;
      default:
        return;
    }
    throw new Error(`Server notification is not supported by the lean server: ${method}`);
  }

  protected assertRequestHandlerCapability(method: string): void {
    switch (method) {
      case 'initialize':
      case 'ping':
        return;
      case 'resources/list':
      case 'resources/templates/list':
      case 'resources/read':
        if (this.#capabilities?.resources) return;
        break;
      case 'tools/list':
      case 'tools/call':
        if (this.#capabilities?.tools) return;
        break;
      case 'tasks/get':
      case 'tasks/list':
      case 'tasks/result':
      case 'tasks/cancel':
      case 'completion/complete':
      case 'logging/setLevel':
      case 'prompts/get':
      case 'prompts/list':
        break;
      default:
        return;
    }
    throw new Error(`Request handler is not supported by the lean server: ${method}`);
  }

  protected assertTaskCapability(method: string): void {
    throw new Error(`Client tasks are not supported by the lean server: ${method}`);
  }

  protected assertTaskHandlerCapability(method: string): void {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Server tasks are not supported by the lean server: ${method}`,
    );
  }
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
