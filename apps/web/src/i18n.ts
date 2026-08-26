import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { resources, defaultLanguage } from "@flight/locales";

i18n.use(initReactI18next).init({
  resources,
  lng: defaultLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
