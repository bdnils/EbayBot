// Am Anfang Ihrer Datei (z.B. nach den require-Statements)
const monitoredSearches = new Map();
// Struktur für einen Eintrag in monitoredSearches:
// searchId (String): {
//   params: Object, // Suchparameter (query, plz, preis etc.)
//   intervalId: Number, // ID von setInterval für diesen Job
//   lastSeenAdIds: Set<String>, // Set von Anzeigen-IDs (data-adid) des letzten Laufs
//   lastSuccessfulCheck: Date, // Zeitpunkt des letzten erfolgreichen Checks
//   checkIntervalMinutes: Number, // Intervall in Minuten
//   subscribers: [], // Für spätere Benachrichtigungs-Erweiterungen
//   isRunning: Boolean // Zeigt an, ob der Job gerade ausgeführt wird
// }