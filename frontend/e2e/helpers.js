import { expect } from '@playwright/test'

export async function loginWithDemo(page, roleName = 'brand_manager') {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  
  // Wait for demo accounts panel to appear
  const demoPanel = page.locator('.demo-accounts-panel')
  await expect(demoPanel).toBeVisible({ timeout: 10000 })
  
  // Find card with matching role (handles both 'brand_manager' and 'brand manager')
  const roleText = roleName.replace('_', ' ')
  const accountCard = demoPanel.locator('.demo-account-item', { hasText: new RegExp(roleText, 'i') })
  await expect(accountCard).toBeVisible()
  
  const useBtn = accountCard.locator('button', { hasText: 'Use these' })
  await useBtn.click()
  
  // Submit
  const submitBtn = page.locator('button[type="submit"]')
  await expect(submitBtn).toBeEnabled()
  await submitBtn.click()
  
  // Verify redirected into the app
  await page.waitForURL('**/app/**', { timeout: 15000 })
  await expect(page.locator('.sidebar-bottom strong, .eyebrow').first()).toBeVisible({ timeout: 10000 })
}

export async function loginWithCredentials(page, email, password) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  
  const submitBtn = page.locator('button[type="submit"]')
  await submitBtn.click()
}

export async function signOut(page) {
  const logoutBtn = page.locator('.logout-button')
  await expect(logoutBtn).toBeVisible()
  await logoutBtn.click()
  await page.waitForURL('**/login', { timeout: 10000 })
  await expect(page.locator('h1')).toContainText(/brandpilot/i)
}
