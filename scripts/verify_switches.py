import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        artifact_dir = r"C:\Users\TopFeel\.gemini\antigravity\brain\ce4a0441-778e-4a78-a996-67734b466da7"

        print("Navigating to http://localhost:5173...")
        await page.goto("http://localhost:5173")
        await page.wait_for_timeout(4500)

        # 1. 打开外观设置
        await page.evaluate("window.__openSettings('appearance');")
        await page.wait_for_timeout(1000)

        # 滚动右侧面板到底部
        await page.evaluate("""() => {
            const el = document.querySelectorAll('.overflow-y-auto');
            if (el.length > 1) el[1].scrollTop = 500;
        }""")
        await page.wait_for_timeout(600)
        app_path = os.path.join(artifact_dir, "verify_appearance_quality_switch.png")
        await page.screenshot(path=app_path)
        print(f"Appearance switch screenshot saved: {app_path}")

        # 2. 点击左侧菜单中的“歌词设置”
        print("Clicking '歌词设置'...")
        await page.click("text=歌词设置")
        await page.wait_for_timeout(1000)

        lyric_path = os.path.join(artifact_dir, "verify_lyric_settings_clean.png")
        await page.screenshot(path=lyric_path)
        print(f"Lyric clean screenshot saved: {lyric_path}")

        await browser.close()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
