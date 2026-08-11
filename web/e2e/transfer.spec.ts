import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';

test.describe('Warp Transfer', () => {
  test('golden path: real two-tab transfer', { tag: '@smoke' }, async ({ browser }) => {
    // 1. Context A opens /send
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/send');
    
    // Create an in-memory 4 MB buffer of random bytes
    const buffer = crypto.randomBytes(4 * 1024 * 1024);
    
    // Set the file to the hidden file input
    const fileChooserPromise = pageA.waitForEvent('filechooser');
    await pageA.getByText('click to browse').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{
      name: 'random-4mb.bin',
      mimeType: 'application/octet-stream',
      buffer: buffer
    }]);

    // Click "Open secure channel"
    await pageA.getByRole('button', { name: /Open secure channel/i }).click();

    // Read the room code
    const codeElement = pageA.locator('text=code:').locator('xpath=following-sibling::strong').first();
    // Wait for the code to be populated
    await expect(pageA.getByText('code:', { exact: false })).toBeVisible();
    const textContent = await pageA.locator('strong').first().textContent();
    const code = textContent?.trim();
    if (!code) throw new Error("Could not find room code");

    // 2. Context B opens /r/<code>
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`/r/${code}`);

    // Context A should now be connected and the "Send 1 file" button should be visible (as sender is in control)
    // Wait, the issue says: "A opens /send, queues file, reads room code. B opens /r/<code>, waits for accept modal, accepts"
    // Actually, in the new UI, files are staged, and when the channel opens, A has to click "Send N files".
    // Wait, "nothing is offered until the user hits Send in the session".
    // Let's click "Send 1 file" in Context A.
    await pageA.getByRole('button', { name: /Send 1 file/i }).click();

    // B waits for the accept modal
    await pageB.getByRole('button', { name: 'Accept' }).click();

    // B route download
    const downloadPromise = pageB.waitForEvent('download');
    // After it completes, B can click "Download" button on the item row, or does it auto-download?
    // "No auto-download." We must click Download.
    // Wait for "DONE" status on A
    await expect(pageA.getByText('DONE')).toBeVisible({ timeout: 60000 });
    
    await expect(pageB.getByText('DONE')).toBeVisible({ timeout: 60000 });
    await pageB.getByRole('button', { name: /Download/i }).click();
    
    const download = await downloadPromise;
    
    // Assert downloaded bytes hash-match
    const stream = await download.createReadStream();
    const hash = crypto.createHash('sha256');
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    const downloadedHash = hash.digest('hex');
    const originalHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    expect(downloadedHash).toBe(originalHash);

    await contextA.close();
    await contextB.close();
  });

  test('decline path', { tag: '@smoke' }, async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/send');
    
    const buffer = crypto.randomBytes(1024);
    const fileChooserPromise = pageA.waitForEvent('filechooser');
    await pageA.getByText('click to browse').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{
      name: 'decline-test.txt',
      mimeType: 'text/plain',
      buffer: buffer
    }]);

    await pageA.getByRole('button', { name: /Open secure channel/i }).click();
    await expect(pageA.getByText('code:', { exact: false })).toBeVisible();
    const code = (await pageA.locator('strong').first().textContent())?.trim();
    if (!code) throw new Error("Could not find room code");

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`/r/${code}`);

    await pageA.getByRole('button', { name: /Send 1 file/i }).click();

    // B declines
    await pageB.getByRole('button', { name: 'Decline' }).click();

    // A shows declined
    await expect(pageA.getByText('DECLINED')).toBeVisible({ timeout: 10000 });

    await contextA.close();
    await contextB.close();
  });

  test('text snippet round-trip', { tag: '@smoke' }, async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await pageA.goto('/');
    
    // Wait for the UI
    await pageA.getByText('Send a file').click(); // Navigate to /send if not already there, actually we can just go to /send
    await pageA.goto('/send');

    // To just send text, we can open channel directly?
    // "Open secure channel ->" button is disabled if no files?
    // Wait, let's check TransferFlow.tsx: `<button disabled={!files.length} ...> Open secure channel -> </button>`
    // Oh, we can't open channel without files.
    // Let's add a dummy file, open channel, then send text.
    const buffer = crypto.randomBytes(10);
    const fileChooserPromise = pageA.waitForEvent('filechooser');
    await pageA.getByText('click to browse').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([{
      name: 'dummy.txt',
      mimeType: 'text/plain',
      buffer: buffer
    }]);
    await pageA.getByRole('button', { name: /Open secure channel/i }).click();
    
    await expect(pageA.getByText('code:', { exact: false })).toBeVisible();
    const code = (await pageA.locator('strong').first().textContent())?.trim();
    
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`/r/${code}`);

    // Wait for session view
    await expect(pageA.getByPlaceholder('…or paste a link / note to send as text')).toBeVisible();
    
    // Type text and send
    const textMessage = "Hello from context A";
    await pageA.getByPlaceholder('…or paste a link / note to send as text').fill(textMessage);
    await pageA.getByRole('button', { name: /Send text/i }).click();

    // B should receive the text modal
    await pageB.getByRole('button', { name: 'Accept' }).click();

    // Wait for DONE status or text visible on B
    await expect(pageB.getByText(textMessage)).toBeVisible({ timeout: 15000 });

    await contextA.close();
    await contextB.close();
  });
});
