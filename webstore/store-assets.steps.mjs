// store-assets.steps.mjs — 掲載画像の撮影前操作（vitrina が読み込む）。
// Clean Reload には popup・コンテンツスクリプトが無く、操作は右クリックメニュー（ブラウザ描画）なので撮影できない。
// そのため fixtures/context-menu.html（中立的なメニュー再現）に、拡張の _locales の文言とアイコンを差し込んで撮る。
import fs from "node:fs";
import path from "node:path";
import { fontFamilyCss, toLangTag } from "./vitrina/lib/config.mjs";

// Clean Reload は storage 権限を持たない（言語は chrome.i18n で決まり、切替 UI も無い）。キットは storage 権限の無い拡張では
// 言語の書き込みを省くので、ここで補う処理は無い。文言は fillMenu が _locales から直接差し込む。

const REPO = path.resolve(import.meta.dirname, "..");
// アイコンは SVG 正本を data URI にする（icons/icon-*.png は gitignore の生成物で、CI では無いことがあるため）
const ICON_URI = `data:image/svg+xml;base64,${fs.readFileSync(path.join(REPO, "icons", "icon.svg")).toString("base64")}`;

/** メニュー項目の文言を session.messages[locale]（_locales の messages.json）から埋め、ロケール別フォントを当てる。 */
async function fillMenu({ page, locale, session }) {
  const dict = session.messages[locale];
  const labels = {};
  for (const key of ["menuCleanReloadAllTabs", "menuDiscardBackgroundTabs", "menuOpenDnsCache"]) {
    const text = dict?.[key]?.message;
    if (typeof text !== "string" || !text) throw new Error(`_locales/${locale} に ${key} がありません`);
    labels[key] = text;
  }
  await page.evaluate(
    (labelMap, icon, lang, family) => {
      document.documentElement.lang = lang;
      document.body.style.fontFamily = family;
      for (const el of document.querySelectorAll("[data-msg]")) el.textContent = labelMap[el.dataset.msg];
      document.getElementById("ext-icon").src = icon;
    },
    labels,
    ICON_URI,
    toLangTag(locale),
    fontFamilyCss(locale),
  );
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => {}))));
    await document.fonts.ready;
  });
}

export default {
  "menu-hero": fillMenu,
  "menu-all": fillMenu,
  "menu-sleep": fillMenu,
};
