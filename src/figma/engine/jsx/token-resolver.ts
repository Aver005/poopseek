// Resolves bare token names in JSX prop values to variable bindings emitted
// alongside the raw value in the op stream. Plugin uses the *VariableName
// fields to bind figma variables; raw values remain the visual fallback.

import type { JsxPropValue } from "./jsx-parser";
import {
    resolveColorToken,
    resolveNumericToken,
    resolveTypographyToken,
    resolveComponentToken,
    type TypographyValue,
    type ComponentDefinition,
} from "../theme/theme-state";

export interface ResolvedColor
{
    hex: string;
    variableName?: string;
}

export interface ResolvedNumber
{
    value: number;
    variableName?: string;
}

const HEX_RE = /^#[0-9A-Fa-f]{3,8}$/;

function asString(v: JsxPropValue | undefined): string | undefined
{
    return v === undefined ? undefined : String(v);
}

/**
 * Resolve a color prop. Inputs:
 *   "#FF0000"     → raw hex, no binding
 *   "primary"     → token lookup → { hex, variableName }
 *   "none"/false  → undefined (caller skips)
 */
export function resolveColor(v: JsxPropValue | undefined): ResolvedColor | undefined
{
    const s = asString(v);
    if (!s || s === "none" || v === false) return undefined;
    if (HEX_RE.test(s)) return { hex: s };
    const tok = resolveColorToken(s);
    if (tok) return { hex: tok.hex, variableName: tok.variable.name };
    // Unrecognized string — assume the model meant a raw value; return it
    // and let downstream code reject it if invalid.
    return { hex: s };
}

/**
 * Resolve a numeric prop (gap/padding/radius/etc.). Inputs:
 *   16             → raw number
 *   "16"           → raw number
 *   "md"           → token lookup → { value, variableName }
 *   undefined      → undefined
 */
// Fallback values when the design-system scale didn't define a key.
// Builder regularly uses `2xl`/`3xl` even if designer only emitted up
// to `xl` — silently dropping these would erase whole-section padding
// (the "section padY ignored" bug). Defaults match tailwind / common
// design-system convention.
const STANDARD_SPACING: Record<string, number> = {
    "0":   0,
    "xs":  4,
    "sm":  8,
    "md":  16,
    "lg":  24,
    "xl":  32,
    "2xl": 48,
    "3xl": 64,
    "4xl": 96,
    "5xl": 128,
};

const STANDARD_RADIUS: Record<string, number> = {
    "0":    0,
    "none": 0,
    "xs":   2,
    "sm":   4,
    "md":   8,
    "lg":   16,
    "xl":   24,
    "2xl":  32,
    "3xl":  48,
    "full": 9999,
};

const STANDARD_SCALES = { spacing: STANDARD_SPACING, radius: STANDARD_RADIUS };

export function resolveNumber(v: JsxPropValue | undefined, kind: "spacing" | "radius"): ResolvedNumber | undefined
{
    if (v === undefined) return undefined;
    if (typeof v === "number") return { value: v };
    if (typeof v === "boolean") return undefined;
    const s = String(v).trim();
    if (s === "") return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return { value: n };
    const tok = resolveNumericToken(kind, s);
    if (tok) return { value: tok.value, variableName: tok.variableName };

    // Designer didn't emit this key, but it's a well-known scale slot —
    // fall back to the standard value so padX/padY/gap/radius don't
    // silently collapse to 0. Variable binding is skipped (no token to
    // bind to), so this is a static fallback, not a live var link.
    const standard = STANDARD_SCALES[kind][s.toLowerCase()];
    if (standard !== undefined)
    {
        console.warn(`[token-resolver] ${kind}="${s}" not in active theme — using standard fallback ${standard}px`);
        return { value: standard };
    }
    console.warn(`[token-resolver] ${kind}="${s}" did not resolve — value will be DROPPED (no padding/gap applied)`);
    return undefined;
}

/** Spread a resolved color into op fields: { fill, fillVariableName? }. */
export function colorFields(prefix: string, r: ResolvedColor | undefined): Record<string, string>
{
    if (!r) return {};
    if (r.variableName) return { [prefix]: r.hex, [`${prefix}VariableName`]: r.variableName };
    return { [prefix]: r.hex };
}

/** Spread a resolved number into op fields: { <name>, <name>VariableName? }. */
export function numberFields(name: string, r: ResolvedNumber | undefined): Record<string, string | number>
{
    if (!r) return {};
    if (r.variableName) return { [name]: r.value, [`${name}VariableName`]: r.variableName };
    return { [name]: r.value };
}

/**
 * Resolve a `variant="h1"` typography reference to its prop bundle.
 * Returns undefined for an unknown variant — caller may fall back to
 * default text props or skip applying.
 */
export function resolveVariant(v: JsxPropValue | undefined): TypographyValue | undefined
{
    const s = asString(v);
    if (!s) return undefined;
    return resolveTypographyToken(s);
}

/**
 * Resolve an `as="button-primary"` component reference to its prop bag.
 * The compiler expands this onto the JSX node BEFORE other prop processing,
 * so an explicit prop on the node always wins over a component default.
 */
export function resolveAs(v: JsxPropValue | undefined): ComponentDefinition | undefined
{
    const s = asString(v);
    if (!s) return undefined;
    return resolveComponentToken(s);
}

/**
 * Map a component bundle's keys to JSX prop names recognized by our
 * compiler. DESIGN.md spec: backgroundColor / textColor / typography /
 * rounded / padding / size / height / width.
 *
 * IMPORTANT: backgroundColor and textColor BOTH map to `fill`, but they
 * apply to DIFFERENT tags:
 *   - On <Frame>/<Rect>/<Image>/etc. fill is the background → use `backgroundColor`
 *   - On <Text> fill is the glyph color → use `textColor`
 * Without tag-awareness, `textColor` (which iterates after `backgroundColor`
 * in Object.entries) silently OVERWRITES the Frame's bg — buttons end up
 * coloured by their textColor instead of their backgroundColor (e.g. white
 * button on dark theme instead of orange). The `tagName` parameter routes
 * each color key only where it belongs.
 */
export function componentBundleToProps(
    bundle: ComponentDefinition,
    tagName: string,
): Record<string, string | number>
{
    const isText = tagName === "Text";
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(bundle.props))
    {
        switch (k)
        {
            case "backgroundColor":
                if (!isText) out.fill = v;        // bg goes to Frames, not Text glyph
                break;
            case "textColor":
                if (isText) out.fill = v;         // glyph color goes ONLY to Text
                break;
            case "typography":      out.variant = v; break;
            case "rounded":         out.radius = v; break;
            case "padding":         out.padX = v; out.padY = v; break;
            case "size":            out.width = v; out.height = v; break;
            case "height":          out.height = v; break;
            case "width":           out.width = v; break;
            default:                out[k] = v;
        }
    }
    return out;
}
