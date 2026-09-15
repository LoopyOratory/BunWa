// Copies node icons into dist. n8n resolves `file:bunwa.svg` relative to the
// compiled node file, so the assets must sit next to the .js output.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const copies = [
	['nodes/BunWa/bunwa.svg', 'dist/nodes/BunWa/bunwa.svg'],
	['nodes/BunWaTrigger/bunwa.svg', 'dist/nodes/BunWaTrigger/bunwa.svg'],
];

for (const [from, to] of copies) {
	const source = join(root, from);
	if (!existsSync(source)) {
		console.error(`[copy-icons] missing ${from}`);
		process.exit(1);
	}
	mkdirSync(dirname(join(root, to)), { recursive: true });
	cpSync(source, join(root, to));
	console.log(`[copy-icons] ${from} -> ${to}`);
}
