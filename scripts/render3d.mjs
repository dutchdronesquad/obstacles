// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { createRequire } from 'node:module';
import path from 'node:path';

// Catalog obstacles that render each template in @trackdraw/viewer, and the catalog files its panels replace.
const catalog = (elementId, kind, size, extra = {}) => ({
  kind, x: 0, y: 0, rotation: 0, ...size, ...extra,
  meta: { catalog: { version: 1, elementId, assignedKind: kind, official: true, snapshot: { name: elementId, organization: 'MultiGP', dimensionsLabel: '' } } },
});
export const renderTargets = {
  'gate-standard-v1': {
    shape: catalog('multigp-standard-gate-5x5', 'gate', { width: 1.524, height: 1.524, thick: 0.2, color: '#3b82f6' }),
    files: {
      left: 'MultiGP-2017-Airgate-left-panel-regular-50-percent.webp',
      right: 'MultiGP-2017-Airgate-right-panel-regular-50-percent.webp',
      top: 'MultiGP-2017-Airgate-top-regular-50-percent.webp',
    },
    views: [[0, 'front'], [40, 'turned 40°'], [180, 'back']], spacing: 3.2,
  },
  'gate-championship-v1': {
    shape: catalog('multigp-championship-gate-7x6', 'gate', { width: 2.1336, height: 1.8288, thick: 0.2, color: '#3b82f6' }),
    // The current renderer draws the right post from the left image, turned 180°.
    files: { left: 'large-side-panel-multigp.webp', top: 'large-top-multigp.webp' },
    views: [[0, 'front'], [40, 'turned 40°'], [180, 'back']], spacing: 4,
  },
  'corner-flag-v1': {
    shape: catalog('multigp-corner-flag', 'flag', { radius: 0.2, poleHeight: 3.048, color: '#b91c1c' }),
    files: { front: 'feather-banners-cobranded-multigp.webp', back: 'feather-banners-cobranded-multigp-back-double-sided.webp' },
    views: [[0, 'front'], [60, 'turned 60°'], [180, 'back']], spacing: 1.6,
  },
  'hurdle-v1': {
    shape: catalog('multigp-hurdle', 'barrier', { width: 3.048, height: 1.524, color: '#1e3a8a' }, { variant: 'banner' }),
    files: { front: '5x10-hurdle-multigp.webp' },
    views: [[0, 'front'], [180, 'back']], spacing: 4,
  },
};

export function renderDesign(template) {
  const target = renderTargets[template];
  const width = target.views.length * target.spacing + 1;
  return {
    version: 2, title: template, updatedAt: '2026-01-01T00:00:00.000Z',
    field: { width, height: 5, origin: 'tl', gridStep: 1, ppm: 20 },
    shapes: target.views.map(([rotation], i) => ({ ...structuredClone(target.shape), id: `view-${i}`, x: 0.5 + target.spacing * (i + 0.5), y: 2.5, rotation })),
  };
}

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
      await page.evaluate(({ design, textures }) => {
        window.TrackDrawViewer.createTrackDrawViewer(document.getElementById('viewer'), {
          design, initialView: '3d', showViewControls: false, theme: 'light',
          assetResolver: asset => textures[asset.split('/').pop()] ?? asset,
        });
      }, { design: renderDesign(entry.template), textures });
      await page.waitForSelector('#viewer canvas', { state: 'attached', timeout: 30_000 });
      await page.waitForTimeout(2500);
      // The viewer frames the whole field from far away; zoom in and lower the camera for a pilot-like view.
      await page.mouse.move(width / 2, height / 2);
      for (let i = 0; i < 11; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
      await page.mouse.down();
      await page.mouse.move(width / 2, height / 2 - 90, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(2000);
      if (errors.length) throw new Error(`${collection}/${entry.id}: viewer error: ${errors.join('; ')}`);
      results[`${collection}/${entry.id}`] = await page.locator('#viewer').screenshot();
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}
