import { describe, expect, it } from 'vitest';
import { normalizeRepoUrl } from '../../src/git/repo';

describe('git/repo.normalizeRepoUrl', () => {
  it('parses https GitHub URL', () => {
    expect(normalizeRepoUrl('https://github.com/owner/repo.git')).toBe('owner/repo');
  });

  it('parses ssh GitHub URL', () => {
    expect(normalizeRepoUrl('git@github.com:owner/repo.git')).toBe('owner/repo');
  });

  it('returns null for non-github URL', () => {
    expect(normalizeRepoUrl('https://gitlab.com/owner/repo.git')).toBeNull();
  });
});
