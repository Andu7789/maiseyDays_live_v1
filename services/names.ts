const NAME_TITLES = new Set(["mr", "mrs", "miss", "ms", "mx", "dr", "prof"]);

/**
 * First name for greetings, e.g. "Hi {name}," — drops a leading title
 * ("MR ANDREW BRITAIN" -> "Andrew") and fixes ALL-CAPS/all-lowercase
 * records so it doesn't come out as "Hi MR," or "Hi ANDREW,".
 */
export const getFirstName = (fullName: string): string => {
  const words = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const nameWords = words.length > 1 && NAME_TITLES.has(words[0].toLowerCase().replace(/\.$/, "")) ? words.slice(1) : words;
  const first = nameWords[0];
  if (!first) return "there";
  return first === first.toUpperCase() || first === first.toLowerCase() ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : first;
};
