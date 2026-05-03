# Primitives Stage

Цель: собрать сильную reusable library для экрана.

Выход:

1. `figma.primitives.plan`
2. `figma.primitives.jsx`

Правила:

1. Не переходи к `figma.compose.*`.
2. Делай только reusable primitives, а не одноразовые куски экрана.
3. Имена, props и responsibility должны быть очевидны.
4. Если можно, выбирай более выразительные и полезные кирпичики, а не банальные контейнеры без смысла.
5. `figma.primitives.plan` принимает только metadata entries формата `{name, level, description?, props?, dependencies?}`.
6. В `figma.primitives.plan` никогда не передавай `jsx`.
7. У каждого primitive должен быть `level`: `atom`, `molecule` или `section`.
8. `figma.primitives.jsx` вызывается только после успешного `figma.primitives.plan`.
9. Пиши JSX только на допустимых Figma-компонентах (`Screen`, `Frame`, `VStack`, `HStack`, `Card`, `Button`, `Text`, `Image` и т.д.).
10. Не используй HTML-теги (`div`, `span`, `button`, `section`) и не используй inline `style`.
11. В `figma.primitives.jsx` JSON содержит только `primitivesArtifactId` и `names[]`.
12. Сам JSX каждого primitive должен идти следующими fenced блоками `jsx`, а не строками внутри JSON.
13. Используй только реальные artifact ids из runtime context, не выдумывай `tokens_custom_v1` или `primitives_plan_v1`.
14. Valid `level`: `atom`, `molecule`, `section`.
15. Invalid `level`: `component`, `layout`, `block`, `element`.
16. Invalid JSX: `import React`, `React.createElement`, DOM tags, inline `style`, raw hex colors, browser handlers.
17. Если validator падает, исправляй dialect Figma JSX, а не переходи на React/DOM или null-return functions.

Минимальный пример `figma.primitives.plan`:

```json
{
  "tool": "figma.primitives.plan",
  "args": {
    "tokensArtifactId": "tokens_food_delivery_v1",
    "entries": [
      {
        "name": "HeroBanner",
        "level": "section",
        "description": "Main promo block with heading, supporting text and CTA",
        "props": ["title", "subtitle", "ctaLabel"],
        "dependencies": ["SectionEyebrow", "PrimaryButton"]
      },
      {
        "name": "PrimaryButton",
        "level": "atom",
        "description": "Main CTA button",
        "props": ["label"]
      }
    ]
  }
}
```

Минимальный пример `figma.primitives.jsx`:

```json
{
  "tool": "figma.primitives.jsx",
  "args": {
    "primitivesArtifactId": "primitives_home_v1",
    "names": ["HeroBanner", "PrimaryButton"]
  }
}
```

`HeroBanner`

```jsx
<Card className="bg-brand rounded-3xl p-5 gap-3">
  <H3 className="text-on-brand">{title}</H3>
  <BodySm className="text-on-brand">{subtitle}</BodySm>
  <PrimaryButton label={ctaLabel} />
</Card>
```

`PrimaryButton`

```jsx
<Button label={label} className="bg-white text-brand rounded-xl" />
```

Анти-примеры, которые запрещены:

```json
{
  "tool": "figma.primitives.plan",
  "args": {
    "tokensArtifactId": "tokens_custom_v1",
    "entries": [
      { "name": "Card", "level": "component" },
      { "name": "Container", "level": "layout" }
    ]
  }
}
```

```jsx
import React from "react";
const Card = () => <div style={{ padding: 24, background: "#fff" }} />;
```
