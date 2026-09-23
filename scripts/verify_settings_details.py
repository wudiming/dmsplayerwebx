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

        # 1. 打开常规设置
        print("Opening Settings (General)...")
        await page.evaluate("window.__openSettings('general')")
        await page.wait_for_timeout(1000)

        settings_gen_path = os.path.join(artifact_dir, "verify_settings_general_clean.png")
        await page.screenshot(path=settings_gen_path)
        print(f"General settings saved: {settings_gen_path}")

        # 检查设置分类列表（侧边栏）
        categories = await page.evaluate("""() => {
            const tabs = Array.from(document.querySelectorAll('.settings-nav button, .settings-categories button, [role="tab"]'));
            return tabs.map(t => t.textContent.trim()).filter(Boolean);
        }""")
        print(f"Categories found: {categories}")

        # 2. 打开外观设置
        print("Opening Settings (Appearance)...")
        await page.evaluate("window.__openSettings('appearance')")
        await page.wait_for_timeout(800)

        settings_app_path = os.path.join(artifact_dir, "verify_settings_appearance_clean.png")
        await page.screenshot(path=settings_app_path)
        print(f"Appearance settings saved: {settings_app_path}")

        # 打开字体配置弹窗
        print("Opening Font Config Dialog...")
        font_btn = await page.query_selector("button:has-text('配置')")
        if font_btn:
            await font_btn.click()
            await page.wait_for_timeout(600)
            font_path = os.path.join(artifact_dir, "verify_settings_font_clean.png")
            await page.screenshot(path=font_path)
            print(f"Font config saved: {font_path}")

            cancel_btn = await page.query_selector("button:has-text('取消')")
            if cancel_btn:
                await cancel_btn.click()
                await page.wait_for_timeout(400)

        # 3. 打开歌词设置
        print("Opening Settings (Lyric)...")
        await page.evaluate("window.__openSettings('lyric')")
        await page.wait_for_timeout(800)

        lyric_path = os.path.join(artifact_dir, "verify_settings_lyric_clean.png")
        await page.screenshot(path=lyric_path)
        print(f"Lyric settings saved: {lyric_path}")

        await browser.close()
        print("Settings verification done!")

if __name__ == "__main__":
    asyncio.run(main())
