# Playwright (Python) browser test of the Story flow. Needs: pip install playwright, a local server on :8765 (python3 -m http.server 8765).
import asyncio
from playwright.async_api import async_playwright
SP='shots/'
import os; os.makedirs(SP,exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(600)
        await pg.screenshot(path=SP+'title.png')
        await pg.click('#storyBtn'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=SP+'story_menu.png')
        await pg.click('#storyContinue'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SP+'cs_card.png')
        # advance through prologue
        n=0
        for i in range(30):
            st = await pg.evaluate("__rescue.game.state")
            if st=='PLAYING': break
            await pg.wait_for_timeout(1500)
            if i==2: await pg.screenshot(path=SP+'cs_line.png')
            await pg.keyboard.press('Enter'); n+=1
            await pg.keyboard.press('Enter')
        print('advanced', n, await pg.evaluate("__rescue.game.state"), await pg.evaluate("__rescue.game.mode"))
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=SP+'play_story.png')
        print('hud', await pg.evaluate("[...document.querySelectorAll('#hud .hud-row:not(.hidden)')].map(e=>e.innerText.replace(/\\s+/g,' '))"))
        print('hint', await pg.evaluate("document.getElementById('hint').innerText"))
        # force a win: rescue all
        await pg.evaluate("""()=>{const g=__rescue.game, w=g.world; for(const s of w.survivors){ s.setState("FALLING"); w.deliver(s);} }""")
        await pg.evaluate("""()=>{const g=__rescue.game; let t=performance.now(); for(let k=0;k<400;k++){t+=16.67; g.frame(t);} }""")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=SP+'results_story.png')
        print('next label', await pg.inner_text('#nextBtn'), await pg.evaluate("[__rescue.storage.data.storyUnlocked, __rescue.game.state]"))
        await pg.click('#nextBtn'); await pg.wait_for_timeout(500)
        print('after next', await pg.evaluate("__rescue.game.state"))
        for i in range(30):
            if await pg.evaluate("__rescue.game.state")=='PLAYING': break
            await pg.keyboard.press('Space'); await pg.wait_for_timeout(300); await pg.keyboard.press('Space'); await pg.wait_for_timeout(100)
        print('now', await pg.evaluate("[__rescue.game.state, __rescue.game.chapter, __rescue.game.mission]"))
        await pg.reload(); await pg.wait_for_timeout(500)
        await pg.click('#storyBtn'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SP+'story_menu2.png')
        print('persist', await pg.evaluate("[__rescue.storage.data.storyUnlocked, __rescue.storage.data.storyChapter]"))
        # phone
        await pg.set_viewport_size({'width':390,'height':780}); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SP+'phone_story.png')
        await pg.click('#storyContinue'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SP+'phone_card.png')
        await pg.click('#cutscene'); await pg.wait_for_timeout(1800)
        await pg.screenshot(path=SP+'phone_line.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
