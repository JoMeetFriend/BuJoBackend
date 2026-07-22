import i18next from 'i18next'
import Backend from 'i18next-fs-backend'
import middleware from 'i18next-http-middleware'
import { fileURLToPath } from 'node:url'

await i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    backend: {
      loadPath: fileURLToPath(new URL('../locales/{{lng}}.json', import.meta.url)),
    },
    fallbackLng: 'zh-TW',
    // 語言代碼跟前端（src/stores/locale.js 的 ALLOWED_LOCALES）保持一致，用 'en' 不用 'en-US'。
    supportedLngs: ['zh-TW', 'en'],
    preload: ['zh-TW', 'en'],
    ns: ['translation'],
    defaultNS: 'translation',
    detection: {
      order: ['querystring', 'header'],
      lookupQuerystring: 'lng',
      caches: false,
      // 瀏覽器 Accept-Language 常見的是 en-GB / en-AU / en-CA 這類非 en-US 的英文變體，
      // 這裡統一收斂成 base language 再比對 supportedLngs，避免因為對不上精確地區代碼而誤判回中文。
      // 注意：不能改用 i18next 的 nonExplicitSupportedLngs / load:'languageOnly'，
      // 那兩個選項會連 preload 的 'zh-TW'（本身就帶連字號地區碼）一起收斂成 'zh'，
      // 導致找不到 zh-TW.json 對應資源、整個中文翻譯直接失效（已經實測踩到這個坑）。
      convertDetectedLanguage: (lng) => {
        const base = lng.split('-')[0].toLowerCase();
        if (base === 'zh') return 'zh-TW';
        if (base === 'en') return 'en';
        return lng;
      },
    },
    interpolation: { escapeValue: false },
  })

export default i18next
export const i18nMiddleware = middleware.handle(i18next)
