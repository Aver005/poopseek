<Screen>
  <NavBar 
    title="SHAURMA HUB"
    rightIcon="user"
  />
  
  <VStack className="flex flex-col w-full bg-canvas">
    {/* Hero секция с акцентной карточкой и CTA */}
    <Card className="flex flex-col w-full rounded-2xl shadow bg-brand p-6 gap-4">
      <Image 
        src="hero-shawarma.jpg"
        className="w-full rounded-xl"
      />
      <VStack className="flex flex-col w-full gap-2">
        <Hero className="text-on-brand">
          Твоя шаурма на вес золота
        </Hero>
        <Body className="text-on-brand">
          Сочное мясо, свежие овощи и фирменный соус за 5 минут
        </Body>
        <Button 
          label="Заказать сейчас →"
          className="bg-canvas text-brand rounded-xl p-4 mt-2"
        />
      </VStack>
    </Card>

    {/* Horizontal List: топ-позиций */}
    <VStack className="flex flex-col w-full gap-3 px-6 py-4">
      <H2 className="text-text">🔥 Хиты недели</H2>
      <HStack className="flex w-full gap-4 justify-between">
        <Card className="flex flex-col w-full gap-2 p-4 rounded-xl shadow bg-canvas items-center">
          <Image src="classic.jpg" className="w-full rounded-xl" />
          <H3 className="text-text">Классическая</H3>
          <Label className="text-muted">курица, фирменный соус</Label>
          <Badge label="Хит" className="bg-brand text-on-brand rounded-full px-3 py-1" />
        </Card>
        <Card className="flex flex-col w-full gap-2 p-4 rounded-xl shadow bg-canvas items-center">
          <Image src="spicy.jpg" className="w-full rounded-xl" />
          <H3 className="text-text">Острая</H3>
          <Label className="text-muted">соус чили, маринованный лук</Label>
          <Badge label="Огонь" className="bg-brand text-on-brand rounded-full px-3 py-1" />
        </Card>
      </HStack>
    </VStack>

    {/* Feature Row с иконками и преимуществами */}
    <Card className="flex flex-col w-full bg-canvas p-6 gap-4 mt-2 rounded-2xl shadow-md">
      <H2 className="text-text text-center">Почему мы?</H2>
      <VStack className="flex flex-col w-full gap-4">
        <HStack className="flex w-full gap-4 items-center justify-between">
          <Icon name="zap" className="text-brand" />
          <Body className="text-text">Готовим 5–7 минут</Body>
        </HStack>
        <HStack className="flex w-full gap-4 items-center justify-between">
          <Icon name="leaf" className="text-brand" />
          <Body className="text-text">Своя выпечка и соусы</Body>
        </HStack>
        <HStack className="flex w-full gap-4 items-center justify-between">
          <Icon name="star" className="text-brand" />
          <Body className="text-text">4.9 на доставках</Body>
        </HStack>
      </VStack>
    </Card>

    {/* CTA / отзыв / акцентный блок */}
    <Card className="flex flex-col w-full bg-brand p-6 gap-3 rounded-2xl shadow items-center mt-4">
      <Avatar src="reviewer.jpg" className="rounded-full" />
      <VStack className="flex flex-col w-full gap-2 items-center">
        <Caption className="text-on-brand">★ 5,0 — Антон</Caption>
        <Text className="text-on-brand text-center">
          “Лучшая шаурма в городе. Сочно, чисто, быстро. Советую!”
        </Text>
        <Button 
          label="Смотреть все отзывы"
          className="border border-on-brand text-on-brand rounded-xl p-3 mt-2"
        />
      </VStack>
    </Card>
  </VStack>

  <TabBar 
    items={["Главная", "Меню", "Корзина", "Профиль"]}
    activeIndex={0}
  />
</Screen>