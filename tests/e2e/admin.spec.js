'use strict';
// @ts-check
const { test, expect } = require('@playwright/test');
const { loginAsAdmin, expectSuccessToast, expectErrorToast } = require('./helpers');

/**
 * Admin Panel — CRUD and navigation tests.
 *
 * Every test gets a fresh authenticated session via loginAsAdmin() in beforeEach.
 * Tests are serial to prevent race conditions on the server-side JSON file.
 *
 * Key stable selectors (all from admin.html):
 *   Section nav:   [onclick*="showSection"][onclick*="'sectionName'"]
 *   Section pages: #sec-overview  #sec-company  #sec-hero  #sec-services
 *                  #sec-portfolio  #sec-process  #sec-testimonials
 *                  #sec-about  #sec-stats  #sec-contact  #sec-texts  #sec-password
 *   Save all:      [onclick="saveAll()"]
 *   Toast:         #toast.show
 *   Lists:
 *     #svcs-list-ar / #svcs-list-en
 *     #port-list-ar / #port-list-en
 *     #proc-list-ar / #proc-list-en
 *     #testi-list-ar / #testi-list-en
 *   Modals:
 *     #svc-modal  #port-modal  #step-modal  #testi-modal
 *   Modal close:   .modal-close
 */
test.describe.serial('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ── Overview ──────────────────────────────────────────────────────────────
  test('overview section shows service and portfolio counts', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'overview\'"]').click();
    await expect(page.locator('#sec-overview')).toBeVisible();
    // updateOverview() populates these spans
    await expect(page.locator('#ov-svcs')).not.toBeEmpty();
    await expect(page.locator('#ov-ports')).not.toBeEmpty();
  });

  // ── Section switching ──────────────────────────────────────────────────────
  test('all sidebar nav items reveal their corresponding section', async ({ page }) => {
    const sections = [
      ['company',      '#sec-company'],
      ['hero',         '#sec-hero'],
      ['services',     '#sec-services'],
      ['portfolio',    '#sec-portfolio'],
      ['process',      '#sec-process'],
      ['testimonials', '#sec-testimonials'],
      ['about',        '#sec-about'],
      ['stats',        '#sec-stats'],
      ['contact',      '#sec-contact'],
      ['texts',        '#sec-texts'],
      ['password',     '#sec-password'],
    ];

    for (const [name, sectionId] of sections) {
      await page.locator(`[onclick*="showSection"][onclick*="'${name}'"]`).click();
      await expect(page.locator(sectionId)).toBeVisible({ timeout: 4_000 });
    }
  });

  // ── Company info ───────────────────────────────────────────────────────────
  test('company section loads form pre-filled with existing data', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'company\'"]').click();
    await expect(page.locator('#sec-company')).toBeVisible();
    // loadCompany() fills these from D.company
    await expect(page.locator('#c-nameAr')).not.toHaveValue('');
    await expect(page.locator('#c-phone')).toBeVisible();
    await expect(page.locator('#c-email')).toBeVisible();
  });

  test('editing company phone and saving shows a success toast', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'company\'"]').click();

    const phone = page.locator('#c-phone');
    const original = await phone.inputValue();
    // Make a trivial change
    await phone.fill(original + ' ');
    await page.locator('[onclick="saveAll()"]').click();
    await expectSuccessToast(page);

    // Restore the original value
    await phone.fill(original);
    await page.locator('[onclick="saveAll()"]').click();
    await expectSuccessToast(page);
  });

  // ── Services CRUD ──────────────────────────────────────────────────────────
  test('services AR list has at least one item', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'services\'"]').click();
    await page.waitForSelector('#svcs-list-ar .list-item');
    expect(await page.locator('#svcs-list-ar .list-item').count()).toBeGreaterThan(0);
  });

  test('add service: modal opens, fills, saves → item count increases', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'services\'"]').click();
    await page.waitForSelector('#svcs-list-ar .list-item');
    const before = await page.locator('#svcs-list-ar .list-item').count();

    // Open the add-service modal for AR (onclick="openAddService('ar')")
    await page.locator('[onclick="openAddService(\'ar\')"]').click();
    await expect(page.locator('#svc-modal')).toBeVisible();

    await page.locator('#svc-icon').fill('fa-star');
    await page.locator('#svc-title').fill('خدمة اختبار Playwright');
    await page.locator('#svc-desc').fill('وصف تجريبي مضاف بواسطة الاختبار الآلي');

    // Save button inside the modal (onclick="saveService()")
    await page.locator('[onclick="saveService()"]').click();
    await expect(page.locator('#svc-modal')).toBeHidden({ timeout: 5_000 });

    const after = await page.locator('#svcs-list-ar .list-item').count();
    expect(after).toBe(before + 1);
  });

  test('edit service: modal opens pre-filled; close without saving', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'services\'"]').click();
    await page.waitForSelector('#svcs-list-ar .list-item');

    // Click edit on the first list item (onclick="editService(0,'ar')" or similar)
    await page.locator('#svcs-list-ar .list-item').first()
      .locator('[onclick*="editService"]').click();
    await expect(page.locator('#svc-modal')).toBeVisible();

    // Title must be pre-filled from the existing service
    await expect(page.locator('#svc-title')).not.toHaveValue('');

    // Close without saving
    await page.locator('#svc-modal .modal-close').click();
    await expect(page.locator('#svc-modal')).toBeHidden();
  });

  test('delete last service: list count decreases by 1', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'services\'"]').click();
    await page.waitForSelector('#svcs-list-ar .list-item');
    const before = await page.locator('#svcs-list-ar .list-item').count();
    expect(before).toBeGreaterThan(0);

    // Accept the browser confirm() dialog that appears on delete
    page.once('dialog', (d) => d.accept());
    await page.locator('#svcs-list-ar .list-item').last()
      .locator('[onclick*="deleteService"]').click();

    await expect(async () => {
      const after = await page.locator('#svcs-list-ar .list-item').count();
      expect(after).toBe(before - 1);
    }).toPass({ timeout: 5_000 });
  });

  // ── Portfolio CRUD ─────────────────────────────────────────────────────────
  test('portfolio AR list has at least one item', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'portfolio\'"]').click();
    await page.waitForSelector('#port-list-ar .list-item');
    expect(await page.locator('#port-list-ar .list-item').count()).toBeGreaterThan(0);
  });

  test('add portfolio project: modal opens, fills, saves → count increases', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'portfolio\'"]').click();
    await page.waitForSelector('#port-list-ar .list-item');
    const before = await page.locator('#port-list-ar .list-item').count();

    await page.locator('[onclick="openAddProject(\'ar\')"]').click();
    await expect(page.locator('#port-modal')).toBeVisible();

    await page.locator('#port-emoji').fill('🧪');
    await page.locator('#port-cat').fill('اختبار');
    await page.locator('#port-title').fill('مشروع Playwright التجريبي');
    await page.locator('#port-desc').fill('وصف مشروع مضاف بواسطة الاختبار الآلي');

    await page.locator('[onclick="saveProject()"]').click();
    await expect(page.locator('#port-modal')).toBeHidden({ timeout: 5_000 });

    const after = await page.locator('#port-list-ar .list-item').count();
    expect(after).toBe(before + 1);
  });

  // ── Process CRUD ───────────────────────────────────────────────────────────
  test('process AR list has at least one step', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'process\'"]').click();
    await page.waitForSelector('#proc-list-ar .list-item');
    expect(await page.locator('#proc-list-ar .list-item').count()).toBeGreaterThan(0);
  });

  test('add process step: modal opens, fills, saves → count increases', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'process\'"]').click();
    await page.waitForSelector('#proc-list-ar .list-item');
    const before = await page.locator('#proc-list-ar .list-item').count();

    // openAddStep() has no lang parameter for process
    await page.locator('[onclick*="openAddStep"]').first().click();
    await expect(page.locator('#step-modal')).toBeVisible();

    await page.locator('#step-icon').fill('🧪');
    await page.locator('#step-title').fill('خطوة اختبار Playwright');
    await page.locator('#step-desc').fill('وصف الخطوة التجريبية');

    await page.locator('[onclick="saveStep()"]').click();
    await expect(page.locator('#step-modal')).toBeHidden({ timeout: 5_000 });

    const after = await page.locator('#proc-list-ar .list-item').count();
    expect(after).toBe(before + 1);
  });

  // ── Testimonials CRUD ──────────────────────────────────────────────────────
  test('testimonials AR list has at least one review', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'testimonials\'"]').click();
    await page.waitForSelector('#testi-list-ar .list-item');
    expect(await page.locator('#testi-list-ar .list-item').count()).toBeGreaterThan(0);
  });

  test('add testimonial: modal opens, fills, saves → count increases', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'testimonials\'"]').click();
    await page.waitForSelector('#testi-list-ar .list-item');
    const before = await page.locator('#testi-list-ar .list-item').count();

    // openAddTesti() has no lang parameter
    await page.locator('[onclick*="openAddTesti"]').first().click();
    await expect(page.locator('#testi-modal')).toBeVisible();

    await page.locator('#testi-avatar').fill('P');
    await page.locator('#testi-name').fill('Playwright Tester');
    await page.locator('#testi-role').fill('مهندس اختبار آلي');
    await page.locator('#testi-text').fill('رأي تجريبي مضاف بواسطة الاختبار الآلي — يُرجى التجاهل.');

    await page.locator('[onclick="saveTesti()"]').click();
    await expect(page.locator('#testi-modal')).toBeHidden({ timeout: 5_000 });

    const after = await page.locator('#testi-list-ar .list-item').count();
    expect(after).toBe(before + 1);
  });

  // ── Language tabs ──────────────────────────────────────────────────────────
  test('AR/EN tab switch in services shows the correct list', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'services\'"]').click();
    await page.waitForSelector('#svcs-list-ar');

    // Click the EN tab (onclick contains "svcs-en")
    await page.locator('[onclick*="svcs-en"]').click();
    await expect(page.locator('#svcs-list-en')).toBeVisible();
    await expect(page.locator('#svcs-list-ar')).toBeHidden();

    // Switch back to AR
    await page.locator('[onclick*="svcs-ar"]').click();
    await expect(page.locator('#svcs-list-ar')).toBeVisible();
    await expect(page.locator('#svcs-list-en')).toBeHidden();
  });

  // ── Password change ────────────────────────────────────────────────────────
  test('password section has #p-old, #p-new, #p-conf fields', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'password\'"]').click();
    await expect(page.locator('#sec-password')).toBeVisible();
    await expect(page.locator('#p-old')).toBeVisible();
    await expect(page.locator('#p-new')).toBeVisible();
    await expect(page.locator('#p-conf')).toBeVisible();
  });

  test('mismatched confirm password shows error toast', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'password\'"]').click();
    await page.locator('#p-old').fill('itqan2024');
    await page.locator('#p-new').fill('NewPass@999');
    await page.locator('#p-conf').fill('DifferentPass@999');    // Different from #p-new
    await page.locator('[onclick="changePass()"]').click();
    await expectErrorToast(page);
  });

  test('new password shorter than 6 chars shows error toast', async ({ page }) => {
    await page.locator('[onclick*="showSection"][onclick*="\'password\'"]').click();
    await page.locator('#p-old').fill('itqan2024');
    await page.locator('#p-new').fill('12');
    await page.locator('#p-conf').fill('12');
    await page.locator('[onclick="changePass()"]').click();
    await expectErrorToast(page);
  });
});
