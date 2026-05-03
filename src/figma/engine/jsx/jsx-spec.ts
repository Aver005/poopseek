export interface ComponentSpec
{
    rootOnly?: boolean;
    noChildren?: boolean;
    textOnly?: boolean;
    allowedProps: Set<string>;
}

const COMMON_PROPS = [
    "id",
    "name",
    "className",
    "x",
    "y",
    "w",
    "h",
    "width",
    "height",
    "opacity",
];

const CONTAINER_STYLE_PROPS = [
    "fill",
    "stroke",
    "strokeWeight",
    "gradient",
    "radius",
    "cornerRadius",
    "shadow",
    "gap",
    "padX",
    "padY",
    "px",
    "py",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "align",
    "counterAlign",
    "justify",
    "justifyContent",
    "detach",
    "fullWidth",
];

const TEXT_STYLE_PROPS = [
    "text",
    "content",
    "size",
    "fontSize",
    "weight",
    "fontWeight",
    "color",
    "textColor",
    "align",
    "textAlign",
    "letterSpacing",
    "lineHeight",
];

function makeSet(values: string[]): Set<string>
{
    return new Set(values);
}

export const COMPONENT_SPECS: Record<string, ComponentSpec> = {
    Screen: {
        rootOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
    Frame: {
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
    VStack: {
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
    HStack: {
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
    Card: {
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
    Text: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    Hero: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    H1: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    H2: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    H3: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    Body: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    BodySm: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    Small: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    Caption: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    Label: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...TEXT_STYLE_PROPS]),
    },
    Button: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, ...TEXT_STYLE_PROPS, "label", "variant", "size"]),
    },
    Image: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, "src", "alt"]),
    },
    Input: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, ...TEXT_STYLE_PROPS, "placeholder"]),
    },
    Divider: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, "length", "weight", "color", "orientation", "rotation", "fill", "stroke", "strokeWeight", "className"]),
    },
    Line: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, "length", "weight", "color", "orientation", "rotation", "fill", "stroke", "strokeWeight", "className"]),
    },
    Rect: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
    Ellipse: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, "size"]),
    },
    Circle: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, "size"]),
    },
    Icon: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, ...TEXT_STYLE_PROPS, "symbol", "icon", "size"]),
    },
    Avatar: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, "symbol", "icon", "size"]),
    },
    Badge: {
        textOnly: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, ...TEXT_STYLE_PROPS, "label", "text", "size"]),
    },
    NavBar: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS, "title"]),
    },
    TabBar: {
        noChildren: true,
        allowedProps: makeSet([...COMMON_PROPS, ...CONTAINER_STYLE_PROPS]),
    },
};

export const ALLOWED_TAGS = Object.keys(COMPONENT_SPECS);

export function getComponentSpec(tagName: string): ComponentSpec | undefined
{
    return COMPONENT_SPECS[tagName];
}
