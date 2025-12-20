import en from './en.json';
import pt from './pt.json';
import es from './es.json';

const dictionaries = {
    en,
    pt,
    es,
};

export type Locale = keyof typeof dictionaries;
export type Dictionary = typeof pt;

export const getDictionary = (lang: string): Dictionary => {
    return dictionaries[lang as Locale] ?? dictionaries.pt;
};
