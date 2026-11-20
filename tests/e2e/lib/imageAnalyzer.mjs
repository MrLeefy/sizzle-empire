import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ANALYZE_IMAGE_PY, PYTHON_BIN } from './config.mjs';

const execFileAsync = promisify(execFile);

/**
 * Invokes analyze_image.py on a PNG file and returns structured pixel/luma/color metrics.
 * @param {string} pngPath
 * @param {{ crop?: [number, number, number, number], timeoutMs?: number }} [opts]
 */
export async function analyzeImage(pngPath, opts = {}) {
  const args = [ANALYZE_IMAGE_PY, pngPath];
  if (Array.isArray(opts.crop) && opts.crop.length === 4) {
    args.push(`--crop=${opts.crop.join(',')}`);
  }

  const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
    timeout: opts.timeoutMs ?? 20000,
    maxBuffer: 4 * 1024 * 1024,
  });

  try {
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(
      `Failed to parse analyze_image.py output for ${pngPath}: ${err instanceof Error ? err.message : String(err)} (stderr: ${stderr})`,
    );
  }
}
