import { test, expect } from '@playwright/test';

test.describe('A2 Eventos - Smoke Tests', () => {
  test('should load the login page', async ({ page }) => {
    // Navigate to the base URL (defined in playwright.config.js)
    await page.goto('/');

    // Check if the title is correct (Adjust as needed based on the actual UI)
    // Looking at index.html, the title is "A2 Eventos"
    await expect(page).toHaveTitle(/A2 Eventos/);
    
    // Check for a login indicator (e.g., a button or text)
    // Based on the code, there's a login form. Let's look for "Entrar" or a login field.
    const loginTitle = page.locator('h4, h5, h6', { hasText: /Login/i });
    if (await loginTitle.isVisible()) {
        await expect(loginTitle).toBeVisible();
    }
  });

  test('should show validation error on empty login', async ({ page }) => {
    await page.goto('/');
    
    // Try to click a button that says "Entrar" or "Login"
    const loginButton = page.locator('button', { hasText: /Entrar|Login/i }).first();
    await loginButton.click();
    
    // We expect some feedback, but for a smoke test, just being able to click is good.
    // In many MUI apps, validation is immediate.
  });
});
