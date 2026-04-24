/** Shared display helpers for record metadata.
 *
 * All of these massage MARC-style source data into something a reader wants
 * to look at. Source JSON keeps MARC-exact strings; display layers call
 * these helpers.
 */

// Strip trailing whitespace + MARC punctuation (slash, period, comma,
// semicolon, colon). "A title about Pompeii /" → "A title about Pompeii".
export function cleanTitle(s: string): string {
  return s.replace(/[\s./,;:]+$/, '').trim();
}

// First-pass author cleanup: drop MARC relator-term suffixes and trailing
// punctuation. "Doe, Jane, author." → "Doe, Jane". Intentionally
// conservative; will be refined once we've reviewed real examples.
const RELATOR_RE =
  /,?\s*(author|editor|translator|creator|compiler|contributor|illustrator|narrator|photographer|director|producer)s?\.?\s*$/i;
export function cleanAuthor(s: string): string {
  return s
    .replace(RELATOR_RE, '')
    .replace(/[\s.,]+$/, '')
    .trim();
}

// NYU Bobcat (Primo VE) deep link for a record's MMS Id.
export function bobcatUrl(mmsId: string): string {
  const params = new URLSearchParams({
    docid: `alma${mmsId}`,
    context: 'L',
    vid: '01NYU_INST:NYU',
    lang: 'en',
    search_scope: 'CI_NYU_CONSORTIA',
    adaptor: 'Local Search Engine',
    tab: 'Unified_Slot',
    offset: '0',
  });
  return `https://search.library.nyu.edu/discovery/fulldisplay?${params.toString()}`;
}
