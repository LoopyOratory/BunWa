// `bun run models:fetch`: downloads the built-in embedding model's pinned files into MODELS_DIR
// (default .cache/models). The Docker build runs it so production never downloads at runtime.
import { ensureBgeFiles } from "./index"

const dir = await ensureBgeFiles()
console.log(`✓ bge-small-en-v1.5 ready in ${dir}`)
