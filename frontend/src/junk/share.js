// "Share this listing": a public page for the listing (weltzcraft.com/curbsy/?item=<id>) that shows what it is
// and its photos, never who posted it or where. Opens the phone's share sheet, or copies the link.
export const listingUrl = (id) => `https://weltzcraft.com/curbsy/?item=${encodeURIComponent(id)}`;

/** Resolves 'shared', 'copied' or '' (closed the sheet, or nothing worked). */
export async function shareListing(item) {
  const url = listingUrl(item.id);
  const text = `Free on Curbsy: ${item.title}. Grab it before someone else does!`;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: item.title, text, url });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return '';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch (error) {
    return '';
  }
}
