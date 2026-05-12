<Frame width={1440} height="hug" fill="background" autoLayout flow="vertical" name="BikeRentLandingPage">
  
  {/* Header */}
  <Frame autoLayout flow="horizontal" width="fill" height="hug" padX="xl" padY="md" alignX="between" alignY="center" fill="background" name="Header">
    <Text variant="h3" fill="accent" name="Logo">BikeRent</Text>
    <Frame autoLayout flow="horizontal" gap="xl" alignY="center" name="Navigation">
      <Text variant="body" fill="text">Велосипеды</Text>
      <Text variant="body" fill="text">Цены</Text>
      <Text variant="body" fill="text">Контакты</Text>
      <Frame as="button-primary" padX="lg" padY="sm" fill="primary" radius="md" name="LoginButton">
        <Text variant="button" fill="background">Войти как ученик</Text>
      </Frame>
    </Frame>
  </Frame>

  {/* Hero */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="2xl" fill="surface" gap="lg" name="Hero" radius="0 0 lg lg" clip>
    <Frame autoLayout flow="vertical" gap="sm" width="fill" alignX="center" name="HeroContent">
      <Text variant="display" fill="accent" alignX="center">Бери велосипед после уроков</Text>
      <Text variant="body-lg" fill="text-secondary" alignX="center">Катайся после школы — плати поминутно. От 50 ₽/час</Text>
      <Frame as="button-primary" padX="xl" padY="md" fill="primary" radius="md" name="HeroButton" margin={{top: "md"}}>
        <Text variant="button" fill="background">Выбрать велосипед</Text>
      </Frame>
    </Frame>
    <Image src="https://placehold.co/1200x400/F5F7FA/475569?text=%F0%9F%9A%B2+%D0%9F%D0%BE%D0%B4%D1%80%D0%BE%D1%81%D1%82%D0%BE%D0%BA+%D0%BD%D0%B0+%D0%B2%D0%B5%D0%BB%D0%BE%D1%81%D0%B8%D0%BF%D0%B5%D0%B4%D0%B5" width="fill" height={400} radius="lg" name="HeroImage" />
  </Frame>

  {/* Каталог велосипедов */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="2xl" gap="xl" name="CatalogSection">
    <Text variant="h1" fill="accent" alignX="center">Выбери свой стиль</Text>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap="md" name="BikeGrid">
      
      {/* Карточка 1 - Городской */}
      <Frame as="card" autoLayout flow="vertical" width="fill" height="hug" pad="md" gap="md" fill="background" radius="md" shadow="card" name="BikeCard_Urban">
        <Rect width="fill" height={200} fill="surface-soft" radius="md" name="BikeImagePlaceholder" />
        <Text variant="h2" fill="text" name="BikeTitle_Urban">Городской</Text>
        <Frame autoLayout flow="vertical" gap="xs" name="BikeFeatures">
          <Text variant="body-sm" fill="text-secondary">7 скоростей</Text>
          <Text variant="body-sm" fill="text-secondary">Удобное седло</Text>
          <Text variant="body-sm" fill="text-secondary">Корзина спереди</Text>
        </Frame>
        <Frame autoLayout flow="horizontal" gap="md" alignX="between" alignY="center" name="Pricing">
          <Frame autoLayout flow="vertical" gap="xs" name="PriceDetails">
            <Text variant="mono" fill="primary" name="PriceHour">50 ₽/час</Text>
            <Text variant="caption" fill="text-muted" name="PriceDay">250 ₽/день</Text>
          </Frame>
          <Frame as="button-primary" padX="md" padY="sm" fill="primary" radius="md" name="BookButton">
            <Text variant="button" fill="background">Забронировать</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Карточка 2 - Горный */}
      <Frame as="card" autoLayout flow="vertical" width="fill" height="hug" pad="md" gap="md" fill="background" radius="md" shadow="card" name="BikeCard_Mountain">
        <Rect width="fill" height={200} fill="surface-soft" radius="md" name="BikeImagePlaceholder" />
        <Text variant="h2" fill="text" name="BikeTitle_Mountain">Горный</Text>
        <Frame autoLayout flow="vertical" gap="xs" name="BikeFeatures">
          <Text variant="body-sm" fill="text-secondary">Амортизация</Text>
          <Text variant="body-sm" fill="text-secondary">21 скорость</Text>
          <Text variant="body-sm" fill="text-secondary">Дисковые тормоза</Text>
        </Frame>
        <Frame autoLayout flow="horizontal" gap="md" alignX="between" alignY="center" name="Pricing">
          <Frame autoLayout flow="vertical" gap="xs" name="PriceDetails">
            <Text variant="mono" fill="primary" name="PriceHour">70 ₽/час</Text>
            <Text variant="caption" fill="text-muted" name="PriceDay">350 ₽/день</Text>
          </Frame>
          <Frame as="button-primary" padX="md" padY="sm" fill="primary" radius="md" name="BookButton">
            <Text variant="button" fill="background">Забронировать</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Карточка 3 - BMX */}
      <Frame as="card" autoLayout flow="vertical" width="fill" height="hug" pad="md" gap="md" fill="background" radius="md" shadow="card" name="BikeCard_BMX">
        <Rect width="fill" height={200} fill="surface-soft" radius="md" name="BikeImagePlaceholder" />
        <Text variant="h2" fill="text" name="BikeTitle_BMX">BMX</Text>
        <Frame autoLayout flow="vertical" gap="xs" name="BikeFeatures">
          <Text variant="body-sm" fill="text-secondary">Для трюков</Text>
          <Text variant="body-sm" fill="text-secondary">Лёгкая рама</Text>
          <Text variant="body-sm" fill="text-secondary">Пеги в подарок</Text>
        </Frame>
        <Frame autoLayout flow="horizontal" gap="md" alignX="between" alignY="center" name="Pricing">
          <Frame autoLayout flow="vertical" gap="xs" name="PriceDetails">
            <Text variant="mono" fill="primary" name="PriceHour">60 ₽/час</Text>
            <Text variant="caption" fill="text-muted" name="PriceDay">300 ₽/день</Text>
          </Frame>
          <Frame as="button-primary" padX="md" padY="sm" fill="primary" radius="md" name="BookButton">
            <Text variant="button" fill="background">Забронировать</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  </Frame>

  {/* Как это работает */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="2xl" gap="xl" fill="surface" name="HowItWorks">
    <Text variant="h1" fill="accent" alignX="center">Как это работает</Text>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap="xl" name="StepsGrid">
      
      {/* Шаг 1 */}
      <Frame as="card" autoLayout flow="vertical" width="fill" height="hug" pad="lg" gap="sm" fill="background" radius="lg" alignX="center" name="Step1">
        <Ellipse size={64} fill="primary-soft" name="StepIcon1" />
        <Text variant="h3" fill="primary" name="StepNumber">1</Text>
        <Text variant="h2" fill="text" alignX="center">Выбери</Text>
        <Text variant="body" fill="text-secondary" alignX="center">Найди велосипед на карте рядом со школой</Text>
      </Frame>

      {/* Шаг 2 */}
      <Frame as="card" autoLayout flow="vertical" width="fill" height="hug" pad="lg" gap="sm" fill="background" radius="lg" alignX="center" name="Step2">
        <Ellipse size={64} fill="primary-soft" name="StepIcon2" />
        <Text variant="h3" fill="primary" name="StepNumber">2</Text>
        <Text variant="h2" fill="text" alignX="center">Забронируй</Text>
        <Text variant="body" fill="text-secondary" alignX="center">Оплати время в приложении и получи код</Text>
      </Frame>

      {/* Шаг 3 */}
      <Frame as="card" autoLayout flow="vertical" width="fill" height="hug" pad="lg" gap="sm" fill="background" radius="lg" alignX="center" name="Step3">
        <Ellipse size={64} fill="primary-soft" name="StepIcon3" />
        <Text variant="h3" fill="primary" name="StepNumber">3</Text>
        <Text variant="h2" fill="text" alignX="center">Катайся</Text>
        <Text variant="body" fill="text-secondary" alignX="center">Открой замок кодом и в путь!</Text>
      </Frame>
    </Frame>
  </Frame>

  {/* Цены и пакеты */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="2xl" gap="xl" name="PricingSection">
    <Text variant="h1" fill="accent" alignX="center">Честные цены для учеников</Text>
    <Text variant="body-lg" fill="text-secondary" alignX="center">Только для 7–11 классов. Никаких скрытых платежей</Text>
    
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap="md" name="PackagesGrid">
      
      {/* Пакет 1 час */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" pad="lg" gap="md" fill="background" radius="md" shadow="card" name="PackageHour">
        <Text variant="h2" fill="primary" alignX="center">1 час</Text>
        <Text variant="display" fill="accent" alignX="center">50 ₽</Text>
        <Line length="fill" stroke="border" strokeWidth={1} name="Divider" />
        <Frame autoLayout flow="vertical" gap="md" name="FeaturesList">
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Страховка</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Замок в комплекте</Text>
          </Frame>
          <Text variant="caption" fill="text-muted" alignX="center">Без шлема</Text>
        </Frame>
      </Frame>

      {/* Пакет 4 часа */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" pad="lg" gap="md" fill="background" radius="md" shadow="card" name="PackageFourHours">
        <Text variant="h2" fill="primary" alignX="center">4 часа</Text>
        <Text variant="display" fill="accent" alignX="center">180 ₽</Text>
        <Line length="fill" stroke="border" strokeWidth={1} name="Divider" />
        <Frame autoLayout flow="vertical" gap="md" name="FeaturesList">
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Страховка</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Замок в комплекте</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Шлем бесплатно</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Пакет День */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" pad="lg" gap="md" fill="background" radius="md" shadow="card" name="PackageDay">
        <Text variant="h2" fill="primary" alignX="center">День</Text>
        <Text variant="display" fill="accent" alignX="center">250 ₽</Text>
        <Line length="fill" stroke="border" strokeWidth={1} name="Divider" />
        <Frame autoLayout flow="vertical" gap="md" name="FeaturesList">
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Страховка</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Замок в комплекте</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap="sm" alignY="center">
            <Image src="https://api.iconify.design/lucide/check-circle.svg?color=%2310b981" width={20} height={20} />
            <Text variant="body" fill="text">Шлем бесплатно</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  </Frame>

  {/* Footer */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="lg" gap="lg" fill="accent" name="Footer">
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" name="FooterContent">
      <Frame autoLayout flow="vertical" gap="sm" name="FooterInfo">
        <Text variant="h3" fill="background">BikeRent</Text>
        <Text variant="caption" fill="text-muted">Правила аренды</Text>
        <Text variant="caption" fill="text-muted">Политика конфиденциальности</Text>
      </Frame>
      
      <Frame autoLayout flow="vertical" gap="sm" name="FooterContacts">
        <Text variant="body" fill="background">Часы работы: 08:00 - 20:00</Text>
        <Text variant="body" fill="background">Телефон: +7 (495) 123-45-67</Text>
        <Frame autoLayout flow="horizontal" gap="md" name="SocialIcons">
          <Image src="https://thesvg.org/icons/telegram/default.svg" width={24} height={24} name="TelegramIcon" />
          <Image src="https://thesvg.org/icons/whatsapp/default.svg" width={24} height={24} name="WhatsappIcon" />
          <Image src="https://thesvg.org/icons/discord/default.svg" width={24} height={24} name="DiscordIcon" />
        </Frame>
      </Frame>
      
      <Frame autoLayout flow="vertical" gap="md" name="FooterAction">
        <Text variant="body" fill="background">Уже учишься в школе?</Text>
        <Frame as="button-primary" padX="lg" padY="sm" fill="primary" radius="md" name="FooterLoginButton">
          <Text variant="button" fill="background">Войти как ученик</Text>
        </Frame>
      </Frame>
    </Frame>
    <Line length="fill" stroke="border" strokeWidth={1} name="FooterDivider" />
    <Text variant="caption" fill="text-muted" alignX="center">© 2025 BikeRent for Students</Text>
  </Frame>

</Frame>