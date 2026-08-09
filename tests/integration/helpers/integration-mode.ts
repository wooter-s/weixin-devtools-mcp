export function isIntegrationStrictMode(): boolean {
  return process.env.INTEGRATION_STRICT === 'true';
}

export function shouldRunIntegrationTests(): boolean {
  return process.env.RUN_INTEGRATION_TESTS === 'true' || isIntegrationStrictMode();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Strict 模式抛错；optional 模式只记录明确的跳过原因。 */
export function handleIntegrationUnavailable(scope: string, error: unknown): void {
  const message = `[integration] ${scope}: ${errorMessage(error)}`;
  if (isIntegrationStrictMode()) {
    throw new Error(message, error instanceof Error ? { cause: error } : undefined);
  }
  console.warn(`${message}；optional 模式跳过相关用例`);
}
