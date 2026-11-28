/**
 * TTW-266: common colour names and their hex code, so that a person can choose a colour by
 * typing its name. Product data, not theme colours: never use these for styling.
 * Pure TypeScript (no React), also read by an API script.
 */
export interface NamedColor {
  name: string;
  hex: string;
}

/** Grouped by family; this is the order of the list before anything is typed. */
export const NAMED_COLORS: readonly NamedColor[] = [
  // Neutrals
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Off white', hex: '#faf9f6' },
  { name: 'Ivory', hex: '#fffff0' },
  { name: 'Cream', hex: '#fffdd0' },
  { name: 'Beige', hex: '#f5f5dc' },
  { name: 'Natural', hex: '#e8dcc4' },
  { name: 'Sand', hex: '#c2b280' },
  { name: 'Khaki', hex: '#c3b091' },
  { name: 'Tan', hex: '#d2b48c' },
  { name: 'Light gray', hex: '#d3d3d3' },
  { name: 'Silver', hex: '#c0c0c0' },
  { name: 'Heather gray', hex: '#b2b4b8' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Dark gray', hex: '#555555' },
  { name: 'Charcoal', hex: '#36454f' },
  // Browns
  { name: 'Camel', hex: '#c19a6b' },
  { name: 'Caramel', hex: '#af6f09' },
  { name: 'Brown', hex: '#8b4513' },
  { name: 'Coffee', hex: '#6f4e37' },
  { name: 'Chocolate', hex: '#3f2113' },
  // Reds and pinks
  { name: 'Red', hex: '#ff0000' },
  { name: 'Crimson', hex: '#dc143c' },
  { name: 'Scarlet', hex: '#ff2400' },
  { name: 'Cherry red', hex: '#d2042d' },
  { name: 'Dark red', hex: '#8b0000' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Burgundy', hex: '#800020' },
  { name: 'Wine', hex: '#722f37' },
  { name: 'Coral', hex: '#ff7f50' },
  { name: 'Salmon', hex: '#fa8072' },
  { name: 'Peach', hex: '#ffcba4' },
  { name: 'Light pink', hex: '#ffb6c1' },
  { name: 'Pink', hex: '#ffc0cb' },
  { name: 'Rose', hex: '#e8708a' },
  { name: 'Hot pink', hex: '#ff69b4' },
  { name: 'Fuchsia', hex: '#ff00ff' },
  { name: 'Magenta', hex: '#ca1f7b' },
  // Oranges and yellows
  { name: 'Rust', hex: '#b7410e' },
  { name: 'Burnt orange', hex: '#cc5500' },
  { name: 'Orange', hex: '#ffa500' },
  { name: 'Dark orange', hex: '#ff8c00' },
  { name: 'Amber', hex: '#ffbf00' },
  { name: 'Gold', hex: '#d4af37' },
  { name: 'Mustard', hex: '#e1ad01' },
  { name: 'Yellow', hex: '#ffff00' },
  { name: 'Lemon', hex: '#fff44f' },
  { name: 'Light yellow', hex: '#ffffe0' },
  // Greens
  { name: 'Lime', hex: '#bfff00' },
  { name: 'Lime green', hex: '#32cd32' },
  { name: 'Light green', hex: '#90ee90' },
  { name: 'Mint', hex: '#98ff98' },
  { name: 'Sage', hex: '#9caf88' },
  { name: 'Olive', hex: '#808000' },
  { name: 'Army green', hex: '#4b5320' },
  { name: 'Green', hex: '#008000' },
  { name: 'Kelly green', hex: '#4cbb17' },
  { name: 'Emerald', hex: '#50c878' },
  { name: 'Forest green', hex: '#228b22' },
  { name: 'Dark green', hex: '#006400' },
  { name: 'Bottle green', hex: '#006a4e' },
  // Blue greens
  { name: 'Teal', hex: '#008080' },
  { name: 'Turquoise', hex: '#40e0d0' },
  { name: 'Aqua', hex: '#00ffff' },
  // Blues
  { name: 'Light blue', hex: '#add8e6' },
  { name: 'Baby blue', hex: '#89cff0' },
  { name: 'Sky blue', hex: '#87ceeb' },
  { name: 'Steel blue', hex: '#4682b4' },
  { name: 'Denim', hex: '#1560bd' },
  { name: 'Blue', hex: '#0000ff' },
  { name: 'Royal blue', hex: '#4169e1' },
  { name: 'Cobalt blue', hex: '#0047ab' },
  { name: 'Dark blue', hex: '#00008b' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Midnight blue', hex: '#191970' },
  // Purples
  { name: 'Indigo', hex: '#4b0082' },
  { name: 'Lavender', hex: '#b57edc' },
  { name: 'Lilac', hex: '#c8a2c8' },
  { name: 'Violet', hex: '#8f00ff' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Plum', hex: '#8e4585' },
];

/** Case, spaces and hyphens do not matter, and "grey" is the same word as "gray". */
function searchKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s-]+/g, '')
    .replace(/grey/g, 'gray');
}

/** Lower is better; null when the name does not match. */
function rank(name: string, key: string): number | null {
  const full = searchKey(name);
  if (full === key) return 0;
  if (full.startsWith(key)) return 1;
  if (name.split(/\s+/).some((word) => searchKey(word).startsWith(key))) return 2;
  return full.includes(key) ? 3 : null;
}

/** Colours whose name matches, best match first. An empty search returns the whole list. */
export function searchColors(query: string): readonly NamedColor[] {
  const key = searchKey(query);
  if (!key) return NAMED_COLORS;
  return NAMED_COLORS.flatMap((color) => {
    const score = rank(color.name, key);
    return score === null ? [] : [{ color, score }];
  })
    .sort((a, b) => a.score - b.score)
    .map((match) => match.color);
}

export function findColorByName(name: string): NamedColor | undefined {
  const key = searchKey(name);
  return NAMED_COLORS.find((color) => searchKey(color.name) === key);
}

export function findColorByHex(hex: string): NamedColor | undefined {
  const wanted = hex.toLowerCase();
  return NAMED_COLORS.find((color) => color.hex === wanted);
}
