// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { createRequire } from 'node:module';
import path from 'node:path';

import { renderTargets, renderDesign, renderCamera } from '../templates/render-targets.ts';
export { renderTargets, renderDesign, renderCamera } from '../templates/render-targets.ts';

// Renders each texture set on its obstacle with the real viewer in headless Chromium; returns PNG buffers by texture id.
export async function render3d(entries, read, { width = 1200, height = 520 } = {}) {
  const require = createRequire(import.meta.url);
  const { chromium } = await import('playwright');
  const viewer = path.dirname(require.resolve('@trackdraw/viewer/static/trackdraw-viewer.css'));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = {};
  try {
    for (const { collection, entry } of entries) {
      const target = renderTargets[entry.template];
      if (!target) continue;
      const textures = {};
      for (const [panel, file] of Object.entries(target.files)) {
        textures[file] = `data:image/webp;base64,${read(`collections/${collection}/${entry.panels[panel]}`).toString('base64')}`;
      }
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      // Nothing may load from the network: every texture is supplied inline.
      await page.route('**/*', route => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
      await page.setContent(`<!doctype html><html><body style="margin:0"><div id="viewer" style="width:${width}px;height:${height}px"></div></body></html>`);
      await page.addStyleTag({ path: path.join(viewer, 'trackdraw-viewer.css') });
      await page.addScriptTag({ path: path.join(viewer, 'trackdraw-viewer.global.js') });
      await page.evaluate(({ design, camera, textures, backColor }) => {
        window.TrackDrawViewer.createTrackDrawViewer(document.getElementById('viewer'), {
          design, camera3D: camera, gateBackColors: Object.fromEntries(design.shapes.map(shape => [shape.id, backColor])), initialView: '3d', show3DAxes: false, showViewControls: false, theme: 'light',
          assetResolver: asset => textures[asset.split('/').pop()] ?? asset,
        });
      }, { design: renderDesign(entry.template), camera: renderCamera(entry.template, width / height), textures, backColor: entry.backColor });
      await page.waitForSelector('#viewer canvas', { state: 'attached', timeout: 30_000 });
      await page.waitForTimeout(2500);
      if (errors.length) throw new Error(`${collection}/${entry.id}: viewer error: ${errors.join('; ')}`);
      results[`${collection}/${entry.id}`] = await page.locator('#viewer').screenshot();
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}
