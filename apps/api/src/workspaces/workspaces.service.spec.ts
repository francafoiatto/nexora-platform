import { slugify } from './workspaces.service';

describe('slugify', () => {
  it('produces a url-safe slug with a random suffix', () => {
    expect(slugify('  Açme  Operações / EU ')).toMatch(/^acme-operacoes-eu-[0-9a-f]{6}$/);
  });

  it('falls back when the name has no usable characters', () => {
    expect(slugify('🚀🚀')).toMatch(/^workspace-[0-9a-f]{6}$/);
  });

  it('does not collide for identical names', () => {
    expect(slugify('Ops')).not.toBe(slugify('Ops'));
  });
});
