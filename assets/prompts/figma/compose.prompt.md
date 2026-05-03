# Compose Stage

Цель: собрать один сильный экран из готовых tokens и primitives.

Выход:

1. `figma.compose.meta`
2. `figma.compose.jsx`
3. `figma.compile`

Правила:

1. Делай один актуальный результат, не плодя лишние экраны.
2. Root screen обязан уважать viewport и content width.
3. Думай про hierarchy, hero, spacing rhythm и читаемый content flow.
4. Не делай пресный "дефолтный" экран, если brief просит выразительность.
5. Строгая последовательность: `figma.compose.meta` -> `figma.compose.jsx` -> `figma.compile`.
6. `figma.compose.meta` принимает только metadata graph, без raw JSX.
7. `figma.compile` в staged flow принимает только `compositionArtifactId`.
8. Не используй legacy `figma_*` инструменты и не перескакивай в buffer/manual режим.
9. Не используй HTML-теги и inline styles. Только допустимый Figma JSX.
10. Используй только реальные artifact ids из runtime context.
11. Каждый node в `compositionNodes` должен иметь `kind`.
12. Для текста используй поле `text`, а не `content`.
13. Не используй raw DOM nodes вроде `div`, `section`, `button`.

Минимальный пример `figma.compose.meta`:

```json
{
  "tool": "figma.compose.meta",
  "args": {
    "tokensArtifactId": "tokens_food_delivery_v1",
    "primitivesArtifactId": "primitives_food_delivery_v1",
    "primitivesJsxArtifactId": "primitives_food_delivery_jsx_v1",
    "screenName": "Home",
    "compositionNodes": [
      {
        "kind": "element",
        "type": "Screen",
        "props": {
          "name": "Home",
          "className": "bg-page"
        },
        "children": [
          {
            "kind": "primitive",
            "primitive": "HeroBanner",
            "props": {
              "title": "Hot shawarma in 20 minutes",
              "subtitle": "Order now"
            }
          }
        ]
      }
    ]
  }
}
```

Анти-пример, который запрещён:

```json
{
  "tool": "figma.compose.meta",
  "args": {
    "tokensArtifactId": "tokens_custom_v1",
    "primitivesArtifactId": "primitives_plan_v1",
    "compositionNodes": [
      {
        "type": "div",
        "props": { "style": { "display": "flex" } },
        "content": "Wrong"
      }
    ]
  }
}
```
