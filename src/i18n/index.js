// To add a new language: add an entry here and create public/locales/<code>.json
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sm", label: "Gagana Sāmoa" },
  { code: "to", label: "Lea Faka-Tonga" },
  { code: "mi", label: "Te Reo Māori" },
  { code: "tl", label: "Filipino (Tagalog)" },
];

const locales = {};
let current = localStorage.getItem("tr-lang") || "en";

export const getCurrentLang = () => current;

export const setLang = (lang) => {
  current = lang;
  localStorage.setItem("tr-lang", lang);
};

export const loadLocale = async (lang) => {
  if (locales[lang]) return;
  try {
    locales[lang] = await fetch(`/locales/${lang}.json`).then((r) => r.json());
  } catch {
    console.warn(`[i18n] Could not load locale: ${lang}`);
    locales[lang] = {};
  }
};

export const t = (key, vars = {}) => {
  const str = locales[current]?.[key] ?? locales["en"]?.[key] ?? key;
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
};
