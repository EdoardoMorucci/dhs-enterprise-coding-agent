import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig, boundedCommand, runtimeBin, installRoot } from './company-agent.mjs';

export async function doctor(root, profile) {
  let config; try { config = await readConfig(root, profile); } catch (error) { return { ready: false, model: { ready: false, detail: error.message }, qualification: 'UNQUALIFIED: no model request was made' }; }
  let model = { ready: false, detail: 'Model endpoint not checked' };
  if (!process.env[config.apiKeyEnv]) model.detail = `Set environment variable ${config.apiKeyEnv}; its value is never stored. For an unauthenticated local server use an explicit non-secret dummy value if required.`;
  else {
    try {
      const response = await fetch(`${config.endpoint}/models`, { headers: { Authorization: `Bearer ${process.env[config.apiKeyEnv]}` }, signal: AbortSignal.timeout(3000), redirect: 'error' });
      if (!response.ok) throw new Error(`Endpoint returned HTTP ${response.status}`);
      const body = await response.text(); if (body.length > 262144) throw new Error('Model listing exceeds limit');
      const data = JSON.parse(body); const found = data.data?.some(item => item.id === config.model);
      model = { ready: !!found, detail: found ? 'Configured model appears in the endpoint model listing; tool-use inference remains unqualified.' : 'Configured model id not present in endpoint /models listing' };
    } catch (error) { model.detail = `Configured endpoint unavailable: ${error.message}`; }
  }
  const [runtime, docker, compiled, workspace] = await Promise.all([
    boundedCommand(process.execPath, [runtimeBin(), '--version'], { timeout: 10000 }),
    boundedCommand('docker', ['image', 'inspect', 'node:24.13.0-alpine'], { timeout: 5000 }),
    access(join(installRoot, 'packages/company-bundle/dist/index.js')).then(() => true, () => false), access(config.workspace).then(() => true, () => false)
  ]);
  const runtimeReady = runtime.code === 0 && runtime.stdout.includes('0.2.0-rc.2');
  return { ready: model.ready && runtimeReady && compiled && workspace && docker.code === 0, model, runtime: { ready: runtimeReady, version: runtime.stdout.trim() }, compiled, workspace,
    docker: { ready: docker.code === 0, detail: docker.code === 0 ? 'Pinned verification image available' : 'Docker or node:24.13.0-alpine unavailable; isolated acceptance is unqualified. Install/start Docker and pull the pinned image.' }, qualification: 'Readiness probes only. No live model tool-use or isolated acceptance qualification is claimed.' };
}
