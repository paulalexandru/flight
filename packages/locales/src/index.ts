import ro from "./ro.json";
import en from "./en.json";

export const resources = { ro: { translation: ro }, en: { translation: en } };
export const defaultLanguage = "ro";
export const supportedLanguages = ["ro", "en"] as const;
