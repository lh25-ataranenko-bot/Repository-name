/** Public address of the website, used in the sitemap, robots.txt and canonical links. */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
