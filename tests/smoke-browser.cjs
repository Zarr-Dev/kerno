const assert = require("node:assert/strict");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const failures = [];
  const viewports = [
    { width: 320, height: 640, name: "small phone" },
    { width: 375, height: 667, name: "phone" },
    { width: 390, height: 844, name: "large phone" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1366, height: 768, name: "laptop" },
    { width: 1920, height: 1080, name: "desktop" },
  ];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      page.on("pageerror", error => failures.push(viewport.name + ": " + error.message));
      await page.goto("http://127.0.0.1:8000", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#heroStartButton", { state: "visible" });
      await page.waitForTimeout(180);

      const layout = await page.evaluate(() => {
        const button = document.querySelector("#heroStartButton");
        const banner = document.querySelector("#heroBanner");
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          title: document.title,
          locale: document.documentElement.lang,
          visible: rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && Number(style.opacity) > 0,
          inFirstViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          heroWidth: banner.getBoundingClientRect().width,
          screenWidth: window.innerWidth,
        };
      });

      assert.equal(layout.locale, "id", viewport.name + ": Indonesian should be the default locale.");
      assert.equal(layout.visible, true, viewport.name + ": primary Hero action must be visible.");
      assert.equal(layout.inFirstViewport, true, viewport.name + ": primary Hero action must not require scrolling.");
      assert.equal(layout.horizontalOverflow, false, viewport.name + ": landing page must not overflow horizontally.");
      assert.ok(layout.heroWidth <= layout.screenWidth, viewport.name + ": Hero must fit the viewport.");

      await page.locator("#heroTutorialButton").click();
      await page.waitForFunction(() => !document.querySelector("#tutorialScreen").classList.contains("hidden"));
      await page.locator("#backFromTutorial").click();
      await page.waitForFunction(() => !document.querySelector("#welcomeScreen").classList.contains("hidden"));
      await page.locator("#heroStartButton").click();
      await page.waitForFunction(() => !document.querySelector("#newProjectScreen").classList.contains("hidden"));

      const vboxControls = await page.evaluate(() => [
        "virtualboxMachineSelect",
        "virtualboxRefreshButton",
        "virtualboxStartButton",
        "virtualboxShutdownButton",
      ].every(id => !!document.getElementById(id)));
      assert.equal(vboxControls, true, viewport.name + ": VirtualBox controls must be present in the Machine workspace.");

      console.log("PASS " + viewport.name + " (" + viewport.width + "×" + viewport.height + "): Hero, navigation and no horizontal overflow.");
      await page.close();
    }
    if (failures.length) throw new Error(failures.join("\n"));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
