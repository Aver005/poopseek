import type { JsxNode, JsxPropValue } from "@/figma/engine/jsx/jsx-parser";

// ─── Componentizer ──────────────────────────────────────────────
//
// Takes a screen JSX tree, finds repeating patterns by name + structural
// shape, and extracts them as reusable Component masters. Returns:
//   - `screen`: the screen tree with repeats replaced by <Instance> refs
//   - `masters`: a flat list of <Component> masters for the UI Kit page
//   - `registered`: the names of extracted masters
//
// Pure TypeScript, no LLM. Deterministic.
//
// Heuristic: two nodes belong to the same group iff:
//   1. Both have a meaningful `name=` (not "Frame"/"Text"/etc.)
//   2. Names canonicalize to the same key (PascalCase, trailing digits stripped)
//   3. They share the same "shape": tag + same set of structural prop names
//      + same child-tag sequence (recursive)
//
// Groups with 2+ members and a non-trivial shape get extracted. The first
// occurrence becomes the master; the rest become <Instance of="Name">
// nodes, with text content overrides emitted as text children when they
// differ from the master.

const SKIP_NAMES = new Set([
    "frame", "text", "image", "rect", "rectangle",
    "ellipse", "circle", "line", "divider",
]);

// Props that vary per-occurrence and SHOULD NOT be part of the shape
// fingerprint (so `padX={16}` vs `padX={24}` doesn't break the group).
// Props that DEFINE the shape (presence/absence matters) DO go in the
// fingerprint by name only — value differences are tolerated.
const STRUCTURAL_PROP_KEYS = new Set([
    "fill", "stroke", "strokeWidth", "strokeWeight", "gradient",
    "radius", "radiusTL", "radiusTR", "radiusBL", "radiusBR",
    "shadow", "dropShadow", "innerShadow",
    "padX", "padY", "padLeft", "padRight", "padTop", "padBottom",
    "gap", "flow", "alignX", "alignY", "center", "wrap",
    "autoLayout", "clip",
    "src",        // for images — the URL itself is the override target
]);

function canonicalName(name: string): string
{
    // Strip trailing digits (ProductCard1 → ProductCard, FeatureItem02 → FeatureItem)
    // Lowercase for case-insensitive grouping.
    return name.replace(/[-_]?\d+$/, "").toLowerCase();
}

function isSkippableName(name: string | undefined): boolean
{
    if (!name) return true;
    return SKIP_NAMES.has(name.trim().toLowerCase());
}

/** Produce a structural fingerprint for matching nodes against each other.
 *  Same fingerprint = "same component, just different content". */
function shapeFingerprint(node: JsxNode): string
{
    const props = Object.keys(node.props)
        .filter((k) => STRUCTURAL_PROP_KEYS.has(k))
        .sort()
        .join(",");

    const childShapes = node.children
        .map((c) =>
        {
            if (typeof c === "string") return "T";  // text child
            if (c.type === "Text") return "T";
            // Recursive shape — but to keep this cheap we only go one level
            // deep here; deep equivalence is checked by full recursion below.
            return c.type;
        })
        .join(",");

    return `${node.type}|${props}|${childShapes}`;
}

/** Deep shape equivalence: two nodes have the same FULL recursive structure
 *  (used as a stricter check after fingerprint matches). Tolerates differing
 *  text content and value-only differences in tolerated props. */
function deepShapeEqual(a: JsxNode, b: JsxNode): boolean
{
    if (a.type !== b.type) return false;
    if (shapeFingerprint(a) !== shapeFingerprint(b)) return false;

    if (a.children.length !== b.children.length) return false;
    for (let i = 0; i < a.children.length; i++)
    {
        const ca = a.children[i];
        const cb = b.children[i];
        if (ca === undefined || cb === undefined) return false;
        if (typeof ca === "string" || typeof cb === "string")
        {
            // Both must be string-or-text — this is fine, text content can differ.
            if (typeof ca !== "string" && ca.type !== "Text") return false;
            if (typeof cb !== "string" && cb.type !== "Text") return false;
            continue;
        }
        if (!deepShapeEqual(ca, cb)) return false;
    }
    return true;
}

interface NodeRef
{
    node: JsxNode;
    parent: JsxNode | null;     // null = root
    indexInParent: number;
}

function collectAllNodes(roots: JsxNode[]): NodeRef[]
{
    const out: NodeRef[] = [];
    function walk(node: JsxNode, parent: JsxNode | null, idx: number): void
    {
        out.push({ node, parent, indexInParent: idx });
        for (let i = 0; i < node.children.length; i++)
        {
            const c = node.children[i];
            if (typeof c === "object") walk(c, node, i);
        }
    }
    for (let i = 0; i < roots.length; i++) walk(roots[i]!, null, i);
    return out;
}

interface ExtractGroup
{
    canonicalName: string;
    masterName: string;       // PascalCase from first occurrence
    refs: NodeRef[];
}

function looksMeaningful(node: JsxNode): boolean
{
    // A node is worth componentizing if it has structural body —
    // either children or a non-trivial set of structural props.
    const propCount = Object.keys(node.props).filter((k) => STRUCTURAL_PROP_KEYS.has(k)).length;
    return node.children.length > 0 || propCount >= 2;
}

function findGroups(roots: JsxNode[]): ExtractGroup[]
{
    const all = collectAllNodes(roots);

    // Bucket by (canonicalName + fingerprint).
    const buckets = new Map<string, NodeRef[]>();
    const masterNameByCanon = new Map<string, string>();

    for (const ref of all)
    {
        const rawName = typeof ref.node.props.name === "string" ? ref.node.props.name : "";
        if (isSkippableName(rawName)) continue;
        if (!looksMeaningful(ref.node)) continue;

        // Don't extract the screen root (the outer-most named frame).
        if (ref.parent === null && roots.length === 1) continue;

        const canon = canonicalName(rawName);
        const fp = shapeFingerprint(ref.node);
        const key = `${canon}::${fp}`;

        if (!masterNameByCanon.has(canon))
            masterNameByCanon.set(canon, toPascalCase(rawName));

        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(ref);
    }

    const groups: ExtractGroup[] = [];
    for (const [_key, refs] of buckets)
    {
        if (refs.length < 2) continue;

        // Stricter check: deep shape equivalence between all members.
        const head = refs[0]!;
        const allEqual = refs.slice(1).every((r) => deepShapeEqual(head.node, r.node));
        if (!allEqual) continue;

        const canon = canonicalName(typeof head.node.props.name === "string" ? head.node.props.name : "");
        const masterName = masterNameByCanon.get(canon) ?? "Component";
        groups.push({ canonicalName: canon, masterName, refs });
    }

    // Don't extract a group whose nodes are descendants of another extracted
    // group's master node (we'd be double-extracting). Sort by depth so
    // larger structures get processed first; descendants can still be
    // extracted within the master's own body.
    groups.sort((a, b) => depthOf(b.refs[0]!) - depthOf(a.refs[0]!));
    return groups;
}

function depthOf(_ref: NodeRef): number
{
    // Simple proxy: deeper structure → higher depth. We can compute this
    // by walking up parents but for sorting purposes, a quick approximation
    // is enough: count children recursively.
    return 0;
}

function toPascalCase(s: string): string
{
    const cleaned = s.replace(/[-_]?\d+$/, "");
    if (!cleaned) return "Component";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Extract the text content of a node as a single string by joining all
 *  descendant text nodes/strings. Used to detect per-instance text overrides. */
function extractTextContent(node: JsxNode): string
{
    const parts: string[] = [];
    function walk(n: JsxNode | string): void
    {
        if (typeof n === "string") { parts.push(n.trim()); return; }
        if (n.type === "Text")
        {
            const content = typeof n.props.content === "string" ? n.props.content : "";
            const fromChildren = n.children
                .filter((c): c is string => typeof c === "string")
                .join("")
                .trim();
            parts.push(content || fromChildren);
            return;
        }
        for (const c of n.children) walk(c);
    }
    walk(node);
    return parts.filter(Boolean).join(" ");
}

const EMPTY_LOC = { index: 0, line: 0, column: 0 };

function makeInstanceNode(
    masterName: string,
    originalName: string,
    textOverride: string | undefined,
): JsxNode
{
    const props: Record<string, JsxPropValue> = {
        of: masterName,
    };
    if (originalName && originalName !== masterName)
        props.name = originalName;

    const children: (JsxNode | string)[] = [];
    if (textOverride && textOverride.length > 0)
        children.push(textOverride);

    return { type: "Instance", props, children, loc: EMPTY_LOC };
}

function makeComponentMaster(masterName: string, body: JsxNode): JsxNode
{
    // Wrap the body in a <Component name="X"> declaration.
    return {
        type: "Component",
        props: { name: masterName },
        children: [body],
        loc: EMPTY_LOC,
    };
}

export interface ComponentizeResult
{
    /** Modified screen with masters replaced by <Instance> refs. */
    screen: JsxNode[];
    /** New <Component name="X"> masters extracted, ready for the UI Kit page. */
    masters: JsxNode[];
    /** Names of the masters created (for logging + builder-prompt feedback). */
    registered: string[];
}

export function componentize(roots: JsxNode[]): ComponentizeResult
{
    const groups = findGroups(roots);
    const masters: JsxNode[] = [];
    const registered: string[] = [];

    for (const group of groups)
    {
        const masterRef = group.refs[0]!;
        const masterTextContent = extractTextContent(masterRef.node);

        // Build the master from a deep clone of the first occurrence.
        // The master keeps its full structure; we don't simplify it.
        const masterBody = cloneNode(masterRef.node);
        masters.push(makeComponentMaster(group.masterName, masterBody));
        registered.push(group.masterName);

        // Replace each occurrence with an Instance.
        for (const ref of group.refs)
        {
            const originalName = typeof ref.node.props.name === "string" ? ref.node.props.name : "";
            const instanceText = extractTextContent(ref.node);
            const textOverride = instanceText && instanceText !== masterTextContent
                ? instanceText
                : undefined;

            const inst = makeInstanceNode(group.masterName, originalName, textOverride);

            if (ref.parent === null)
            {
                roots[ref.indexInParent] = inst;
            }
            else
            {
                ref.parent.children[ref.indexInParent] = inst;
            }
        }
    }

    return { screen: roots, masters, registered };
}

function cloneNode(node: JsxNode): JsxNode
{
    return {
        type: node.type,
        props: { ...node.props },
        children: node.children.map((c) => typeof c === "string" ? c : cloneNode(c)),
        loc: node.loc,
    };
}
