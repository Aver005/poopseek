// Minimal DESIGN.md parser. Tailored to the schema we accept — not a full
// YAML parser. Splits the file into front-matter (between `---` fences)
// and prose body, extracts our four token kinds (colors / typography /
// rounded / spacing) plus components, and resolves `{path.to.token}`
// references against the local document.

import type { ThemeToken, TypographyValue, ComponentSlot } from "./theme-state";

export interface ComponentBundle
{
    name: string;
    props: Record<string, string | number>;
    semanticType?: string;
    variants?: Record<string, string[]>;
    overrides?: Record<string, Record<string, string | number>>;
    slots?: ComponentSlot[];
    layout?: Record<string, string | number>;
}

export interface ParsedDesignMd
{
    name?: string;
    description?: string;
    tokens: ThemeToken[];
    components: ComponentBundle[];
    prose: string; // markdown body (everything after the second `---`)
}

const FRONT_MATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/;

interface YamlMap { [k: string]: YamlValue; }
type YamlValue = string | number | YamlMap;

/**
 * Parse a strict subset of YAML used by DESIGN.md: top-level scalar / map
 * values + nested maps via indentation. No arrays, no anchors, no flow
 * style. Indentation must be a consistent number of spaces (we accept any
 * step that's a multiple of 2).
 */
function parseYaml(src: string): YamlMap
{
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const root: YamlMap = {};
    type Frame = { indent: number; map: YamlMap };
    const stack: Frame[] = [{ indent: -1, map: root }];

    for (let i = 0; i < lines.length; i++)
    {
        const raw = lines[i];
        if (raw === undefined) continue;
        // Strip comments — # starts a comment unless inside quotes. Cheap heuristic.
        const stripped = raw.replace(/\s+#.*$/, "");
        if (stripped.trim() === "") continue;

        const m = /^(\s*)([^:]+):\s*(.*)$/.exec(stripped);
        if (!m) continue;
        const indent = m[1]!.length;
        const key = m[2]!.trim();
        const valuePart = m[3]!.trim();

        // Pop frames whose indent is >= current.
        while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) stack.pop();
        const parent = stack[stack.length - 1]!;

        if (valuePart === "" || valuePart === "{" || valuePart === "[")
        {
            // Nested map starts here.
            const child: YamlMap = {};
            parent.map[key] = child;
            stack.push({ indent, map: child });
        }
        else
        {
            parent.map[key] = parseScalar(valuePart);
        }
    }

    return root;
}

function parseScalar(raw: string): string | number
{
    const s = raw.trim();
    // Quoted string
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
        return s.slice(1, -1);
    // Number (plain or with px / em / rem suffix → keep as string)
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
}

const REF_RE = /\{([a-zA-Z0-9._-]+)\}/g;

function resolveRefs(value: string, root: YamlMap): string
{
    let out = value;
    // Cap at 8 expansions to avoid infinite loops on circular refs.
    for (let i = 0; i < 8; i++)
    {
        let changed = false;
        out = out.replace(REF_RE, (_match, path: string) =>
        {
            const v = lookup(root, path);
            if (typeof v === "string" || typeof v === "number")
            {
                changed = true;
                return String(v);
            }
            return _match;
        });
        if (!changed) break;
    }
    return out;
}

function lookup(root: YamlMap, dotPath: string): YamlValue | undefined
{
    const segs = dotPath.split(".");
    let cur: YamlValue | undefined = root;
    for (const seg of segs)
    {
        if (cur === undefined || typeof cur !== "object") return undefined;
        cur = (cur as YamlMap)[seg];
    }
    return cur;
}

function asMap(v: YamlValue | undefined): YamlMap | undefined
{
    return v && typeof v === "object" ? (v as YamlMap) : undefined;
}

/**
 * Parse a DESIGN.md document.
 * - Returns extracted tokens (color / typography / rounded → `radius` /
 *   spacing) and component bundles, plus the prose body for prompt
 *   injection.
 * - If the input has no front-matter fence, returns empty tokens and the
 *   whole input as prose. The designer pipeline should reject that.
 */
export function parseDesignMd(input: string): ParsedDesignMd
{
    const m = FRONT_MATTER_RE.exec(input.trim());
    if (!m)
        return { tokens: [], components: [], prose: input.trim() };

    const yaml = parseYaml(m[1]!);
    const prose = m[2]!.trim();

    const name = typeof yaml.name === "string" ? yaml.name : undefined;
    const description = typeof yaml.description === "string" ? yaml.description : undefined;

    const tokens: ThemeToken[] = [];

    // Colors → kind=color
    const colors = asMap(yaml.colors);
    if (colors)
    {
        for (const [key, raw] of Object.entries(colors))
        {
            const v = typeof raw === "string" ? resolveRefs(raw, yaml) : String(raw);
            if (/^#[0-9A-Fa-f]{3,8}$/.test(v))
                tokens.push({ kind: "color", key, value: v });
        }
    }

    // Spacing → kind=spacing
    const spacing = asMap(yaml.spacing);
    if (spacing)
    {
        for (const [key, raw] of Object.entries(spacing))
        {
            const n = numericPx(raw, yaml);
            if (n !== undefined) tokens.push({ kind: "spacing", key, value: String(n) });
        }
    }

    // Rounded → kind=radius (DESIGN.md uses `rounded`, we keep our internal `radius` kind)
    const rounded = asMap(yaml.rounded);
    if (rounded)
    {
        for (const [key, raw] of Object.entries(rounded))
        {
            const n = numericPx(raw, yaml);
            if (n !== undefined) tokens.push({ kind: "radius", key, value: String(n) });
        }
    }

    // Typography → kind=typography (value is the resolved sub-prop object).
    const typography = asMap(yaml.typography);
    if (typography)
    {
        for (const [key, raw] of Object.entries(typography))
        {
            const obj = asMap(raw);
            if (!obj) continue;
            const props = flattenTypographyEntry(obj, yaml);
            if (Object.keys(props).length > 0)
                tokens.push({ kind: "typography", key, value: props });
        }
    }

    // Components. Extended schema (v2):
    //   <name>:
    //     type: button                        # semantic hint
    //     layout: { ... }                     # master frame layout
    //     variants:
    //       state: "default,hover,disabled"   # comma-separated axis values
    //       size: "sm,md,lg"
    //     overrides:
    //       state=hover: { backgroundColor: "{colors.primary-hover}" }
    //     slots:
    //       label: { type: text, default: "Button" }
    //       icon:  { type: image, optional: true }
    //     props: { ... }                      # legacy `as=` prop bag
    //
    // Backward compat: top-level scalar props (anything that's not one of
    // the reserved keys above) is treated as a legacy prop entry, mirroring
    // v1 schema. Numeric-looking strings are coerced to numbers.
    const RESERVED = new Set(["type", "layout", "variants", "overrides", "slots", "props"]);
    const coerce = (v: string | number): string | number =>
        typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;

    const components: ComponentBundle[] = [];
    const compMap = asMap(yaml.components);
    if (compMap)
    {
        for (const [name, raw] of Object.entries(compMap))
        {
            const obj = asMap(raw);
            if (!obj) continue;

            const props: Record<string, string | number> = {};
            const layout: Record<string, string | number> = {};
            let semanticType: string | undefined;
            let variants: Record<string, string[]> | undefined;
            let overrides: Record<string, Record<string, string | number>> | undefined;
            let slots: ComponentSlot[] | undefined;

            for (const [k, v] of Object.entries(obj))
            {
                if (k === "type" && typeof v === "string")
                {
                    semanticType = v.trim();
                }
                else if (k === "variants")
                {
                    const axesMap = asMap(v);
                    if (axesMap)
                    {
                        variants = {};
                        for (const [axis, axisVal] of Object.entries(axesMap))
                        {
                            if (typeof axisVal === "string")
                            {
                                variants[axis] = axisVal.split(",").map((s) => s.trim()).filter(Boolean);
                            }
                        }
                    }
                }
                else if (k === "overrides")
                {
                    const ov = asMap(v);
                    if (ov)
                    {
                        overrides = {};
                        for (const [variantKey, propsObj] of Object.entries(ov))
                        {
                            const m = asMap(propsObj);
                            if (!m) continue;
                            const bag: Record<string, string | number> = {};
                            for (const [pk, pv] of Object.entries(m))
                            {
                                const resolved = typeof pv === "string" ? resolveRefs(pv, yaml) : pv;
                                if (typeof resolved !== "object") bag[pk] = coerce(resolved);
                            }
                            overrides[variantKey] = bag;
                        }
                    }
                }
                else if (k === "slots")
                {
                    const sm = asMap(v);
                    if (sm)
                    {
                        slots = [];
                        for (const [slotName, slotDef] of Object.entries(sm))
                        {
                            const m = asMap(slotDef);
                            if (!m) continue;
                            const slotType = typeof m.type === "string" ? m.type : "text";
                            slots.push({
                                name: slotName,
                                type: (slotType === "image" || slotType === "frame") ? slotType : "text",
                                default: typeof m.default === "string" ? m.default : undefined,
                                optional: m.optional === "true" || (m.optional as unknown) === true,
                            });
                        }
                    }
                }
                else if (k === "layout")
                {
                    const lm = asMap(v);
                    if (lm)
                    {
                        for (const [lk, lv] of Object.entries(lm))
                        {
                            const resolved = typeof lv === "string" ? resolveRefs(lv, yaml) : lv;
                            if (typeof resolved !== "object") layout[lk] = coerce(resolved);
                        }
                    }
                }
                else if (k === "props")
                {
                    const pm = asMap(v);
                    if (pm)
                    {
                        for (const [pk, pv] of Object.entries(pm))
                        {
                            const resolved = typeof pv === "string" ? resolveRefs(pv, yaml) : pv;
                            if (typeof resolved !== "object") props[pk] = coerce(resolved);
                        }
                    }
                }
                else if (!RESERVED.has(k))
                {
                    // Legacy: bare scalars at the top level become props.
                    const resolved = typeof v === "string" ? resolveRefs(v, yaml) : v;
                    if (typeof resolved !== "object") props[k] = coerce(resolved);
                }
            }

            components.push({
                name,
                props,
                semanticType,
                variants,
                overrides,
                slots,
                layout: Object.keys(layout).length > 0 ? layout : undefined,
            });
        }
    }

    return { name, description, tokens, components, prose };
}

function numericPx(raw: YamlValue | undefined, yaml: YamlMap): number | undefined
{
    if (raw === undefined) return undefined;
    if (typeof raw === "number") return raw;
    if (typeof raw === "object") return undefined;
    const resolved = resolveRefs(raw, yaml);
    // Strip px / em / rem unit. Keep integers in px; em/rem we coerce to px
    // assuming 16 = 1rem. This is a coarse heuristic — figma is px-native.
    const m = /^(-?\d+(\.\d+)?)(px|em|rem)?$/.exec(resolved.trim());
    if (!m) return undefined;
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return undefined;
    const unit = m[3];
    if (unit === "em" || unit === "rem") return n * 16;
    return n;
}

function flattenTypographyEntry(obj: YamlMap, yaml: YamlMap): TypographyValue
{
    const out: TypographyValue = {};
    for (const [k, v] of Object.entries(obj))
    {
        if (typeof v === "object") continue;
        const resolved = typeof v === "string" ? resolveRefs(v, yaml) : v;

        switch (k)
        {
            case "fontFamily":
                out.fontFamily = String(resolved);
                break;
            case "fontSize":
            {
                const n = numericPx(resolved, yaml);
                if (n !== undefined) out.fontSize = n;
                break;
            }
            case "fontWeight":
                out.fontWeight = String(resolved);
                break;
            case "lineHeight":
            {
                const n = numericPx(resolved, yaml);
                if (n !== undefined) out.lineHeight = n;
                else out.lineHeight = String(resolved);
                break;
            }
            case "letterSpacing":
            {
                const n = numericPx(resolved, yaml);
                if (n !== undefined) out.letterSpacing = n;
                break;
            }
            // fontFeature / fontVariation: not in TypographyValue; ignore.
        }
    }
    return out;
}
