<Screen key="Root" name="Shawarma Royal Home" className="bg-background">
  <VStack key="Page" name="Full Page" className="w-full gap-0">
    
    {/* Sticky Header */}
    <NavBar key="StickyHeader" name="Sticky Header" className="bg-surface shadow-md border-b border-border sticky top-0 z-10">
      <HStack key="HeaderContent" name="Header Content" className="w-full justify-between items-center px-6 py-4">
        <HStack key="LogoArea" name="Logo Area" className="gap-2 items-center">
          <Icon key="LogoIcon" name="Shawarma Icon" className="w-10 h-10 bg-accent rounded-full" />
          <H2 key="LogoText" name="Logo" className="text-primary font-bold tracking-tight">Shawarma Royal</H2>
        </HStack>
        <HStack key="NavLinks" name="Navigation" className="gap-8">
          <Text key="NavMenu" name="Menu Link" className="text-text font-semibold text-lg">Menu</Text>
          <Text key="NavLocations" name="Locations Link" className="text-text font-semibold text-lg">Locations</Text>
          <Button key="NavCta" name="Shawarma Time Button" className="bg-primary rounded-lg px-6 py-2">
            <Text key="CtaText" name="Button Text" className="text-white font-bold">Shawarma Time! ⏰</Text>
          </Button>
        </HStack>
      </HStack>
    </NavBar>

    {/* Hero Section with Gradient Background */}
    <VStack key="HeroSection" name="Hero Section" className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 items-center justify-center py-20 px-6">
      <HStack key="HeroContent" name="Hero Content" className="items-center justify-between max-w-screen-xl w-full gap-12 flex-wrap">
        <VStack key="HeroTextArea" name="Text Area" className="gap-4 flex-1">
          <Hero key="HeroTitle" name="Main Headline" className="text-white font-bold tracking-tight leading-tight">
            You've Met Your Match — Shawarma Royal!
          </Hero>
          <Body key="HeroSubtitle" name="Subtitle" className="text-white text-xl font-medium">
            🥙 Wrapped with love, grilled to perfection, and sauced like a dream.
          </Body>
          <Button key="HeroButton" name="Order Now Bouncing" className="bg-primary rounded-lg px-8 py-3 mt-4 shadow-lg">
            <Text key="HeroButtonText" name="Button Label" className="text-white font-bold text-lg">🤤 Order Now — It's SHWARMY Time!</Text>
          </Button>
        </VStack>
        <VStack key="HeroIllustration" name="Winking Shawarma" className="items-center justify-center flex-1">
          <Icon key="ShawarmaIcon" name="Winking Shawarma" className="w-64 h-64 bg-surface rounded-full shadow-xl items-center justify-center">
            <Text key="WinkEmoji" name="Wink Face" className="text-8xl">😉🌯</Text>
          </Icon>
          <HStack key="SpeechBubbles" name="Floating Quotes" className="gap-4 mt-4">
            <Card key="Bubble1" name="Crunchy AF Bubble" className="bg-surface rounded-full px-4 py-2 shadow-md">
              <Text key="CrunchyText" name="Crunchy AF" className="text-accent font-bold">Crunchy AF 🔊</Text>
            </Card>
            <Card key="Bubble2" name="Garlic Sauce Bubble" className="bg-surface rounded-full px-4 py-2 shadow-md">
              <Text key="GarlicText" name="Garlic Sauce" className="text-primary font-bold">🧄 Garlic Sauce Upgrade 🧄</Text>
            </Card>
          </HStack>
        </VStack>
      </HStack>
    </VStack>

    {/* Cards Section */}
    <VStack key="CardsSection" name="Menu Cards" className="w-full px-6 py-16 bg-background items-center">
      <VStack key="CardsContainer" name="Responsive Grid" className="max-w-screen-xl w-full gap-12">
        <H2 key="SectionTitle" name="Choose Your Fighter" className="text-text font-bold text-center">🔥 Roll with the Best 🔥</H2>
        
        {/* Row of 3 Cards - Written Manually */}
        <HStack key="CardsRowDesktop" name="Desktop Row" className="gap-6 justify-center flex-wrap">
          
          {/* Card 1: Classic */}
          <Card key="CardClassic" name="Classic Card" className="bg-surface rounded-xl shadow-lg border border-border w-80 overflow-hidden hover-scale">
            <VStack key="ClassicContent" name="Classic Content" className="items-center p-6 gap-4">
              <Icon key="ClassicIcon" name="Classic Shawarma" className="w-32 h-32 bg-accent rounded-full items-center justify-center">
                <Text key="ClassicEmoji" name="Classic Emoji" className="text-5xl">🌯</Text>
              </Icon>
              <VStack key="ClassicText" name="Text Area" className="items-center gap-2">
                <H3 key="ClassicTitle" name="Classic" className="text-text font-bold text-2xl">Classic</H3>
                <Caption key="ClassicPun" name="Pun Subtitle" className="text-text-secondary font-medium text-center">"I'm kind of a big dill" 🥒</Caption>
                <Body key="ClassicDesc" name="Description" className="text-text text-center">Garlic sauce, pickles, fries wrapped in perfection.</Body>
              </VStack>
              <Button key="ClassicOrder" name="Order Classic" className="bg-primary rounded-lg w-full py-3">
                <Text key="ClassicOrderText" name="Button" className="text-white font-bold">I WANT THIS! 🍗</Text>
              </Button>
            </VStack>
          </Card>

          {/* Card 2: Spicy */}
          <Card key="CardSpicy" name="Spicy Card" className="bg-surface rounded-xl shadow-lg border border-border w-80 overflow-hidden">
            <VStack key="SpicyContent" name="Spicy Content" className="items-center p-6 gap-4">
              <Icon key="SpicyIcon" name="Spicy Shawarma" className="w-32 h-32 bg-accent rounded-full items-center justify-center">
                <Text key="SpicyEmoji" name="Spicy Emoji" className="text-5xl">🌶️🔥</Text>
              </Icon>
              <VStack key="SpicyText" name="Text Area" className="items-center gap-2">
                <H3 key="SpicyTitle" name="Spicy" className="text-text font-bold text-2xl">Spicy</H3>
                <Caption key="SpicyPun" name="Pun Subtitle" className="text-text-secondary font-medium text-center">"Let's get smashed!" 🍺</Caption>
                <Body key="SpicyDesc" name="Description" className="text-text text-center">Sriracha, jalapeños, and a kick that slaps back.</Body>
              </VStack>
              <Button key="SpicyOrder" name="Order Spicy" className="bg-primary rounded-lg w-full py-3">
                <Text key="SpicyOrderText" name="Button" className="text-white font-bold">FEEL THE BURN! 🔥</Text>
              </Button>
            </VStack>
          </Card>

          {/* Card 3: Vegan */}
          <Card key="CardVegan" name="Vegan Card" className="bg-surface rounded-xl shadow-lg border border-border w-80 overflow-hidden">
            <VStack key="VeganContent" name="Vegan Content" className="items-center p-6 gap-4">
              <Icon key="VeganIcon" name="Vegan Shawarma" className="w-32 h-32 bg-accent rounded-full items-center justify-center">
                <Text key="VeganEmoji" name="Vegan Emoji" className="text-5xl">🌱🥙</Text>
              </Icon>
              <VStack key="VeganText" name="Text Area" className="items-center gap-2">
                <H3 key="VeganTitle" name="Vegan" className="text-text font-bold text-2xl">Vegan</H3>
                <Caption key="VeganPun" name="Pun Subtitle" className="text-text-secondary font-medium text-center">"Lettuce celebrate!" 🎉</Caption>
                <Body key="VeganDesc" name="Description" className="text-text text-center">Falafel, tahini, fresh mint. No animals harmed.</Body>
              </VStack>
              <Button key="VeganOrder" name="Order Vegan" className="bg-primary rounded-lg w-full py-3">
                <Text key="VeganOrderText" name="Button" className="text-white font-bold">GO GREEN! 💚</Text>
              </Button>
            </VStack>
          </Card>
        </HStack>

        {/* Tablet & Mobile Note: The HStack flex-wrap handles 2 cols on tablet, 1 on mobile */}
      </VStack>
    </VStack>

    {/* Footer */}
    <Divider key="FooterDivider" name="Line" className="border-border" />
    <HStack key="Footer" name="Footer" className="justify-between items-center px-6 py-8 bg-surface flex-wrap gap-4">
      <Text key="FooterCopy" name="Copyright" className="text-text-secondary">© 2024 Shawarma Royal — Good Vibes, Great Wraps</Text>
      <HStack key="FooterEmojis" name="Emoji Row" className="gap-2">
        <Text key="Emoji1" name="Happy" className="text-2xl">😋</Text>
        <Text key="Emoji2" name="Shawarma" className="text-2xl">🌯</Text>
        <Text key="Emoji3" name="Garlic" className="text-2xl">🧄</Text>
      </HStack>
    </HStack>

  </VStack>
</Screen>