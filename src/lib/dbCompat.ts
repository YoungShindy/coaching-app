// Hilfen, damit die App auch dann läuft, wenn ein Datenbank-Update (Migration) noch nicht eingespielt ist.

/** Meldet die Datenbank eine unbekannte Spalte? */
export const isColumnError = (err: { message?: string; code?: string } | null | undefined) =>
  !!err && /column|schema cache|PGRST204|42703/i.test(`${err.message ?? ''} ${err.code ?? ''}`)

/** Zeile ohne die genannten (neuen) Spalten. */
export function withoutKeys<T extends Record<string, unknown>>(row: T, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)))
}

/** Fehlt die Tabelle noch (Datenbank-Update nicht eingespielt)? */
export const isMissingTable = (err: { message?: string; code?: string } | null | undefined) =>
  !!err && (/42P01|PGRST205|does not exist|schema cache/i.test(`${err.code ?? ''} ${err.message ?? ''}`) || isColumnError(err))
