"use strict";
const { chromium } = require("playwright");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];

  page.on("pageerror", error => errors.push("pageerror: " + error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });
  await page.route("https://fonts.googleapis.com/**", route =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" })
  );

  try {
    await page.goto("http://127.0.0.1:8000/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.locator("#welcomeScreen:not(.hidden)").waitFor({ timeout: 10000 });
    await page.waitForFunction(() => document.querySelector("#heroTitle")?.textContent?.trim().length > 0);

    const heroText = await page.locator("#heroTitle").innerText();
    assert(heroText.includes("Buat OS"), "The OS Builder hero title did not render.");
    const animation = await page.locator(".hero-status-dot").evaluate(el => getComputedStyle(el).animationName);
    assert(animation !== "none", "The boot preview animation is not active.");
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.locator("#landingFeaturesButton").click();
    const featureVisible = await page.locator("#platformSection").evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= -20 && rect.top < window.innerHeight;
    });
    assert(featureVisible, "The Features navigation did not scroll to its section.");

    await page.locator("#landingWorkflowButton").click();
    const workflowVisible = await page.locator("#workflowSection").evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= -20 && rect.top < window.innerHeight;
    });
    assert(workflowVisible, "The Workflow navigation did not scroll to its section.");

    await page.locator('[data-kernel-stage="3"]').click();
    await page.locator("#tutorialScreen:not(.hidden)").waitFor();
    await page.waitForTimeout(120);
    const tutorialMetrics = await page.locator("#tutorialScreen").evaluate(root => {
      const target = document.querySelector("#tutorial-stage-3");
      const header = document.querySelector("#tutorialScreen .tutorial-header");
      const rootRect = root.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      return {
        scrollTop: root.scrollTop,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        rootTop: Math.round(rootRect.top),
        rootBottom: Math.round(rootRect.bottom),
        targetTop: Math.round(targetRect.top),
        targetBottom: Math.round(targetRect.bottom),
        headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
        lastTarget: root.dataset.kernoLastScrollTarget || "",
        requestedScrollTop: root.dataset.kernoScrollTop || "",
        actualScrollTop: root.dataset.kernoActualScrollTop || ""
      };
    });
    assert(
      tutorialMetrics.targetTop < tutorialMetrics.rootBottom &&
      tutorialMetrics.targetBottom > tutorialMetrics.rootTop + tutorialMetrics.headerHeight,
      "Kernel topic action did not bring its tutorial stage into view: " + JSON.stringify(tutorialMetrics)
    );
    const tutorialHeading = await page.locator("#tutorial-stage-3 h2").innerText();
    assert(tutorialHeading.length > 0, "The kernel topic action did not open the related tutorial.");

    await page.locator("#backFromTutorial").click();
    await page.locator("#welcomeScreen:not(.hidden)").waitFor();
    await page.locator("#heroStartButton").click();
    await page.locator("#newProjectScreen:not(.hidden)").waitFor();
    await page.locator("#cancelNewProject").click();
    await page.locator("#welcomeScreen:not(.hidden)").waitFor();

    await page.locator("#themeToggleWelcome").click();
    assert(await page.locator("body").evaluate(el => el.classList.contains("light-theme")), "The Light theme action failed.");
    await page.locator("#themeToggleWelcome").click();
    assert(await page.locator("body").evaluate(el => el.classList.contains("monochrome-theme")), "The monochrome theme action failed.");
    await page.locator("#themeToggleWelcome").click();
    assert(!(await page.locator("body").evaluate(el => el.classList.contains("light-theme") || el.classList.contains("monochrome-theme"))), "The Dark theme action failed.");

    await page.locator("#clearRecentButton").click();
    await page.locator("#kernoModal:not(.hidden)").waitFor();
    await page.locator("#modalConfirmButton").click();
    await page.locator("#kernoModal.hidden").waitFor();
    assert(await page.locator("#recentProjects").count() === 1, "Recent projects panel was removed unexpectedly.");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.locator("#welcomeScreen").evaluate(el => ({
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
      heroVisible: (() => {
        const rect = document.querySelector("#heroBanner").getBoundingClientRect();
        return rect.width > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1;
      })()
    }));
    assert(mobile.scrollWidth <= mobile.width + 1, "The landing page overflows horizontally on mobile: " + JSON.stringify(mobile));
    assert(mobile.heroVisible, "The hero banner is not fitting the mobile viewport.");

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedAnimation = await page.locator(".hero-status-dot").evaluate(el => getComputedStyle(el).animationName);
    assert(reducedAnimation === "none", "Reduced-motion preference did not disable decorative motion.");

    assert(errors.length === 0, "Browser errors detected:\n" + errors.join("\n"));
    console.log("Landing E2E passed: navigation, tutorial CTA, project CTA, themes, modal confirmation, mobile width and reduced motion.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
