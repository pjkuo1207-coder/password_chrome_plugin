# SmartPass — 智慧型密碼產生器

隱私優先、完全離線運作的 Chrome 擴充功能。核心差異化在於 **DOM 規則自動解析**：偵測目前頁面密碼欄位的
`minlength` / `maxlength` / `pattern` 限制，自動調整產生規則，確保產生的密碼不會被網站表單擋下來。

## 功能特色

- **三種產生模式**
  - 隨機密碼（可自訂長度、大小寫/數字/符號、是否排除易混淆字元 `Il1O0`）
  - 可發音密碼（子音／母音交替組合，較易記憶與輸入）
  - Passphrase 單字組合密碼
- **Smart DOM Auto-Match**：開啟外掛時自動偵測目前分頁的密碼欄位規則，並調整產生選項
- **即時強度提示**：依目前字元集與長度即時計算熵值（bits），視覺化顯示於產生結果下方
- **明亮／暗色主題**：右上角一鍵切換，偏好會記住在本機（不同步、不連網）
- **一鍵填入**：偵測到密碼欄位後，可直接將產生的密碼填入該欄位
- **剪貼簿自動清空**：複製後 30 秒自動清空剪貼簿內容（若剪貼簿內容已被覆蓋則不會誤清除）
- **本地歷史紀錄**：僅保留最近 5 筆，儲存在 `chrome.storage.local`，不連網、不同步、可一鍵清除
- **右鍵選單整合**：在任一輸入欄位按右鍵，可直接「產生密碼並填入」或「產生密碼並複製」
- **鍵盤快捷鍵**：
  - `Ctrl+Shift+U`（macOS：`Cmd+Shift+U`）— 開啟 SmartPass 彈出視窗
  - `Ctrl+Shift+G`（macOS：`Cmd+Shift+G`）— 不開啟視窗，直接產生密碼並複製

所有隨機性皆透過 `crypto.getRandomValues`（Web Crypto API）產生，不使用 `Math.random()`。

## 安裝（開發者模式 / 本機測試）

```bash
npm install
npm run build
```

1. 開啟 Chrome，前往 `chrome://extensions`
2. 開啟右上角「開發人員模式」
3. 點選「載入未封裝項目」
4. 選擇專案內的 `dist/` 資料夾（**不是**專案根目錄）

修改原始碼後執行 `npm run build`（或 `npm run dev` 持續監看），再回到 `chrome://extensions` 點擊
SmartPass 卡片上的重新整理圖示套用變更。

## 使用說明

1. 點擊瀏覽器工具列上的 SmartPass 圖示（或按 `Ctrl/Cmd+Shift+U`）開啟彈出視窗
2. 選擇產生模式（隨機 / 可發音 / Passphrase）
3. 若目前分頁有密碼欄位，SmartPass 會自動偵測其長度限制，並在彈出視窗上方顯示提示文字，同時調整
   「隨機密碼」模式的長度選項
4. 點擊「Generate」重新產生，或直接使用已產生的密碼
5. 點擊「Copy」複製到剪貼簿（30 秒後自動清空），或點擊「Fill field」直接填入偵測到的密碼欄位
6. 也可在任一輸入欄位按右鍵，選擇「SmartPass：產生密碼並填入此欄位」或「SmartPass：產生密碼並複製」
7. 「Recent」區塊顯示最近 5 筆產生紀錄（僅存於本機），可點擊「Clear」一鍵清除

### 權限說明

| 權限 | 用途 |
| --- | --- |
| `storage` | 將最近 5 筆密碼歷史存於 `chrome.storage.local`（純本機，不同步、不連網） |
| `activeTab` | 使用者主動開啟彈出視窗或觸發右鍵選單/快捷鍵時，取得目前分頁的短暫存取權 |
| `scripting` | 依需求將偵測/填入腳本注入目前分頁，而非在所有網站上常駐執行 |
| `contextMenus` | 提供右鍵選單的「產生並填入 / 產生並複製」功能，不涉及任何頁面資料存取 |

擴充功能**不會**請求 `<all_urls>` 或任何主機權限，程式碼中沒有任何對外部伺服器的網路請求。

## 開發指令

```bash
npm run dev          # webpack watch（開發模式，含 source map）
npm run build         # production build
npm test              # 執行 Jest 測試
npm run test:watch    # watch 模式
npm run lint           # ESLint 檢查 src/ 與 tests/
npm run format         # Prettier 格式化
```

上架 Chrome Web Store 的詳細步驟請見 [`PUBLISHING.md`](./PUBLISHING.md)。
