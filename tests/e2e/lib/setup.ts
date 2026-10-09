// (1009 #16) 三個 bug 重現測試＋spike 共用的開機流程：準備 vault／profile、開
// Obsidian、連 CDP、等 app 就緒、把 plugin 從 restricted mode 救出來、關掉信任對話框。
import {
  type CdpClient,
  connectToPage,
} from "./cdp";
import {
  dismissTrustDialogIfPresent,
  launchObsidian,
  prepareProfile,
  prepareVault,
  stopObsidian,
  type LaunchedObsidian,
} from "./launcher";

export interface E2eSession {
  launched: LaunchedObsidian;
  cdp: CdpClient;
  fixtureLabel: string;
  buildLabel: string;
}

export async function startSession(port: number): Promise<E2eSession> {
  const { vaultDir, fixtureLabel, buildLabel } = prepareVault(port);
  const profileDir = prepareProfile(port, vaultDir);

  const launched = launchObsidian(port, profileDir);
  // 從這裡開始，任何一步失敗都要先把剛開的 Obsidian 殺掉再把例外丟出去
  // ——不然 beforeAll 拋例外時，呼叫端的 `session` 變數還沒賦值，afterAll 裡
  // endSession(session) 會因為 session 是 undefined 直接 no-op，留下孤兒行程
  // （explore 階段真的撞到過：Obsidian 啟動異常慢時，等 app.workspace 逾時，
  // 行程就這樣被拋著沒人收）。
  try {
    const cdp = await connectToPage(port);
    try {
      await cdp.evaluate(
        `(async () => { const start = Date.now(); while (!window.app?.workspace) { if (Date.now() - start > 20000) throw new Error("app.workspace 逾時沒出現"); await new Promise(r => setTimeout(r, 200)); } return true; })()`
      );

      // restricted mode 解除＋確保 plugin 真的 enable（設計決定 7）。
      await cdp.evaluate(
        `(async () => {
          app.plugins.setEnable(true);
          if (!app.plugins.plugins["vocab-tracker"]) {
            await app.plugins.enablePluginAndSave("vocab-tracker");
          }
          return true;
        })()`
      );
      // 給 Obsidian 自己的「這個 vault 第一次開，你信任作者嗎」流程一點時間跑完，
      // 再把 modal 關掉（spike 發現：這個 modal 會在 enable 呼叫之後才非同步跳出來）。
      await new Promise((r) => setTimeout(r, 500));
      await dismissTrustDialogIfPresent((expr) => cdp.evaluate(expr));
    } catch (err) {
      cdp.close();
      throw err;
    }
    return { launched, cdp, fixtureLabel, buildLabel };
  } catch (err) {
    await stopObsidian(launched);
    throw err;
  }
}

// Node 端輪詢（而不是整個丟進瀏覽器一個大 while-loop 用 Runtime.evaluate 的
// awaitPromise 卡著等）：每次都是獨立的短 evaluate call，CdpClient 本來就有的
// "Execution context was destroyed" retry 更容易生效，出問題時也比較看得出是哪一步
// 卡住。plugin.activateSidebar() 之後，leaf 要到 DeferredView 真的 load 完才會讓
// sidebarView() 回傳非 null（1.7.2+ 的已知行為，見 main.ts sidebarView() 註解）。
//
// 已知會不穩（第一段回報有記錄）：這一帶在長時間、連續開很多次 Obsidian 的 session
// 裡，偶爾會整整卡滿 timeoutMs 都等不到 sidebarView() —— 懷疑跟 Obsidian 每次全新
// profile 啟動都會呼叫 GitHub 檢查更新有關（profile 持久化之後仍然會發生，猜測是
// GitHub API 在短時間內被打很多次之後的 rate limit 或其他網路延遲，沒有 100% 查清
// 楚）。這裡做兩層緩解：給一個遠超過正常值的 timeout，逾時後重打一次
// activateSidebar() 再給半個 timeout 的機會——真的兩輪都不行才放棄。如果之後還是
// 常常卡，考慮把 Obsidian 的自動更新檢查整個關掉（目前沒找到官方的關閉方式）。
export async function openSidebarReady(
  session: E2eSession,
  timeoutMs = 45000
): Promise<void> {
  const tryOnce = async (budgetMs: number): Promise<boolean> => {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      // 包成字串回傳（而不是直接回傳 boolean 原始值）—— 跟專案裡其他所有 evaluate
      // call 一致的作法，比較不會踩到 CDP returnByValue 對原始型別偶爾序列化不順的
      // 雷（這個函式最早用直接回傳 boolean，結果在某些情況下穩定量到 falsy，單獨
      // debug 用字串版本反而每次都正常 —— 具體原因沒有再深究，統一成字串比較保險）。
      const readyStr = await session.cdp.evaluate<string>(
        `(() => JSON.stringify(!!app.plugins.plugins["vocab-tracker"].sidebarView()))()`
      );
      if (readyStr === "true") return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  };

  await session.cdp.evaluate(
    `(async () => { await app.plugins.plugins["vocab-tracker"].activateSidebar(); return true; })()`
  );
  if (await tryOnce(timeoutMs)) return;

  // 第一輪整個 timeout 都沒等到，重打一次 activateSidebar()（有時候第一次呼叫卡在
  // Obsidian 自己的某個內部狀態，第二次反而很快）。
  await session.cdp.evaluate(
    `(async () => { await app.plugins.plugins["vocab-tracker"].activateSidebar(); return true; })()`
  );
  if (await tryOnce(Math.round(timeoutMs / 2))) return;

  throw new Error(`sidebarView() 在 ${timeoutMs + Math.round(timeoutMs / 2)}ms 內沒出現（重打過一次 activateSidebar）`);
}

export async function endSession(session: E2eSession | undefined): Promise<void> {
  if (!session) return;
  session.cdp.close();
  await stopObsidian(session.launched); // 輪詢到真的死掉（或逾時 SIGKILL）才回傳。
}
