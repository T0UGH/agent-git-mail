import { describe, expect, it } from 'vitest';
import { SessionBindingStore } from '../src/session-binding.js';

describe('SessionBindingStore', () => {
  it('binds a normal eligible session', () => {
    const store = new SessionBindingStore();
    store.bind('agent:main:main', 'leo');
    expect(store.get('leo')).toBe('agent:main:main');
  });

  it('prefers feishu direct session over main session for the same agent', () => {
    const store = new SessionBindingStore();
    store.bind('agent:main:main', 'leo');
    store.bind('agent:main:feishu:direct:ou_xxx', 'leo');
    expect(store.get('leo')).toBe('agent:main:feishu:direct:ou_xxx');
  });

  it('does not let main session override an existing feishu direct binding', () => {
    const store = new SessionBindingStore();
    store.bind('agent:main:feishu:direct:ou_xxx', 'leo');
    store.bind('agent:main:main', 'leo');
    expect(store.get('leo')).toBe('agent:main:feishu:direct:ou_xxx');
  });

  it('only unbinds when the ending session matches the stored binding', () => {
    const store = new SessionBindingStore();
    store.bind('agent:main:feishu:direct:ou_xxx', 'leo');
    store.unbind('leo', 'agent:main:main');
    expect(store.get('leo')).toBe('agent:main:feishu:direct:ou_xxx');
    store.unbind('leo', 'agent:main:feishu:direct:ou_xxx');
    expect(store.get('leo')).toBeUndefined();
  });
});
