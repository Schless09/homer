/** Map retailer color names ("Charcoal Gray", "Natural Oak") to a hex used for 3D/2D rendering. */
const COLORS: [RegExp, string][] = [
  [/walnut|espresso|dark wood|mahogany/, "#6b4429"],
  [/white oak|light oak|ash|birch|blonde/, "#d8c3a0"],
  [/oak|natural|teak|acacia|wood|honey/, "#c49a6c"],
  [/cognac|caramel|saddle|tan leather|whiskey/, "#8a4f2a"],
  [/charcoal|graphite|slate gray|dark gr[ae]y/, "#3d3d3f"],
  [/light gr[ae]y|silver|dove|fog|pebble/, "#c9c9c6"],
  [/gr[ae]y/, "#8c8c8a"],
  [/black|ebony|onyx|jet/, "#232323"],
  [/ivory|boucl|cream|off[-\s]?white|snow|chalk|bone/, "#ece4d6"],
  [/white/, "#f4f2ee"],
  [/oatmeal|linen|flax|sand|beige|khaki|wheat|stone|taupe|mushroom/, "#d8cbb5"],
  [/navy|indigo|midnight/, "#26344f"],
  [/blue|denim|teal|ocean/, "#5b6b7a"],
  [/olive|moss|army/, "#6f7350"],
  [/sage|mint|eucalyptus/, "#9aa58b"],
  [/green|emerald|forest/, "#3f6b4f"],
  [/rust|terracotta|clay|burnt orange|cinnamon/, "#b4654a"],
  [/blush|pink|rose|mauve/, "#d9b5a6"],
  [/mustard|ochre|yellow|gold(?!en oak)/, "#c9a03d"],
  [/brass|bronze|champagne/, "#b8955a"],
  [/chrome|nickel|steel|stainless/, "#c9cdd1"],
  [/brown|chocolate|coffee|mocha/, "#5a3f2e"],
  [/red|burgundy|wine|oxblood/, "#7a2b2b"],
];

export function colorNameToHex(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const hex = name.match(/#[0-9a-f]{6}\b/i);
  if (hex) return hex[0].toLowerCase();
  const n = name.toLowerCase();
  for (const [re, h] of COLORS) if (re.test(n)) return h;
  return undefined;
}
