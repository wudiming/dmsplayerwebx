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

        # 1. 打开设置
        print("Opening Settings...")
        await page.evaluate("window.__openSettings('appearance')")
        await page.wait_for_timeout(1000)

        # 2. 点击外观设置
        app_tab = await page.query_selector("button:has-text('外观设置')")
        if app_tab:
            await app_tab.click()
            await page.wait_for_timeout(600)

        app_path = os.path.join(artifact_dir, "verify_appearance_page.png")
        await page.screenshot(path=app_path)
        print(f"Appearance page saved: {app_path}")

        # 打开字体配置弹窗
        print("Opening Font Config...")
        font_btn = await page.query_selector("button:has-text('配置')")
        if font_btn:
            await font_btn.click()
            await page.wait_for_timeout(600)
            font_path = os.path.join(artifact_dir, "verify_font_dialog.png")
            await page.screenshot(path=font_path)
            print(f"Font dialog saved: {font_path}")

            # 关闭字体弹窗
            cancel_btn = await page.query_selector("button:has-text('取消')")
            if cancel_btn:
                await cancel_btn.click()
                await page.wait_for_timeout(400)

        # 滚到外观设置中的“布局”
        print("Scrolling Appearance to layout...")
        await page.evaluate("""() => {
            const content = document.querySelector('.overflow-y-auto');
            if (content) content.scrollTop = 800;
        }""")
        await page.wait_for_timeout(600)
        app_layout_path = os.path.join(artifact_dir, "verify_appearance_layout.png")
        await page.screenshot(path=app_layout_path)
        print(f"Appearance layout saved: {app_layout_path}")

        # 3. 点击歌词设置
        print("Clicking Lyric settings tab...")
        lyric_tab = await page.query_selector("button:has-text('歌词设置')")
        if lyric_tab:
            await lyric_tab.click()
            await page.wait_for_timeout(600)

        lyric_path = os.path.join(artifact_dir, "verify_lyric_settings_clean.png")
        await page.screenshot(path=lyric_path)
        print(f"Lyric settings saved: {lyric_path}")

        await browser.close()
        print("Verification complete!")

if __name__ == "__main__":
    asyncio.run(main())
