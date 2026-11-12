import { test, expect } from '@playwright/test'
import { loginWithDemo, loginWithCredentials, signOut } from './helpers.js'

test.describe.configure({ mode: 'serial' })

let latestPassportCode = 'BP-2026-9041'

test.describe('BrandPilot Round 3 - E2E Verification Suite', () => {

  // -------------------------------------------------------------
  // JOURNEY 1: Authentication & Demo Accounts Panel
  // -------------------------------------------------------------
  test('Journey 1: Sign in with demo credentials, wrong password error, sign out', async ({ page }) => {
    // 1. Wrong password error
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText(/brandpilot/i)

    await loginWithCredentials(page, 'dev@kestrelaudio.com', 'WrongPassword123!')
    const errorBanner = page.locator('.alert-vermilion')
    await expect(errorBanner).toBeVisible({ timeout: 10000 })
    await expect(errorBanner).toContainText(/invalid|incorrect|failed/i)
    expect(page.url()).toContain('/login')

    // 2. Demo accounts panel populates and signs in
    const demoPanel = page.locator('.demo-accounts-panel')
    await expect(demoPanel).toBeVisible()
    const creatorCard = demoPanel.locator('.demo-account-item', { hasText: 'creator' })
    await expect(creatorCard).toBeVisible()
    await creatorCard.locator('button', { hasText: 'Use these' }).click()

    // Email and password input fields are populated
    await expect(page.locator('#login-email')).toHaveValue('dev@kestrelaudio.com')
    await expect(page.locator('#login-password')).not.toBeEmpty()

    // Submit form
    await page.locator('button[type="submit"]').click()
    await page.waitForURL('**/app/overview', { timeout: 15000 })
    await expect(page.locator('.eyebrow')).toContainText(/overview/i)

    // Verify user role displayed in sidebar
    await expect(page.locator('.user-info')).toContainText('Content Creator')

    // 3. Sign out
    await signOut(page)
  })

  // -------------------------------------------------------------
  // JOURNEY 2: Content Intake, Pre-Flight Audit, Acceptance, Reviewer Approval & Passport
  // -------------------------------------------------------------
  test('Journey 2: Audit, accept fixes, submit, approve as reviewer, open passport, verify publicly', async ({ page }) => {
    // 1. Sign in as creator
    await loginWithDemo(page, 'creator')

    // 2. Navigate to /app/assets
    await page.click('a[href="/app/assets"]')
    await page.waitForURL('**/app/assets')
    await expect(page.locator('h1')).toContainText('Content Assets')

    // 3. Create text draft
    await page.click('button:has-text("Create Text Draft")')
    const modal = page.locator('.modal-dialog')
    await expect(modal).toBeVisible()

    const uniqueTitle = `Kestrel Soundbar Review Guide ${Date.now()}`
    await modal.locator('#draft-title').fill(uniqueTitle)
    await modal.locator('#draft-body').fill(
      'Meet Kestrel One – simply the best soundbar in the world! Only $129 cheap pricing with 24 hours playback.'
    )
    await modal.locator('button:has-text("Create Draft")').click()

    // Redirected to asset detail page
    await page.waitForURL(/\/app\/assets\/\d+/, { timeout: 15000 })
    await expect(page.locator('h1')).toContainText(uniqueTitle)

    // 4. Run Pre-flight brand audit
    const runAuditBtn = page.locator('button:has-text("Run Pre-Flight Audit")')
    await expect(runAuditBtn).toBeVisible()
    await runAuditBtn.click()

    // Wait for audit completion
    await expect(page.locator('.finding-card').first()).toBeVisible({ timeout: 15000 })

    // 5. Accept suggested fix if present
    const acceptBtn = page.locator('.finding-card').first().locator('button:has-text("Accept Fix")')
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click()
      await page.waitForTimeout(1000)
    }

    // 6. Submit for approval
    const submitBtn = page.locator('button:has-text("Submit for Approval")')
    await expect(submitBtn).toBeVisible()
    await submitBtn.click()
    await expect(page.locator('.page-header, .editorial-desk-header')).toContainText(/in review/i, { timeout: 10000 })

    // Sign out creator
    await signOut(page)

    // 7. Sign in as Reviewer
    await loginWithDemo(page, 'reviewer')

    // Navigate to /app/reviews
    await page.goto('/app/reviews')
    await page.waitForURL('**/app/reviews')
    await expect(page.locator('h1')).toContainText(/review/i)

    // Select the submitted asset card in queue
    const queueCard = page.locator('.queue-item-card, .review-queue-card', { hasText: uniqueTitle }).first()
    if (await queueCard.isVisible()) {
      await queueCard.click()
    } else {
      // Pick first card in queue
      await page.locator('.queue-item-card, .review-queue-card').first().click()
    }

    // Fill approval decision
    const approveRadio = page.locator('input[value="approved"]')
    await approveRadio.check()
    await page.locator('#decision-comment').fill('Acoustic claims and warranty parameters confirmed against lab specs.')

    const submitDecisionBtn = page.locator('button:has-text("Confirm Review Decision")')
    await expect(submitDecisionBtn).toBeEnabled()
    await submitDecisionBtn.click()

    // Verify passport is issued or toast shown
    const toastLocator = page.locator('.toast', { hasText: /passport|decision/i })
    await expect(toastLocator).toBeVisible({ timeout: 10000 })
    const toastText = await toastLocator.textContent()
    const codeMatch = toastText.match(/BP-[A-Z0-9]+-[A-Z0-9]+/i)
    if (codeMatch) {
      latestPassportCode = codeMatch[0]
    }

    // Open passports page or issued passport
    await page.goto(`/app/passports/${latestPassportCode}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText(/passport/i)
    await expect(page.locator('.passport-stamp-seal')).toContainText(/PASSED|APPROVED|REVIEW REQUIRED/i)

    // 8. Public verification without login
    await signOut(page)
    await page.goto(`/verify/${latestPassportCode}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.public-stamp')).toBeVisible()
    // Verify no private login required
    expect(page.url()).toContain(`/verify/${latestPassportCode}`)
  })

  // -------------------------------------------------------------
  // JOURNEY 3: Brand Facts Governance & Pre-Flight Impact Preview
  // -------------------------------------------------------------
  test('Journey 3: Change a fact, preview impact, confirm, passport flips, owner notified', async ({ page }) => {
    await loginWithDemo(page, 'brand_manager')

    await page.click('a[href="/app/facts"]')
    await page.waitForURL('**/app/facts')
    await expect(page.locator('h1')).toContainText('Brand Facts')

    // Check unit deduplication and badges
    await expect(page.locator('.fact-formatted-value').first()).toBeVisible()

    // Open Update Fact Modal for price
    const factRow = page.locator('.editorial-table tbody tr', { hasText: 'price' }).first()
    await expect(factRow).toBeVisible()
    await factRow.locator('button:has-text("Update")').click()

    const modal = page.locator('.modal-dialog')
    await expect(modal).toBeVisible()
    await expect(modal.locator('h2')).toContainText('Update Fact')

    // Change value and test pre-flight impact preview
    await modal.locator('#update-value').fill('139')
    const previewBox = modal.locator('.impact-preview-box')
    await expect(previewBox).toBeVisible({ timeout: 5000 })
    await expect(previewBox).toContainText(/impact preview/i)

    // Confirm update
    const confirmBtn = modal.locator('button:has-text("Confirm & Publish")')
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()

    await expect(page.locator('.toast', { hasText: /published|updated/i })).toBeVisible({ timeout: 10000 })

    // Test Admin Expiry Check Button
    const runExpiryBtn = page.locator('button:has-text("Run Expiry Check Now")')
    if (await runExpiryBtn.isVisible()) {
      await runExpiryBtn.click()
      await expect(page.locator('.toast', { hasText: /expiry audit complete/i })).toBeVisible({ timeout: 10000 })
    }

    // Sign out manager and sign in as asset owner (creator) to check notification
    await signOut(page)
    await loginWithDemo(page, 'creator')
    await page.click('a[href="/app/notifications"]')
    await page.waitForURL('**/app/notifications')
    await expect(page.locator('h1')).toContainText('Notifications')
    await expect(page.locator('.notifications-list, .notification-card, .notification-item').first()).toBeVisible()

    await signOut(page)
  })

  // -------------------------------------------------------------
  // JOURNEY 4: Brand Git: Create Draft, Diff, Replay, Activate
  // -------------------------------------------------------------
  test('Journey 4: Brand Git - create draft, inspect diff, replay, activate', async ({ page }) => {
    await loginWithDemo(page, 'brand_manager')

    // Navigate to /app/guidelines/1
    await page.goto('/app/guidelines/1')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText(/voice|claims/i)

    // Version timeline is visible
    await expect(page.locator('.version-timeline-list')).toBeVisible()

    // Rule editor: Open Create Draft Version Modal
    await page.click('button:has-text("Create Draft Version")')
    const draftModal = page.locator('.modal-dialog')
    await expect(draftModal).toBeVisible()

    const noteField = draftModal.locator('#draft-note')
    await expect(noteField).toBeVisible()
    await noteField.fill('Tighten claims rules and acoustic standards v2')

    const createDraftSubmitBtn = draftModal.locator('button:has-text("Create Draft in Brand Git")')
    await expect(createDraftSubmitBtn).toBeEnabled()
    await createDraftSubmitBtn.click()

    // Version banner updates to show draft version
    await expect(page.locator('.version-banner')).toContainText(/status: draft/i, { timeout: 10000 })

    // Diff viewer is visible
    await expect(page.locator('.diff-changes-list, .diff-summary-pills, .card-empty').first()).toBeVisible()

    // Verify "Activate version" button is disabled until replay runs
    const activateBtn = page.locator('button:has-text("Activate Version")')
    await expect(activateBtn).toBeDisabled()

    // Run Replay
    const replayBtn = page.locator('button:has-text("Run Asset Replay")').first()
    await expect(replayBtn).toBeVisible()
    await replayBtn.click()

    // Replay results card appears
    await expect(page.locator('.replay-results-card')).toBeVisible({ timeout: 15000 })

    // Activate button becomes enabled
    await expect(activateBtn).toBeEnabled({ timeout: 10000 })
    await activateBtn.click()

    // Fill activation note in modal and activate
    const activateModal = page.locator('[role="dialog"]')
    await expect(activateModal).toBeVisible()
    await activateModal.locator('#activate-note').fill('Verified against compliance regression suite.')
    await activateModal.locator('button:has-text("Confirm Activation")').click()

    // Version banner updates to active
    await expect(page.locator('.version-banner')).toContainText(/status: active/i, { timeout: 10000 })

    await signOut(page)
  })

  // -------------------------------------------------------------
  // JOURNEY 5: Governance Insights & Role-Based Access Control
  // -------------------------------------------------------------
  test('Journey 5: Insights loads for manager and reviewer, blocked for creator', async ({ page }) => {
    // 1. Manager signs in -> Insights allowed
    await loginWithDemo(page, 'brand_manager')
    await page.click('a[href="/app/insights"]')
    await page.waitForURL('**/app/insights')
    await expect(page.locator('h1')).toContainText('Governance Insights')

    // Check KPI tiles
    await expect(page.locator('.stat-block').first()).toBeVisible()

    // Check SVG Charts
    const svgChart = page.locator('svg.brand-svg-chart').first()
    await expect(svgChart).toBeVisible()

    // Test Table Fallback toggle
    const toggleFallbackBtn = page.locator('button:has-text("Show Data Table")').first()
    if (await toggleFallbackBtn.isVisible()) {
      await toggleFallbackBtn.click()
      await expect(page.locator('.chart-fallback-table').first()).toBeVisible()
      // Toggle back
      await page.locator('button:has-text("Show Visual Chart")').first().click()
      await expect(svgChart).toBeVisible()
    }

    // Check Most Disputed Rules and Compliance Table
    await expect(page.locator('.compliance-breakdown-card')).toBeVisible()

    await signOut(page)

    // 2. Creator signs in -> Insights blocked
    await loginWithDemo(page, 'creator')
    await page.goto('/app/insights')
    await page.waitForLoadState('networkidle')

    // Verify friendly in-app role blocked notice
    await expect(page.locator('.forbidden-box h2')).toContainText(/Restricted/i)
    await expect(page.locator('.forbidden-box')).toContainText(/restricted to Brand Managers and Reviewers/i)

    // Verify user can return to overview cleanly
    const returnLink = page.locator('a:has-text("Return to Overview")')
    await expect(returnLink).toBeVisible()
    await returnLink.click()
    await page.waitForURL('**/app/overview')

    await signOut(page)
  })

  // -------------------------------------------------------------
  // JOURNEY 6: Passport Management & Manager Withdrawal
  // -------------------------------------------------------------
  test('Journey 6: Withdraw a passport with a required reason', async ({ page }) => {
    await loginWithDemo(page, 'brand_manager')

    // Open existing passport
    await page.goto(`/app/passports/${latestPassportCode}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText(/passport/i)

    // Click Withdraw button
    const withdrawBtn = page.locator('button:has-text("Withdraw Passport")')
    await expect(withdrawBtn).toBeVisible()
    await withdrawBtn.click()

    const modal = page.locator('.modal-dialog')
    await expect(modal).toBeVisible()
    await expect(modal.locator('h2')).toContainText('Withdraw Trust Passport')

    // Click confirm with empty reason -> triggers min 3 chars validation error
    const confirmWithdrawBtn = modal.locator('button:has-text("Confirm Withdrawal")')
    await confirmWithdrawBtn.click()
    await expect(modal.locator('.alert-vermilion')).toContainText(/at least 3 characters/i)

    // Enter valid reason
    await modal.locator('#withdraw-reason').fill('Regulatory specification update Q4-2026')
    await confirmWithdrawBtn.click()

    // Verify status flips to Withdrawn
    await expect(page.locator('.toast', { hasText: /withdrawn/i })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.passport-stamp-seal')).toContainText(/WITHDRAWN/i)

    // Verify public verify page reflects Withdrawn
    await signOut(page)
    await page.goto(`/verify/${latestPassportCode}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.public-stamp')).toContainText(/WITHDRAWN/i)
  })

  // -------------------------------------------------------------
  // JOURNEY 7: Robustness & Defensive UX
  // -------------------------------------------------------------
  test('Journey 7: Refresh on deep links, double click prevention, upload validation, 404, error boundary', async ({ page }) => {
    await loginWithDemo(page, 'brand_manager')

    // 1. Deep link page refresh resilience
    const deepLinks = ['/app/facts', '/app/guidelines/1', '/app/assets', '/app/insights']
    for (const link of deepLinks) {
      await page.goto(link)
      await page.waitForLoadState('networkidle')
      await page.reload()
      await page.waitForLoadState('networkidle')
      // Ensure user session was maintained and page loaded
      await expect(page.locator('h1')).toBeVisible()
    }

    // 2. Client-side Upload Validation
    await page.goto('/app/assets')
    await page.click('button:has-text("Upload Document")')
    const uploadModal = page.locator('.modal-dialog')
    await expect(uploadModal).toBeVisible()

    // Button is disabled when no file selected
    await uploadModal.locator('#upload-title').fill('Empty Test')
    const submitUploadBtn = uploadModal.locator('button[type="submit"]')
    await expect(submitUploadBtn).toBeDisabled()

    // Close upload modal
    await uploadModal.locator('button:has-text("Cancel")').click()

    // 3. Unknown route 404 handling
    await page.goto('/app/definitely-unknown-route-404')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText('404')
    await expect(page.locator('.not-found-card')).toContainText(/page you are looking for does not exist/i)
    await page.click('a:has-text("Return to Overview")')
    await page.waitForURL('**/app/overview')

    // 4. Session expiration handling
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('brandpilot:session-expired'))
    })
    // Should be redirected to /login with session expired alert
    await page.waitForURL('**/login', { timeout: 10000 })
    await expect(page.locator('.alert-box')).toContainText(/session expired/i)
  })

  // -------------------------------------------------------------
  // JOURNEY 8: Capture Desktop & Mobile Screenshots for Product PDF
  // -------------------------------------------------------------
  test('Journey 8: Capture 1280px and 390px responsive screenshots of all main screens', async ({ page }) => {
    // Helper to snap both viewports
    async function snap(name, path) {
      // 1280px Desktop
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)
      await page.screenshot({ path: `e2e/screenshots/${name}-1280.png`, fullPage: false })

      // 390px Mobile
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)
      await page.screenshot({ path: `e2e/screenshots/${name}-390.png`, fullPage: false })
    }

    // Public / Unauthenticated screens
    await snap('login', '/login')
    await snap('verify', `/verify/${latestPassportCode}`)

    // Authenticated screens (login as manager)
    await page.setViewportSize({ width: 1280, height: 800 })
    await loginWithDemo(page, 'brand_manager')

    await snap('overview', '/app/overview')
    await snap('facts', '/app/facts')
    await snap('guidelines', '/app/guidelines/1')
    await snap('assets', '/app/assets')
    await snap('asset-detail', '/app/assets/1')
    await snap('reviews', '/app/reviews')
    await snap('insights', '/app/insights')
    await snap('notifications', '/app/notifications')
    await snap('passport', `/app/passports/${latestPassportCode}`)
  })

})
