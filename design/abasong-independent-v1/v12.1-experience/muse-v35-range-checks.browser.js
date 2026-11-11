// M4 range states. Synthetic browser evidence, not native/provider acceptance.
async (page) => {
  const c = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage(), checks = [], errors = [];
  p.on("pageerror", e => errors.push(e.message));
  try {
    for (const width of [320, 390, 430]) {
      await p.setViewportSize({ width, height: 844 });
      for (const radius of [200, 500, 1000]) {
        for (const coverage of ["queried", "partial", "unavailable"]) {
          await p.goto(`http://127.0.0.1:8765/v12.1-experience/index.html?layout=muse&range=${radius}&coverage=${coverage}#home`);
          await p.waitForTimeout(80);
          const result = await p.evaluate(() => ({
            heading: document.querySelector(".m35-section h2").textContent,
            note: document.querySelector(".m35-range-note")?.textContent,
            rows: document.querySelectorAll("[data-row]").length,
            overflow: document.documentElement.scrollWidth > innerWidth || document.querySelector(".m35-results").scrollWidth > document.querySelector(".m35-results").clientWidth,
          }));
          const expected = radius === 1000 ? "1 km" : `${radius} m`;
          if (!result.heading.includes(expected) || result.rows !== 3 || result.overflow ||
              (coverage === "partial" && result.note !== "部分范围待补全") ||
              (coverage === "unavailable" && result.note !== "更新失败"))
            throw Error(JSON.stringify({ width, radius, coverage, result }));
          await p.evaluate(() => abasongMuse.scene("house"));
          const empty = await p.locator(".m35-results").innerText();
          if ((coverage === "partial" && !empty.includes("部分范围待补全")) ||
              (coverage === "unavailable" && !empty.includes("公寓资料暂时无法加载")) ||
              (coverage === "queried" && !empty.includes("附近未匹配到公寓")))
            throw Error("empty state: " + empty);
          if (coverage !== "queried" && empty.includes("附近未匹配到公寓")) throw Error("false empty");
          checks.push({ width, radius, coverage, status: "PASS" });
        }
      }
    }
    if (errors.length) throw Error(errors.join("; "));
    return { checks, errors, scope: "Synthetic browser only" };
  } finally { await c.close(); }
}
