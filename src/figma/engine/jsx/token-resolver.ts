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
 */
export function componentBundleToProps(bundle: ComponentDefinition): Record<string, string | number>
{
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(bundle.props))
    {
        switch (k)
        {
            case "backgroundColor": out.fill = v; break;
            case "textColor":       out.fill = v; break; // also used by Text — same key works for both
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
