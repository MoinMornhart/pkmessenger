// Läuft die Oberfläche in der Android-App (Issue #56)? Dort gibt es keine PC-Funktionen wie Autostart,
// Fernzugang, Windows Hello oder .env – die werden ausgeblendet statt mit Fehler zu enden.
export const isAndroid = typeof window !== 'undefined' && window.api?.platform === 'android';

/** Text je nach Gerät: pc('Rechtsklick', 'Langer Druck') – damit Hilfe, Tour und Hinweise zum Handy passen. */
export const pc = (pcText, androidText) => (isAndroid ? androidText : pcText);
