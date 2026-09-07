import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeAutomation } from '../../src/connection/automation-probe.js';
import { checkDevToolsRunning, detectIDEPort } from '../../src/core/connection.js';

vi.mock('../../src/connection/automation-probe.js', () => ({ probeAutomation: vi.fn(), waitForAutomation: vi.fn() }));

describe('core discovery policy', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('requires automation protocol identity', async () => {
    vi.mocked(probeAutomation).mockResolvedValue({ automation: false, ready: false, reason: 'unrelated HTTP' });
    expect(await checkDevToolsRunning(9420)).toBe(false);
  });
  it('preserves common-port priority and forwards the remaining budget', async () => {
    vi.mocked(probeAutomation).mockImplementation(async endpoint => ({ automation: endpoint.endsWith(':9440'), ready: true, reason: '' }));
    expect(await detectIDEPort(false, 5000)).toBe(9440);
    expect(probeAutomation).toHaveBeenLastCalledWith('ws://127.0.0.1:9440', expect.any(Number));
  });
});
