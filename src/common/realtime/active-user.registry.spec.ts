import { ActiveUserRegistry } from './active-user.registry';

describe('ActiveUserRegistry', () => {
  let registry: ActiveUserRegistry;

  beforeEach(() => {
    registry = new ActiveUserRegistry();
  });

  it('starts empty', () => {
    expect(registry.size()).toBe(0);
    expect(registry.list()).toEqual([]);
    expect(registry.has('u1')).toBe(false);
  });

  it('acquire adds the user once', () => {
    registry.acquire('u1');
    expect(registry.has('u1')).toBe(true);
    expect(registry.size()).toBe(1);
    expect(registry.list()).toEqual(['u1']);
  });

  it('ref-counts multiple acquires for the same user', () => {
    registry.acquire('u1');
    registry.acquire('u1');
    registry.release('u1');
    // still active because two acquires, one release
    expect(registry.has('u1')).toBe(true);
    expect(registry.size()).toBe(1);
  });

  it('removes the user when refs drop to zero', () => {
    registry.acquire('u1');
    registry.release('u1');
    expect(registry.has('u1')).toBe(false);
    expect(registry.size()).toBe(0);
  });

  it('release on an unknown user is a no-op', () => {
    expect(() => registry.release('ghost')).not.toThrow();
    expect(registry.size()).toBe(0);
  });

  it('tracks multiple users independently', () => {
    registry.acquire('u1');
    registry.acquire('u2');
    registry.acquire('u2');
    expect(registry.list().sort()).toEqual(['u1', 'u2']);
    registry.release('u2');
    expect(registry.has('u2')).toBe(true); // u2 still has 1 ref
    registry.release('u2');
    expect(registry.has('u2')).toBe(false);
    expect(registry.list()).toEqual(['u1']);
  });
});
