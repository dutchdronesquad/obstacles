// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { unstable_startWorker } from "wrangler";
import { chromium } from "playwright";
import sharp from "sharp";
import { checkCollections } from "../../../scripts/check-collections.mjs";
import { exportSheet } from "../../../scripts/templates.mjs";
import { templateDefinitions } from "../../../scripts/template-definitions.mjs";
import {
  parseSheet,
  createDesign,
  prepareLogo,
  renderSheet,
} from "../../core/src/index.ts";
let server, browser, directory, url;
const logoSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#e54848"/><circle cx="70" cy="50" r="20" fill="#ffffff"/></svg>';
const fixture = (name, mimeType, data) => ({
  name,
  mimeType,
  buffer: Buffer.from(data),
});
const manifest = Buffer.from(
  JSON.stringify({
    schemaVersion: 1,
    id: "club",
    name: "Club",
    status: "example",
    author: "Club",
    attribution: "Original",
    usage: { terms: "Test", portable: "not-granted" },
  }),
);
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "designer-app-"));
  server = await unstable_startWorker({
    config: new URL("../wrangler.jsonc", import.meta.url).pathname,
    dev: {
      server: { hostname: "127.0.0.1", port: 0 },
      inspector: false,
      persist: false,
      remote: false,
    },
  });
  url = (await server.url).origin;
  browser = await chromium.launch({
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  });
});
after(async () => {
  await browser?.close();
  await server?.dispose();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function openPage(t, viewport = { width: 1440, height: 1024 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    await page.close();
    assert.deepEqual(errors, []);
  });
  await page.goto(url);
  await page.getByRole("application", { name: "Artwork canvas" }).waitFor();
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[aria-label="Zoom"]')
          .textContent.replace("%", ""),
      ) !== 100,
  );
  return page;
}
async function upload(
  page,
  svg = logoSvg,
  name = "club.svg",
  mime = "image/svg+xml",
) {
  await page
    .getByLabel("Upload a logo")
    .setInputFiles(fixture(name, mime, svg));
  await page
    .locator(".status")
    .filter({ hasText: "Logo added" })
    .waitFor({ state: "attached" });
}
async function download(page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  const result = await pending,
    file = path.join(directory, `${crypto.randomUUID()}.svg`);
  await result.saveAs(file);
  const svg = await readFile(file, "utf8");
  return {
    name: result.suggestedFilename(),
    svg,
    design: parseSheet(templateDefinitions, svg),
  };
}
async function checkDownload(result) {
  const files = new Map([
    ["collections/club/manifest.json", manifest],
    [`collections/club/source/${result.name}`, Buffer.from(result.svg)],
  ]);
  assert.equal(
    (await checkCollections([...files.keys()], (file) => files.get(file)))
      .sources,
    1,
  );
}

test("Cloudflare serves SPA routes with CSP and caches only fingerprinted assets immutably", async () => {
  const response = await fetch(`${url}/`);
  assert.equal(response.status, 200);
  const csp = response.headers.get("content-security-policy");
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /img-src 'self' blob: data:/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=0, must-revalidate",
  );
  const html = await response.text();
  const asset = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
  assert.ok(asset);
  assert.equal(
    (await fetch(`${url}${asset}`)).headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(
    (await fetch(`${url}/assets/trackdraw-logo.svg`)).headers.get(
      "cache-control",
    ),
    "public, max-age=0, must-revalidate",
  );
  const deep = await fetch(`${url}/some/deep/link`, {
    headers: { "Sec-Fetch-Mode": "navigate" },
  });
  assert.equal(deep.status, 200);
  assert.equal(await deep.text(), html);
  assert.equal(deep.headers.get("content-security-policy"), csp);
});

test("desktop and mobile submit a checked download and open the prefilled GitHub form", async (t) => {
  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const page = await openPage(t, viewport);
    await draw(page);
    const original = (await download(page)).design;
    await page
      .context()
      .route("https://github.com/**", (route) =>
        route.fulfill({ body: "Submission form" }),
      );
    await page
      .getByRole("button", { name: "Submit artwork", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Submit obstacle artwork",
    });
    const submit = dialog.getByRole("button", {
      name: "Download SVG and open GitHub",
    });
    assert.equal(await submit.isDisabled(), true);
    await dialog
      .getByLabel("Organization", { exact: true })
      .fill("Racing & 東京");
    await dialog.getByLabel("Short name (optional)").fill("racing-tokyo");
    const usage = "In TrackDraw, including offline track exports";
    await dialog.getByRole("combobox", { name: "Usage", exact: true }).click();
    await page.getByRole("option", { name: usage, exact: true }).click();
    const popupPending = page.waitForEvent("popup");
    const downloadPending = page.waitForEvent("download");
    await submit.click();
    const popup = await popupPending;
    await popup.waitForLoadState();
    const destination = new URL(popup.url());
    assert.equal(destination.searchParams.get("organization"), "Racing & 東京");
    assert.equal(destination.searchParams.get("slug"), "racing-tokyo");
    assert.equal(destination.searchParams.get("usage"), usage);
    assert.equal(
      destination.searchParams.get("template"),
      "submit-collection.yml",
    );
    const result = await downloadPending;
    const file = path.join(directory, `${crypto.randomUUID()}.svg`);
    await result.saveAs(file);
    const svg = await readFile(file, "utf8");
    assert.deepEqual(parseSheet(templateDefinitions, svg), original);
    await checkDownload({ svg, name: result.suggestedFilename() });
    await popup.close();
    assert.equal(await dialog.getByRole("status").isVisible(), true);
    await dialog.getByRole("button", { name: "Close submission" }).focus();
    await page.keyboard.press("r");
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await dialog.count(), 0);
    assert.deepEqual((await download(page)).design, original);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
});
async function draw(page, tool = "Rectangle (R)") {
  await page.getByRole("button", { name: "Top panel", exact: true }).click();
  await page.getByRole("button", { name: tool, exact: true }).click();
  const canvas = page.getByRole("application", { name: "Artwork canvas" });
  await canvas.press("Enter");
  await canvas.press("Shift+ArrowRight");
  await canvas.press("Shift+ArrowDown");
  await canvas.press("Enter");
  await page
    .getByLabel("Object name", { exact: true })
    .waitFor({ state: "attached" });
}

test("SVG vector groups transform, hide, undo and reopen without changing the export", async (t) => {
  const page = await openPage(t);
  await upload(page);
  assert.equal((await download(page)).design.artwork[0].kind, "group");
  await page.getByLabel("X", { exact: true }).fill("65");
  await page.getByLabel("Rotation", { exact: true }).fill("-80");
  await page
    .getByRole("button", { name: "Hide club · Right post", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Hide club · Right post", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "Show club · Right post", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Sheet settings", exact: true })
    .click();
  await page.getByLabel("Background", { exact: true }).fill("#123456");
  await page.getByLabel("Gate back", { exact: true }).fill("#667788");
  await page.getByLabel("Artwork name").fill("Club & friends");
  await page.getByLabel("Texture ID").fill("club-gate");
  await page.getByLabel("Guides", { exact: true }).uncheck();
  const result = await download(page);
  await checkDownload(result);
  assert.equal(result.design.artwork[0].transform[4], 65);
  assert.equal(result.design.artwork[1].visible, false);
  assert.equal(result.design.colors.back, "#667788");
  await page.getByRole("combobox", { name: "Obstacle", exact: true }).click();
  await page.getByRole("option", { name: "Corner flag", exact: true }).click();
  await page
    .getByLabel("Open a saved sheet")
    .setInputFiles(fixture(result.name, "image/svg+xml", result.svg));
  await page
    .getByRole("status")
    .filter({ hasText: "Sheet reopened." })
    .waitFor();
  assert.deepEqual((await download(page)).design, result.design);
  // A real mutation after reloading exposes incorrect group rehydration.
  await page
    .getByRole("button", { name: "club · Left post", exact: true })
    .click();
  await page.getByLabel("X", { exact: true }).fill("66");
  const after = (await download(page)).design.artwork[0];
  assert.deepEqual(after.children, result.design.artwork[0].children);
  assert.equal(after.transform[4], 66);
});

test("free shapes, editable Bézier nodes, grouping and keyboard undo survive SVG export", async (t) => {
  const page = await openPage(t);
  await draw(page);
  await page
    .getByRole("button", { name: "Convert to editable path", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Selected point", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Point 2 · corner", exact: true })
    .click();
  await page.getByRole("button", { name: "Curve", exact: true }).click();
  await page.getByLabel("Handle 1 Y", { exact: true }).fill("32");
  const curve = (await download(page)).design.artwork[0];
  assert.equal(curve.kind, "path");
  assert.equal(curve.commands[1][0], "C");
  assert.equal(curve.commands[1][2], 32);
  await page.getByRole("button", { name: "Add point", exact: true }).click();
  const split = (await download(page)).design.artwork[0];
  assert.equal(split.commands.length, curve.commands.length + 1);
  assert.equal(split.commands[1][0], "C");
  assert.equal(split.commands[2][0], "C");
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByRole("button", { name: "Select (V)", exact: true }).click();
  await page.getByRole("application").press("Control+z");
  assert.equal((await download(page)).design.artwork.length, 1);
  await page.getByRole("application").press("Control+Shift+z");
  assert.equal((await download(page)).design.artwork.length, 2);
  const rows = page.locator(".layer-name");
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ["Shift"] });
  await page
    .getByRole("button", { name: "Group selection", exact: true })
    .click();
  const grouped = await download(page);
  assert.equal(grouped.design.artwork[0].kind, "group");
  assert.equal(grouped.design.artwork[0].children.length, 2);
  await page
    .getByRole("button", {
      name: "Ungroup to edit individual shapes",
      exact: true,
    })
    .click();
  const ungrouped = await download(page);
  assert.equal(ungrouped.design.artwork.length, 2);
  await checkDownload(ungrouped);
  await page.getByRole("button", { name: "Pen (P)", exact: true }).click();
  const canvas = page.getByRole("application");
  await canvas.press("Enter");
  await canvas.press("Shift+ArrowRight");
  await canvas.press("Enter");
  await canvas.press("Shift+ArrowDown");
  await canvas.press("Enter");
  await page.getByRole("button", { name: "Close path", exact: true }).click();
  assert.equal(
    (await download(page)).design.artwork.at(-1).commands.at(-1)[0],
    "Z",
  );
});

test("mobile flag with rasterized text and hidden layers passes collection checks", async (t) => {
  const page = await openPage(t, { width: 390, height: 844 });
  await page.getByRole("combobox", { name: "Obstacle", exact: true }).click();
  await page.getByRole("option", { name: "Corner flag", exact: true }).click();
  await upload(
    page,
    logoSvg.replace(
      "</svg>",
      '<text x="10" y="70" font-size="50">Club</text></svg>',
    ),
    "text.svg",
  );
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page
    .getByRole("button", { name: "Hide text · Back", exact: true })
    .click();
  const result = await download(page);
  await checkDownload(result);
  assert.equal(result.design.artwork[0].logo.kind, "png");
  assert.equal(result.design.artwork[1].visible, false);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Close properties", exact: true })
    .click();
  await page.getByRole("button", { name: "Front", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Front", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
});

test("bad files preserve artwork and controls stay labelled and keyboard accessible", async (t) => {
  const page = await openPage(t);
  await upload(page);
  const original = await download(page);
  await page
    .getByLabel("Upload a logo")
    .setInputFiles(
      fixture(
        "unsafe.svg",
        "image/svg+xml",
        logoSvg.replace("</svg>", "<script>alert(1)</script></svg>"),
      ),
    );
  await page
    .getByRole("alert")
    .filter({ hasText: "contains scripts" })
    .waitFor();
  await page
    .getByLabel("Open a saved sheet")
    .setInputFiles(fixture("bad.svg", "image/svg+xml", "<svg/>"));
  await page
    .getByRole("alert")
    .filter({ hasText: "not made with the designer" })
    .waitFor();
  assert.equal((await download(page)).svg, original.svg);
  const controls = page.locator("input,select,button");
  for (const control of await controls.all())
    assert.ok(
      await control.evaluate(
        (el) =>
          el.labels?.length ||
          el.getAttribute("aria-label") ||
          el.textContent.trim(),
      ),
      "unlabelled control",
    );
  await page
    .getByRole("button", { name: "Sheet settings", exact: true })
    .click();
  await page.getByLabel("Texture ID").fill("../INVALID");
  assert.equal(
    await page.getByRole("button", { name: "Download SVG" }).isDisabled(),
    true,
  );
});

test("raster image resolution warning follows transformed image size", async (t) => {
  const page = await openPage(t);
  for (const kind of ["png", "jpeg"]) {
    const image = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#ff9900" },
    })
      [kind]()
      .toBuffer();
    await upload(page, image, `tiny.${kind}`, `image/${kind}`);
    await page.getByText(/tiny · Top panel: the image may look soft/).waitFor();
    const result = await download(page);
    assert.equal(result.design.artwork.at(-1).logo.kind, kind);
    await checkDownload(result);
  }
});

test("older single-logo sheets migrate to editable objects with matching placements", async (t) => {
  const page = await openPage(t),
    old = createDesign(templateDefinitions, "gate-standard-v1");
  old.logo = (
    await prepareLogo({
      type: "image/svg+xml",
      bytes: new TextEncoder().encode(logoSvg),
    })
  ).logo;
  old.panels.right.visible = false;
  old.panels.left.offsetY = 15;
  const sheet = await readFile(
    new URL("../../../templates/gate-standard-v1.svg", import.meta.url),
    "utf8",
  );
  await page
    .getByLabel("Open a saved sheet")
    .setInputFiles(
      fixture(
        "legacy.svg",
        "image/svg+xml",
        renderSheet(templateDefinitions, sheet, old),
      ),
    );
  await page
    .getByRole("status")
    .filter({ hasText: "Sheet reopened." })
    .waitFor();
  const result = await download(page);
  assert.equal(result.design.artwork.length, 2);
  assert.equal(result.design.artwork[0].transform[5], 365);
  await checkDownload(result);
});

test("pointer drawing and path anchor dragging persist and preserve untouched anchors", async (t) => {
  const page = await openPage(t);
  await draw(page);
  await page
    .getByRole("button", { name: "Convert to editable path", exact: true })
    .click();
  const before = (await download(page)).design.artwork[0];
  const world = (item, command) => {
    const x = command.at(-2) - item.offset[0],
      y = command.at(-1) - item.offset[1],
      m = item.transform;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  };
  const bounds = await page.getByRole("application").boundingBox(),
    region = templateDefinitions["gate-standard-v1"].panels.top;
  const zoom = Math.min(
    (bounds.width - 70) / region.width,
    (bounds.height - 70) / region.height,
  );
  const screen = (point) => [
    bounds.x +
      (bounds.width - region.width * zoom) / 2 +
      (point[0] - region.x) * zoom,
    bounds.y +
      (bounds.height - region.height * zoom) / 2 +
      (point[1] - region.y) * zoom,
  ];
  const point = screen(world(before, before.commands[0]));
  await page.mouse.move(...point);
  await page.mouse.down();
  await page.mouse.move(point[0] - 25, point[1] - 18, { steps: 5 });
  await page.mouse.up();
  const after = (await download(page)).design.artwork[0];
  assert.notDeepEqual(after.commands[0], before.commands[0]);
  const fixed = world(before, before.commands[2]),
    current = world(after, after.commands[2]);
  assert.ok(
    Math.abs(fixed[0] - current[0]) < 0.01 &&
      Math.abs(fixed[1] - current[1]) < 0.01,
  );
  await page.getByRole("button", { name: "Pencil (B)", exact: true }).click();
  const start = screen([220, 40]);
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(start[0] + 50, start[1] + 20, { steps: 10 });
  await page.mouse.up();
  const result = await download(page);
  assert.equal(result.design.artwork.at(-1).name, "Pencil path");
  await checkDownload(result);
});

test("template picker supports keyboard selection, dismissal and undo without clearing a reselected sheet", async (t) => {
  const page = await openPage(t);
  await draw(page);
  const original = (await download(page)).design;
  const picker = page.getByRole("combobox", {
    name: "Obstacle",
    exact: true,
    includeHidden: true,
  });
  await picker.press("ArrowDown");
  assert.equal(await picker.getAttribute("aria-expanded"), "true");
  await page
    .getByRole("option", { name: "Standard gate", exact: true })
    .press("Escape");
  assert.equal(await picker.getAttribute("aria-expanded"), "false");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Obstacle",
  );
  assert.equal(
    await picker.evaluate((element) => element === document.activeElement),
    true,
  );
  await picker.click();
  await page
    .getByRole("option", { name: "Standard gate", exact: true })
    .click();
  assert.deepEqual((await download(page)).design, original);
  await picker.press("ArrowUp");
  await page.keyboard.press("End");
  await page
    .getByRole("option", { name: "Corner flag", exact: true })
    .press("Enter");
  await page
    .locator(".status")
    .filter({ hasText: "New sheet started" })
    .waitFor({ state: "attached" });
  assert.equal((await download(page)).design.template, "corner-flag-v1");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".status").filter({ hasText: "Change undone" }).waitFor();
  assert.deepEqual((await download(page)).design, original);
  const canvasBounds = await page
    .getByRole("application", { name: "Artwork canvas" })
    .boundingBox();
  await picker.click();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("role") === "option",
  );
  await page.waitForFunction(() =>
    [...document.querySelector('[role="listbox"]').getAnimations()].every(
      (animation) => animation.playState === "finished",
    ),
  );
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page
    .getByRole("listbox", { name: "Obstacle type", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await picker.getAttribute("aria-expanded"), "false");
});

test("accent dropdown preserves keyboard focus, undo and template-specific choices on desktop and mobile", async (t) => {
  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const page = await openPage(t, viewport);
    const mobile = viewport.width < 900;
    if (mobile)
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .click();
    const accent = page.getByRole("combobox", {
      name: "Accent style",
      exact: true,
      includeHidden: true,
    });
    await accent.press("ArrowDown");
    const frame = page.getByRole("option", {
      name: "Opening frame",
      exact: true,
    });
    assert.equal(await frame.getAttribute("aria-selected"), "true");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-selected") === "true",
    );
    await frame.press("Escape");
    assert.equal(await accent.getAttribute("aria-expanded"), "false");
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Accent style",
    );
    assert.equal(
      await accent.evaluate((element) => element === document.activeElement),
      true,
    );
    await accent.press("ArrowDown");
    await frame.press("Tab");
    assert.equal(await accent.getAttribute("aria-expanded"), "true");
    await frame.press("Escape");
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Accent style",
    );
    await accent.press("Tab");
    await page
      .getByRole("listbox", { name: "Accent style", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(await accent.getAttribute("aria-expanded"), "false");
    assert.equal(
      await page
        .getByRole("checkbox", {
          name: "Add imported logos to every panel",
          exact: true,
        })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await accent.press("ArrowDown");
    await page.keyboard.press("Home");
    await page
      .getByRole("option", { name: "None", exact: true })
      .press("Enter");
    assert.equal((await download(page)).design.accent, "none");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page
      .locator(".status")
      .filter({ hasText: "Change undone" })
      .waitFor({ state: "attached" });
    assert.equal((await download(page)).design.accent, "frame");
    if (mobile)
      await page
        .getByRole("button", { name: "Close properties", exact: true })
        .click();
    await page
      .getByRole("combobox", {
        name: "Obstacle",
        exact: true,
        includeHidden: true,
      })
      .click();
    await page
      .getByRole("option", { name: "Corner flag", exact: true })
      .click();
    await page
      .locator(".status")
      .filter({ hasText: "New sheet started" })
      .waitFor({ state: "attached" });
    if (mobile)
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .click();
    await accent.click();
    assert.equal(
      await page
        .getByRole("option", { name: "Opening frame", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("option", { name: "Bottom band", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    const menu = page.getByRole("listbox", {
      name: "Accent style",
      exact: true,
      includeHidden: true,
    });
    const bounds = await menu.boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width &&
        bounds.y + bounds.height <= viewport.height,
    );
    await page.getByRole("option", { name: "None", exact: true }).click();
    const result = await download(page);
    assert.equal(result.design.accent, "none");
    await checkDownload(result);
  }
});

test("layer previews, multi-selection and per-layer actions preserve artwork", async (t) => {
  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const page = await openPage(t, viewport);
    await upload(page);
    if (viewport.width < 900)
      await page
        .getByRole("button", { name: "Properties", exact: true })
        .click();
    const layers = page.getByRole("list", {
      name: "Artwork layers",
      exact: true,
    });
    const left = layers.getByRole("button", {
      name: "club · Left post",
      exact: true,
    });
    const right = layers.getByRole("button", {
      name: "club · Right post",
      exact: true,
    });
    const original = (await download(page)).design;
    const leftId = original.artwork.find(
      (item) => item.name === "club · Left post",
    ).id;
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".layer-preview img")].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    await left.click();
    await right.click({ modifiers: ["Shift"] });
    assert.equal(await left.getAttribute("aria-pressed"), "true");
    assert.equal(await right.getAttribute("aria-pressed"), "true");
    const options = layers.getByRole("button", {
      name: "Layer options for club · Left post",
      exact: true,
    });
    await options.press("ArrowDown");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("role") === "menuitem",
    );
    const menuBounds = await page
      .getByRole("menu", { name: "Actions for club · Left post", exact: true })
      .boundingBox();
    assert.ok(
      menuBounds.x >= 0 &&
        menuBounds.y >= 0 &&
        menuBounds.x + menuBounds.width <= viewport.width &&
        menuBounds.y + menuBounds.height <= viewport.height,
    );

    await page
      .getByRole("menuitem", { name: "Duplicate", exact: true })
      .press("Escape");
    assert.equal(
      await options.evaluate((element) => element === document.activeElement),
      true,
    );
    await options.press("ArrowDown");
    await page
      .getByRole("menuitem", { name: "Bring forward", exact: true })
      .press("Enter");
    const moved = (await download(page)).design;
    assert.equal(moved.artwork[1].id, leftId);
    assert.equal(moved.artwork.length, original.artwork.length);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page
      .locator(".status")
      .filter({ hasText: "Change undone" })
      .waitFor({ state: "attached" });
    assert.deepEqual((await download(page)).design, original);
    await options.click();
    await page
      .getByRole("menuitem", { name: "Duplicate", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".layer:not(.template-layer)").length === 4,
    );
    const duplicated = (await download(page)).design;
    assert.equal(duplicated.artwork.length, 4);
    assert.equal(duplicated.artwork.at(-1).name, "club · Left post");
    assert.deepEqual(duplicated.artwork.slice(0, 3), original.artwork);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page
      .locator(".status")
      .filter({ hasText: "Change undone" })
      .waitFor({ state: "attached" });
    await layers
      .getByRole("button", { name: "Lock club · Left post", exact: true })
      .click();
    assert.equal(await left.isDisabled(), true);
    await layers
      .getByRole("button", { name: "Hide club · Left post", exact: true })
      .click();
    const hidden = (await download(page)).design.artwork.find(
      (item) => item.id === leftId,
    );
    assert.equal(hidden.visible, false);
    assert.equal(hidden.locked, true);
    await layers
      .getByRole("button", { name: "Show club · Left post", exact: true })
      .click();
    await layers
      .getByRole("button", { name: "Unlock club · Left post", exact: true })
      .click();
    assert.equal(await layers.getByRole("listitem").count(), 3);
    await page
      .getByRole("button", { name: "Sheet settings", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("combobox", { name: "Accent style", exact: true })
        .innerText(),
      "Opening frame",
    );
    await page.getByRole("checkbox", { name: "Guides", exact: true }).uncheck();
    const result = await download(page);
    assert.deepEqual(result.design, original);
    await checkDownload(result);
    await options.click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Artwork canvas",
    );
    assert.equal(await layers.getByRole("listitem").count(), 2);
    assert.deepEqual(
      (await download(page)).design.artwork,
      original.artwork.filter((item) => item.id !== leftId),
    );
  }
});

test("live viewer uses CI panel crops, updates artwork and retains transparent flag outlines", async (t) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
  });
  t.after(() => page.close());
  const errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(url))
      external.push(request.url());
  });
  await page.addInitScript(() => {
    window.previewPngs = [];
    window.previewUrls = new Set();
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      window.previewUrls.delete(url);
      revoke(url);
    };
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === "image/png") window.previewPngs.push(blob);
      const url = create(blob);
      if (blob.type === "image/png") window.previewUrls.add(url);
      return url;
    };
  });
  await page.goto(url);
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await page
    .locator(".preview-viewer canvas[data-engine]")
    .waitFor({ timeout: 30000 });
  await page.waitForFunction(() => window.previewPngs.length >= 3);
  await upload(page);
  await page.waitForFunction(
    () =>
      document.querySelector(".preview-heading [role=status]").textContent ===
      "Live",
  );
  await page.waitForTimeout(1000);
  async function comparePanels(template) {
    const result = await download(page);
    const ci = await exportSheet(result.svg, result.name);
    const count = Object.keys(templateDefinitions[template].panels).length;
    const pngs = await page.evaluate(
      async (count) =>
        Promise.all(
          window.previewPngs
            .slice(-count)
            .map(async (blob) =>
              Array.from(new Uint8Array(await blob.arrayBuffer())),
            ),
        ),
      count,
    );
    for (const [index, [panel, bytes]] of Object.entries(ci.panels).entries()) {
      const browserImage = sharp(Buffer.from(pngs[index])).ensureAlpha();
      const ciImage = sharp(bytes).ensureAlpha();
      const info = await browserImage.metadata(),
        other = await ciImage.metadata();
      assert.equal(info.width, other.width);
      assert.equal(info.height, other.height);
      const a = await browserImage.raw().toBuffer(),
        b = await ciImage.raw().toBuffer();
      let differing = 0;
      for (let i = 0; i < a.length; i += 4)
        if ([0, 1, 2, 3].some((c) => Math.abs(a[i + c] - b[i + c]) > 20))
          differing++;
      assert.ok(
        differing / (info.width * info.height) < 0.02,
        `${panel} differs materially from CI`,
      );
      if (template === "corner-flag-v1") {
        assert.ok(a.some((value, i) => i % 4 === 3 && value === 0));
        assert.ok(a.some((value, i) => i % 4 === 3 && value === 255));
      }
    }
  }
  await comparePanels("gate-standard-v1");
  const before = await page.locator(".preview-viewer").screenshot();
  await page
    .getByRole("button", { name: "Sheet settings", exact: true })
    .click();
  await page.getByLabel("Background", { exact: true }).fill("#ef4444");
  await page.waitForFunction(
    () =>
      document.querySelector(".preview-heading [role=status]").textContent ===
      "Live",
  );
  await page.waitForTimeout(1000);
  const after = await page.locator(".preview-viewer").screenshot();
  assert.notDeepEqual(before, after);
  await comparePanels("gate-standard-v1");
  await page.getByLabel("Gate back", { exact: true }).fill("#22c55e");
  await page.waitForTimeout(1200);
  const withBack = await page.locator(".preview-viewer").screenshot();
  const previous = await sharp(after)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const coloured = await sharp(withBack).raw().toBuffer();
  let changedGreen = 0;
  for (let i = 0; i < coloured.length; i += previous.info.channels) {
    const x = (i / previous.info.channels) % previous.info.width;
    if (
      x > previous.info.width / 2 &&
      coloured[i + 1] > coloured[i] * 1.4 &&
      coloured[i + 1] > coloured[i + 2] * 1.4 &&
      Math.abs(coloured[i + 1] - previous.data[i + 1]) > 25
    )
      changedGreen++;
  }
  if (process.env.DESIGNER_SCREENSHOTS) {
    await mkdir(process.env.DESIGNER_SCREENSHOTS, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.DESIGNER_SCREENSHOTS, "gate-debug.jpg"),
      type: "jpeg",
    });
  }
  assert.ok(
    changedGreen > 30,
    `the actual back-angle panel must show the chosen green back colour (${changedGreen} pixels)`,
  );
  if (process.env.DESIGNER_SCREENSHOTS) {
    await mkdir(process.env.DESIGNER_SCREENSHOTS, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.DESIGNER_SCREENSHOTS, "gate-3d.jpg"),
      type: "jpeg",
    });
  }
  await page.getByRole("combobox", { name: "Obstacle", exact: true }).click();
  await page.getByRole("option", { name: "Corner flag", exact: true }).click();
  await upload(page);
  await page.waitForFunction(
    () =>
      document.querySelector(".preview-heading [role=status]").textContent ===
      "Live",
  );
  await page.waitForTimeout(1000);
  await page
    .locator(".preview-viewer canvas[data-engine]")
    .waitFor({ state: "visible", timeout: 30000 });
  assert.equal(
    await page.locator(".preview-heading [role=status]").textContent(),
    "Live",
  );
  await comparePanels("corner-flag-v1");
  if (process.env.DESIGNER_SCREENSHOTS)
    await page.screenshot({
      path: path.join(process.env.DESIGNER_SCREENSHOTS, "flag-3d.jpg"),
      type: "jpeg",
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Reset 3D camera", exact: true })
    .click();
  await page
    .locator(".preview-viewer canvas[data-engine]")
    .waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  if (process.env.DESIGNER_SCREENSHOTS)
    await page.screenshot({
      path: path.join(process.env.DESIGNER_SCREENSHOTS, "mobile-3d.jpg"),
      type: "jpeg",
    });
  await page.getByRole("button", { name: "2D view", exact: true }).click();
  assert.equal(await page.evaluate(() => window.previewUrls.size), 0);
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await page
    .locator(".preview-viewer canvas[data-engine]")
    .waitFor({ timeout: 30000 });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});

test("the view switch preserves the 2D panel, zoom and artwork selection", async (t) => {
  const page = await openPage(t);
  await draw(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const zoom = await page.getByLabel("Zoom", { exact: true }).textContent();
  const name = await page
    .getByLabel("Object name", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await page
    .locator(".preview-viewer canvas[data-engine]")
    .waitFor({ timeout: 30000 });
  assert.equal(
    await page
      .getByRole("application", { name: "Artwork canvas", includeHidden: true })
      .isVisible(),
    false,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Rectangle (R)", exact: true })
      .isDisabled(),
    true,
  );
  await page.keyboard.press("r");
  assert.equal(
    await page
      .getByRole("button", { name: "3D view", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "2D view", exact: true }).click();
  assert.equal(
    await page.getByLabel("Zoom", { exact: true }).textContent(),
    zoom,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Top panel", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.getByLabel("Object name", { exact: true }).inputValue(),
    name,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Rectangle (R)", exact: true })
      .isEnabled(),
    true,
  );
  await draw(page, "Ellipse (E)");
  assert.equal((await download(page)).design.artwork.length, 2);
});

test("without WebGL the 2D editor still draws, undoes and downloads on mobile", async (t) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  t.after(() => page.close());
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
        ? null
        : getContext.call(this, type, ...args);
    };
  });
  await page.goto(url);
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await page
    .getByText(
      "3D needs WebGL. You can keep designing and downloading in 2D.",
      { exact: true },
    )
    .waitFor({ timeout: 30000 });
  assert.equal(
    await page
      .getByRole("button", { name: "2D view", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await draw(page);
  assert.equal((await download(page)).design.artwork.length, 1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await download(page)).design.artwork?.length ?? 0, 0);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
});

test("shared controls restore focus and keep typing and menus separate from canvas shortcuts", async (t) => {
  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    const page = await openPage(t, viewport);
    await draw(page);
    const header = page.locator(".header-actions");
    const heights = await Promise.all(
      ["Open sheet", "Download SVG", "Submit artwork"].map(
        async (name) =>
          (
            await header
              .getByRole("button", { name, exact: true })
              .boundingBox()
          ).height,
      ),
    );
    assert.deepEqual(heights, [32, 32, 32]);
    const rectangle = page.getByRole("button", {
      name: "Rectangle (R)",
      exact: true,
      includeHidden: true,
    });
    const original = (await download(page)).design;
    await rectangle.click();
    const help = page.getByRole("button", {
      name: "Keyboard shortcuts",
      exact: true,
    });
    await help.click();
    const dialog = page.getByRole("dialog", {
      name: "Keyboard shortcuts",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Back to designing", exact: true })
      .press("v");
    assert.equal(await rectangle.getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Keyboard shortcuts",
    );
    assert.deepEqual((await download(page)).design, original);

    const submit = page.getByRole("button", {
      name: "Submit artwork",
      exact: true,
    });
    await submit.click();
    const submission = page.getByRole("dialog", {
      name: "Submit obstacle artwork",
      exact: true,
    });
    const organization = submission.getByLabel("Organization", { exact: true });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("autocomplete") === "organization",
    );
    await organization.pressSequentially("vector racing");
    assert.equal(await rectangle.getAttribute("aria-pressed"), "true");
    await submission
      .getByRole("button", { name: "Close submission", exact: true })
      .press("Tab");
    assert.equal(
      await organization.evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    );
    await organization.press("Shift+Tab");
    assert.equal(
      await submission
        .getByRole("button", { name: "Close submission", exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    await submission.waitFor({ state: "detached" });
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") === "Submit artwork",
    );

    const picker = page.getByRole("combobox", {
      name: "Obstacle",
      exact: true,
      includeHidden: true,
    });
    await picker.press("ArrowDown");
    const gate = page.getByRole("option", {
      name: "Standard gate",
      exact: true,
    });
    await gate.press("v");
    await gate.press("Control+z");
    await gate.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Obstacle",
    );
    assert.equal(await rectangle.getAttribute("aria-pressed"), "true");
    assert.deepEqual((await download(page)).design, original);
    await help.press("v");
    assert.equal(
      await page
        .getByRole("button", { name: "Select (V)", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page
        .getByRole("application", { name: "Artwork canvas" })
        .evaluate((element) => element === document.activeElement),
      true,
    );
  }
});
