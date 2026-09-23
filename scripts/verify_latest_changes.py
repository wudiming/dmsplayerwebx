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

        # 1. 首页与雷达歌单截图
        print("Checking Home radar playlists...")
        await page.evaluate("window.scrollTo(0, 800)")
        await page.wait_for_timeout(1500)
        home_radar_path = os.path.join(artifact_dir, "verify_home_radar.png")
        await page.screenshot(path=home_radar_path)
        print(f"Home radar screenshot saved: {home_radar_path}")

        # 2. 打开设置对话框
        print("Opening settings dialog...")
        settings_btn = await page.query_selector("button[title*='设置'], button:has-text('设置'), svg.lucide-settings, svg.lucide-settings-2")
        if not settings_btn:
            # 尝试通过顶部右侧图标点击
            btns = await page.query_selector_all("header button")
            if btns:
                settings_btn = btns[-1]
        
        if settings_btn:
            await settings_btn.click()
            await page.wait_for_timeout(1000)

        settings_path = os.path.join(artifact_dir, "verify_settings_general.png")
        await page.screenshot(path=settings_path)
        print(f"Settings general screenshot saved: {settings_path}")

        # 检查是否无“插件管理”标签
        categories = await page.evaluate("""() => {
            const tabs = Array.from(document.querySelectorAll('.flex-col button, [role="tab"]'));
            return tabs.map(t => t.textContent?.trim()).filter(Boolean);
        }""")
        print(f"Settings tabs found: {categories}")
        has_plugin_tab = any("插件" in c for c in categories)
        print(f"Has plugin tab: {has_plugin_tab} (expected False)")

        # 点击“外观设置”
        appearance_tab = await page.query_selector("button:has-text('外观'), [role='tab']:has-text('外观')")
        if appearance_tab:
            await appearance_tab.click()
            await page.wait_for_timeout(800)
            
            # 点击字体配置按钮
            font_cfg_btn = await page.query_selector("button:has-text('配置')")
            if font_cfg_btn:
                await font_cfg_btn.click()
                await page.wait_for_timeout(600)
                font_path = os.path.join(artifact_dir, "verify_settings_font.png")
                await page.screenshot(path=font_path)
                print(f"Font config screenshot saved: {font_path}")
                # 关闭字体弹窗
                close_btn = await page.query_selector("button:has-text('取消'), button:has-text('关闭'), svg.lucide-x")
                if close_btn:
                    await close_btn.click()
                    await page.wait_for_timeout(400)

        # 点击“歌词设置”
        lyric_tab = await page.query_selector("button:has-text('歌词'), [role='tab']:has-text('歌词')")
        if lyric_tab:
            await lyric_tab.click()
            await page.wait_for_timeout(800)
            lyric_path = os.path.join(artifact_dir, "verify_settings_lyric.png")
            await page.screenshot(path=lyric_path)
            print(f"Lyric settings screenshot saved: {lyric_path}")

        # 关闭设置窗口
        close_settings = await page.query_selector(".fixed button:has(svg.lucide-x), button[aria-label='Close'], button:has-text('完成')")
        if close_settings:
            await close_settings.click()
            await page.wait_for_timeout(600)

        # 3. 访问音乐库
        print("Navigating to /#/discover/playlists (音乐库)...")
        await page.goto("http://localhost:5173/#/discover/playlists")
        await page.wait_for_timeout(3000)
        lib_path = os.path.join(artifact_dir, "verify_music_library.png")
        await page.screenshot(path=lib_path)
        print(f"Music library screenshot saved: {lib_path}")

        # 4. 访问艺术家
        print("Navigating to /#/discover/artists (艺术家)...")
        await page.goto("http://localhost:5173/#/discover/artists")
        await page.wait_for_timeout(3000)
        artist_path = os.path.join(artifact_dir, "verify_artists.png")
        await page.screenshot(path=artist_path)
        print(f"Artists screenshot saved: {artist_path}")

        # 5. 访问排行榜
        print("Navigating to /#/discover/toplists (排行榜)...")
        await page.goto("http://localhost:5173/#/discover/toplists")
        await page.wait_for_timeout(3000)
        toplist_path = os.path.join(artifact_dir, "verify_toplists.png")
        await page.screenshot(path=toplist_path)
        print(f"Toplists screenshot saved: {toplist_path}")

        # 6. 访问统计页面
        print("Navigating to /#/stats (统计)...")
        await page.goto("http://localhost:5173/#/stats")
        await page.wait_for_timeout(2500)
        stats_path = os.path.join(artifact_dir, "verify_stats.png")
        await page.screenshot(path=stats_path)
        print(f"Stats screenshot saved: {stats_path}")

        await browser.close()
        print("All verifications completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
