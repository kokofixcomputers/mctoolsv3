/** Where the app is served from. "/" normally, "/tools/" when it is bundled into the panel. */
export const BASE: string = import.meta.env.BASE_URL

/** Prefixes a path from the public folder with the base the app is served from. */
export const asset = (path: string): string => BASE + path.replace(/^\/+/, '')
