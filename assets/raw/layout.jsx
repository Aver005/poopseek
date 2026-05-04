<Screen key="Root" name="Shawarma Royal - Landing Page">
  <NavBar key="NavBar1" name="Navigation Bar" className="bg-surface border-b border-border px-6 py-4 flex justify-between items-center">
    <HStack key="LogoStack" name="Logo Group" className="items-center gap-2">
      <Text key="LogoIcon" name="Logo Icon" className="text-3xl">🥙</Text>
      <Text key="LogoText" name="Logo Text" className="text-2xl font-bold text-accent">Shawarma Royal</Text>
    </HStack>
    <HStack key="NavLinks" name="Nav Links" className="items-center gap-6">
      <Text key="NavMenu" name="Menu Link" className="text-base font-semibold text-text">Menu</Text>
      <Text key="NavLocations" name="Locations Link" className="text-base font-semibold text-text">Locations</Text>
      <Button key="NavCTA" name="Order Button" className="bg-accent text-white px-5 py-2 rounded-full font-semibold">Shawarma Time! 🕺</Button>
    </HStack>
  </NavBar>

  <Frame key="HeroSection" name="Hero Section" className="bg-gradient-to-br from-yellow-300 via-amber-300 to-orange-400 px-8 py-16 flex justify-between items-center overflow-hidden">
    <VStack key="HeroContent" name="Hero Text Content" className="flex-1 items-start gap-4">
      <Hero key="HeroTitle" name="Main Title" className="text-text font-bold leading-tight">
        You've Met Your Match — 😉
        <Text key="HeroAccent" name="Accent Text" className="text-accent bg-white/30 px-3 py-1 rounded-2xl inline-block">Shawarma Royal!</Text>
      </Hero>
      <HStack key="HeroTagline" name="Tagline" className="items-center gap-3">
        <Text key="CrunchyText" name="Crunchy AF Badge" className="bg-surface px-4 py-2 rounded-full shadow-md text-2xl font-semibold text-text-secondary">Crunchy AF</Text>
        <Text key="CommentEmoji" name="Comment Emoji" className="text-4xl">💬</Text>
      </HStack>
      <Frame key="SpeechBubble" name="Speech Bubble" className="relative bg-surface px-6 py-3 rounded-2xl shadow-lg inline-flex items-center gap-2 mt-2">
        <Text key="GarlicText" name="Garlic Sauce Text" className="text-xl font-bold text-text">🧄 Garlic Sauce Upgrade</Text>
        <Text key="SparkleEmoji" name="Sparkle Emoji" className="text-2xl">✨</Text>
      </Frame>
    </VStack>
    <VStack key="HeroVisual" name="Hero Shawarma Visual" className="items-center">
      <Text key="ShawarmaEmoji" name="Shawarma Emoji" className="text-[180px] leading-none drop-shadow-2xl">🥙</Text>
      <Text key="WinkEmoji" name="Wink Emoji" className="text-7xl -mt-16 -mr-12">😉</Text>
      <Text key="FlameEmoji" name="Flame Emoji" className="text-6xl -mt-10 -ml-12">🔥</Text>
      <Text key="RoyalCrunchText" name="Royal Crunch Label" className="bg-accent/80 px-4 py-1 rounded-full text-2xl font-bold text-white mt-2">royal crunch</Text>
    </VStack>
  </Frame>

  <Frame key="CardsSection" name="Cards Section" className="px-8 py-16">
    <VStack key="SectionHeader" name="Section Header" className="items-center gap-2 mb-12">
      <H2 key="SectionTitle" name="Section Title" className="text-4xl font-bold text-text text-center">Pick Your Shawarma Soulmate</H2>
      <HStack key="Subtitle" name="Subtitle with Emoji" className="items-center gap-2">
        <Text key="PunsText" name="Puns Text" className="text-xl text-text-secondary">😂 silly puns included</Text>
        <Text key="BurritoEmoji" name="Burrito Emoji" className="text-3xl">🌯</Text>
      </HStack>
    </VStack>

    <HStack key="CardsGrid" name="Cards Grid" className="justify-center gap-8 flex-wrap">
      <Card key="ClassicCard" name="Classic Shawarma Card" className="bg-surface rounded-3xl p-8 w-80 border-2 border-border shadow-xl items-center text-center">
        <Frame key="ClassicIcon" name="Classic Icon" className="w-28 h-28 bg-yellow-100 rounded-full items-center justify-center mb-5">
          <Text key="ClassicEmoji" name="Classic Emoji" className="text-6xl">🥙</Text>
        </Frame>
        <H3 key="ClassicTitle" name="Classic Title" className="text-3xl font-bold text-text">Classic</H3>
        <Body key="ClassicSubtitle" name="Classic Subtitle" className="text-text-secondary italic mt-2">"Wrap star of the show"</Body>
        <Caption key="ClassicIngredients" name="Classic Ingredients" className="text-gray-500 mt-2">Chicken, pickles, garlic magic</Caption>
        <Text key="ClassicPrice" name="Classic Price" className="text-accent font-bold text-2xl mt-5">€7.90</Text>
        <Button key="ClassicButton" name="Classic Order Button" className="bg-primary text-white px-6 py-3 rounded-full font-bold text-lg mt-4">Add to order</Button>
      </Card>

      <Card key="SpicyCard" name="Spicy Shawarma Card" className="bg-surface rounded-3xl p-8 w-80 border-2 border-border shadow-xl items-center text-center">
        <Frame key="SpicyIcon" name="Spicy Icon" className="w-28 h-28 bg-red-100 rounded-full items-center justify-center mb-5">
          <Text key="SpicyEmoji" name="Spicy Emoji" className="text-6xl">🌶️</Text>
        </Frame>
        <H3 key="SpicyTitle" name="Spicy Title" className="text-3xl font-bold text-text">Spicy</H3>
        <Body key="SpicySubtitle" name="Spicy Subtitle" className="text-text-secondary italic mt-2">"Feel the burn, baby"</Body>
        <Caption key="SpicyIngredients" name="Spicy Ingredients" className="text-gray-500 mt-2">Harissa chicken, jalapeños</Caption>
        <Text key="SpicyPrice" name="Spicy Price" className="text-accent font-bold text-2xl mt-5">€8.50</Text>
        <Button key="SpicyButton" name="Spicy Order Button" className="bg-primary text-white px-6 py-3 rounded-full font-bold text-lg mt-4">Fire it up</Button>
      </Card>

      <Card key="VeganCard" name="Vegan Shawarma Card" className="bg-surface rounded-3xl p-8 w-80 border-2 border-border shadow-xl items-center text-center">
        <Frame key="VeganIcon" name="Vegan Icon" className="w-28 h-28 bg-green-100 rounded-full items-center justify-center mb-5">
          <Text key="VeganEmoji" name="Vegan Emoji" className="text-6xl">🥬</Text>
        </Frame>
        <H3 key="VeganTitle" name="Vegan Title" className="text-3xl font-bold text-text">Vegan</H3>
        <Body key="VeganSubtitle" name="Vegan Subtitle" className="text-text-secondary italic mt-2">"Peas, love & hummus"</Body>
        <Caption key="VeganIngredients" name="Vegan Ingredients" className="text-gray-500 mt-2">Falafel, grilled veg, tahini</Caption>
        <Text key="VeganPrice" name="Vegan Price" className="text-accent font-bold text-2xl mt-5">€8.90</Text>
        <Button key="VeganButton" name="Vegan Order Button" className="bg-primary text-white px-6 py-3 rounded-full font-bold text-lg mt-4">Go green</Button>
      </Card>
    </HStack>
  </Frame>

  <Frame key="GlobalCTASection" name="Global CTA Section" className="px-8 py-12 flex justify-center">
    <Button key="GlobalOrderButton" name="Global Order Button" className="bg-primary text-white font-extrabold text-2xl px-12 py-5 rounded-full border-4 border-yellow-300 items-center gap-3">
      <Text key="CTAText" name="CTA Text">⚡ ORDER NOW – SHAWARMA TIME</Text>
      <Text key="CTAEmoji" name="CTA Emoji" className="text-4xl">🥙</Text>
    </Button>
  </Frame>

  <Frame key="Footer" name="Footer" className="bg-surface border-t-4 border-border px-8 py-6 rounded-t-3xl">
    <HStack key="FooterContent" name="Footer Content" className="justify-between items-center flex-wrap gap-4">
      <HStack key="Address" name="Address Section" className="items-center gap-2">
        <Text key="AddressText" name="Address Text" className="text-lg font-semibold text-text">📍 42 Shawarma Lane, Crunch City</Text>
        <Text key="MapEmoji" name="Map Emoji" className="text-2xl">🗺️</Text>
      </HStack>
      <HStack key="SocialIcons" name="Social Icons" className="gap-4">
        <Frame key="InstagramIcon" name="Instagram Icon" className="bg-yellow-100 p-2 rounded-full">
          <Text key="InstagramEmoji" name="Instagram Emoji" className="text-2xl">📸</Text>
        </Frame>
        <Frame key="TwitterIcon" name="Twitter Icon" className="bg-yellow-100 p-2 rounded-full">
          <Text key="TwitterEmoji" name="Twitter Emoji" className="text-2xl">🐦</Text>
        </Frame>
        <Frame key="PhoneIcon" name="Phone Icon" className="bg-yellow-100 p-2 rounded-full">
          <Text key="PhoneEmoji" name="Phone Emoji" className="text-2xl">📱</Text>
        </Frame>
      </HStack>
      <HStack key="Copyright" name="Copyright Section" className="items-center gap-2">
        <Text key="CopyrightText" name="Copyright Text" className="text-text-secondary font-medium">© 2025 Shawarma Royal</Text>
        <Text key="CrownEmoji" name="Crown Emoji" className="text-xl">👑</Text>
        <Badge key="GarlicBadge" name="Garlic Badge" className="bg-accent/20 px-3 py-1 rounded-full text-sm">100% garlicky</Badge>
      </HStack>
    </HStack>
  </Frame>

  <Frame key="FloatingGarlic" name="Floating Garlic Element" className="fixed bottom-6 right-6">
    <Text key="GarlicEmoji" name="Garlic Emoji" className="text-5xl opacity-80">🧄</Text>
  </Frame>
</Screen>