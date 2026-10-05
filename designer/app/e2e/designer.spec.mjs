// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { preview } from "vite";
import { chromium } from "playwright";
import sharp from "sharp";
import { checkCollections } from "../../../scripts/check-collections.mjs";
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
  server = await preview({
    root: new URL("../", import.meta.url).pathname,
    preview: { host: "127.0.0.1", port: 0 },
  });
  url = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) =>
    server ? server.httpServer.close(resolve) : resolve(),
  );
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
async function draw(page, tool = "Rectangle (R)") {
  await page.getByRole("button", { name: "Top panel", exact: true }).click();
  await page.getByRole("button", { name: tool, exact: true }).click();
  const canvas = page.getByRole("application", { name: "Artwork canvas" });
  await canvas.press("Enter");
  await canvas.press("Shift+ArrowRight");
  await canvas.press("Shift+ArrowDown");
  await canvas.press("Enter");
  await page.getByLabel("Object name", { exact: true }).waitFor();
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
  await page
    .getByRole("combobox", { name: "Obstacle", exact: true })
    .selectOption("corner-flag-v1");
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
  await page.getByLabel("Selected point", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Curve", exact: true }).click();
  await page.getByLabel("Handle 1 Y", { exact: true }).fill("32");
  const curve = (await download(page)).design.artwork[0];
  assert.equal(curve.kind, "path");
  assert.equal(curve.commands[1][0], "C");
  assert.equal(curve.commands[1][2], 32);
  await page.getByRole('button', { name: 'Add point', exact: true }).click();
  const split = (await download(page)).design.artwork[0];
  assert.equal(split.commands.length, curve.commands.length + 1);
  assert.equal(split.commands[1][0], 'C'); assert.equal(split.commands[2][0], 'C');
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
  await page
    .getByRole("combobox", { name: "Obstacle", exact: true })
    .selectOption("corner-flag-v1");
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
