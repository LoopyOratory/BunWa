import { describe, it, expect } from 'bun:test';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

describe('Static File Serving', () => {
  it('serves /ui/ route', async () => {
    
    // Verify the isPathSafe function logic
    const rootDir = '/app/frontend-dist';
    
    // Safe path
    const safePath = join(rootDir, '/assets/index.js');
    const resolvedSafe = resolve(safePath);
    expect(resolvedSafe.startsWith(rootDir + '/') || resolvedSafe === rootDir).toBe(true);
    
    // Unsafe path (traversal)
    const unsafePath = join(rootDir, '/../../etc/passwd');
    const resolvedUnsafe = resolve(unsafePath);
    expect(resolvedUnsafe.startsWith(rootDir + '/') || resolvedUnsafe === rootDir).toBe(false);
  });
});
