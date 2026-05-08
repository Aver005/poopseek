export const nodeMap = new Map<string, string>();
export const collectionCache = new Map<string, VariableCollection>();
export const colorVariableCache = new Map<string, Variable>();
export const numberVariableCache = new Map<string, Variable>();
// Theme collection name & mode the server uses for token variables. Set by
// the first ensure_token_variables op so handlers can look up by bare name.
export const themeCollectionRef = { collection: "PoopSeek Theme", mode: "Base" };
// Cached figma TextStyle objects keyed by the typography token name (e.g.
// "h1", "body"). Populated by ensure_text_styles, consumed by create_text.
export const textStyleCache = new Map<string, TextStyle>();
