import { expect, test, type Page } from "@playwright/test";

// Use fixed mtimes so separate browser File objects model picking the same file.
async function addFiles(page: Page, files: [number, number][], drop = false) {
  await page.getByTestId("file-input").evaluate((input, { files, drop }) => {
    const transfer = new DataTransfer();
    for (const [size, lastModified] of files) {
      transfer.items.add(new File(["x".repeat(size)], "report.pdf", { lastModified }));
    }
    if (drop) {
      input.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    } else {
      (input as HTMLInputElement).files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, { files, drop });
}

for (const width of [390, 1280]) {
  test(`pending queue deduplicates selections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // This test exercises local staging only; no peer or cloud service is needed.
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto("/send");
    const rows = page.locator(".warp-remove");
    await addFiles(page, [[3, 100], [3, 100]]);
    await expect(rows).toHaveCount(1);
    await addFiles(page, [[3, 100]]);
    await expect(rows).toHaveCount(1);
    await addFiles(page, [[3, 100]], true);
    await expect(rows).toHaveCount(1);
    await addFiles(page, [[4, 100], [3, 101]]);
    await expect(rows).toHaveCount(3);
    await rows.first().click();
    await expect(rows).toHaveCount(2);
    await addFiles(page, [[3, 100]]);
    await expect(rows).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
