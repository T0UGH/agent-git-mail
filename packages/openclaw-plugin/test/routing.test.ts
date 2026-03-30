import { describe, it, expect } from 'vitest';
import { resolveRouteTarget } from '../src/index.js';

describe('resolveRouteTarget', () => {
  it('uses forced session key when configured', () => {
    const result = resolveRouteTarget({
      forcedSessionKey: 'agent:custom:abc',
      boundSessionKey: 'agent:bound:def',
    });

    expect(result).toEqual({
      sessionKey: 'agent:custom:abc',
      routeSource: 'forced-env',
    });
  });

  it('defaults to main session when nothing is configured', () => {
    const result = resolveRouteTarget({
      forcedSessionKey: null,
      boundSessionKey: null,
    });

    expect(result).toEqual({
      sessionKey: 'agent:main:main',
      routeSource: 'default-main',
    });
  });

  it('uses binding when no forced session key exists', () => {
    const result = resolveRouteTarget({
      forcedSessionKey: null,
      boundSessionKey: 'agent:bound:def',
    });

    expect(result).toEqual({
      sessionKey: 'agent:bound:def',
      routeSource: 'binding',
    });
  });
});
