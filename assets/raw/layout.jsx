<Frame width={1440} height={900} fill="#111111" name="CinemaWebsite">
  <Frame autoLayout flow="vertical" width="fill" height="fill" name="MainContent">
    <Frame autoLayout flow="horizontal" width="fill" height={72} fill="#111111" padX={40} padY={16} gap={32} alignY="center" name="Navbar">
      <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} alignY="center" name="Logo">
        <Ellipse width={32} height={32} fill="#F59E0B" name="LogoIcon" />
        <Frame width={24} height={24} fill="none" stroke="#F59E0B" strokeWidth={2} radius={4} name="FilmIcon" />
        <Text fill="#F3F4F6" fontSize={20} fontWeight="bold" letterSpacing={1}>CINEMA</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={32} alignY="center" name="NavLinks">
        <Text fill="#F3F4F6" fontSize={16} fontWeight="medium">Now Showing</Text>
        <Text fill="#9CA3AF" fontSize={16} fontWeight="regular">Coming Soon</Text>
        <Text fill="#9CA3AF" fontSize={16} fontWeight="regular">Tickets</Text>
        <Text fill="#9CA3AF" fontSize={16} fontWeight="regular">Concessions</Text>
      </Frame>
      <Frame width="fill" height="hug" name="Spacer" />
      <Frame width={24} height={24} fill="none" stroke="#F3F4F6" strokeWidth={2} radius={4} name="SearchIcon" />
    </Frame>

    <Frame autoLayout flow="vertical" width="fill" height={500} fill="#111111" clip={true} name="HeroSection">
      <Frame width="fill" height="fill" fill="#1A1A1A" name="HeroBackground" />
      <Frame ignoreAutoLayout x={80} y={80} width={600} height="hug" autoLayout flow="vertical" gap={24} name="HeroContent">
        <Frame width={120} height={4} fill="#F59E0B" radius={2} name="GlowLine" dropShadow="0:0:12:#F59E0B:0.6" />
        <Text fill="#F3F4F6" fontSize={64} fontWeight="bold" letterSpacing={-1}>DUNE: PART TWO</Text>
        <Text fill="#9CA3AF" fontSize={20} lineHeight={32}>The epic conclusion arrives. Witness the fall.</Text>
        <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={16} name="ButtonGroup">
          <Frame autoLayout flow="horizontal" width="hug" height={56} fill="#F59E0B" radius={8} padX={32} padY={16} alignY="center" name="BuyButton" shadow="button" dropShadow="0:0:20:#F59E0B:0.4">
            <Text fill="#111111" fontSize={18} fontWeight="bold">BUY TICKET</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" width="hug" height={56} fill="none" stroke="#F59E0B" strokeWidth={2} radius={8} padX={32} padY={16} alignY="center" name="TrailerButton">
            <Text fill="#F3F4F6" fontSize={18} fontWeight="medium">▶ TRAILER</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>

    <Frame autoLayout flow="vertical" width="fill" height="hug" padX={80} padY={48} gap={32} name="NowShowingSection">
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" name="SectionHeader">
        <Text fill="#F3F4F6" fontSize={28} fontWeight="bold">NOW SHOWING</Text>
        <Text fill="#F59E0B" fontSize={16} fontWeight="medium">VIEW ALL →</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={24} name="MovieRow">
        <Frame autoLayout flow="vertical" width={220} height={380} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="MovieCard1" dropShadow="0:8:24:#000000:0.3">
          <Image src="poster1.jpg" width="fill" height={280} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={16} padY={16} gap={12} name="CardContent">
            <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" name="TitleRow">
              <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">GLADIATOR II</Text>
              <Frame width={40} height={24} fill="#991B1B" radius={4} alignY="center" name="RatingBadge">
                <Text fill="#F3F4F6" fontSize={12} fontWeight="bold">16+</Text>
              </Frame>
            </Frame>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} alignY="center" name="TrailerIcon">
              <Ellipse width={28} height={28} fill="#F59E0B" opacity={0.9} name="PlayCircle" />
              <Text fill="#9CA3AF" fontSize={12}>Trailer</Text>
            </Frame>
          </Frame>
        </Frame>
        <Frame autoLayout flow="vertical" width={220} height={380} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="MovieCard2" dropShadow="0:8:24:#000000:0.3">
          <Image src="poster2.jpg" width="fill" height={280} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={16} padY={16} gap={12} name="CardContent">
            <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" name="TitleRow">
              <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">WICKED</Text>
              <Frame width={40} height={24} fill="#065F46" radius={4} alignY="center" name="RatingBadge">
                <Text fill="#F3F4F6" fontSize={12} fontWeight="bold">PG</Text>
              </Frame>
            </Frame>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} alignY="center" name="TrailerIcon">
              <Ellipse width={28} height={28} fill="#F59E0B" opacity={0.9} name="PlayCircle" />
              <Text fill="#9CA3AF" fontSize={12}>Trailer</Text>
            </Frame>
          </Frame>
        </Frame>
        <Frame autoLayout flow="vertical" width={220} height={380} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="MovieCard3" dropShadow="0:8:24:#000000:0.3">
          <Image src="poster3.jpg" width="fill" height={280} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={16} padY={16} gap={12} name="CardContent">
            <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" name="TitleRow">
              <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">KRAVEN</Text>
              <Frame width={40} height={24} fill="#991B1B" radius={4} alignY="center" name="RatingBadge">
                <Text fill="#F3F4F6" fontSize={12} fontWeight="bold">18+</Text>
              </Frame>
            </Frame>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} alignY="center" name="TrailerIcon">
              <Ellipse width={28} height={28} fill="#F59E0B" opacity={0.9} name="PlayCircle" />
              <Text fill="#9CA3AF" fontSize={12}>Trailer</Text>
            </Frame>
          </Frame>
        </Frame>
        <Frame autoLayout flow="vertical" width={220} height={380} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="MovieCard4" dropShadow="0:8:24:#000000:0.3">
          <Image src="poster4.jpg" width="fill" height={280} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={16} padY={16} gap={12} name="CardContent">
            <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" name="TitleRow">
              <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">MOANA 2</Text>
              <Frame width={40} height={24} fill="#065F46" radius={4} alignY="center" name="RatingBadge">
                <Text fill="#F3F4F6" fontSize={12} fontWeight="bold">PG</Text>
              </Frame>
            </Frame>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} alignY="center" name="TrailerIcon">
              <Ellipse width={28} height={28} fill="#F59E0B" opacity={0.9} name="PlayCircle" />
              <Text fill="#9CA3AF" fontSize={12}>Trailer</Text>
            </Frame>
          </Frame>
        </Frame>
      </Frame>
    </Frame>

    <Frame autoLayout flow="vertical" width="fill" height="hug" padX={80} padY={48} gap={32} name="UpcomingSection">
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" name="SectionHeader">
        <Text fill="#F3F4F6" fontSize={28} fontWeight="bold">COMING SOON</Text>
        <Text fill="#F59E0B" fontSize={16} fontWeight="medium">VIEW CALENDAR →</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={24} name="UpcomingGrid">
        <Frame autoLayout flow="vertical" width={280} height={320} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="UpcomingCard1" dropShadow="0:4:12:#000000:0.25">
          <Image src="upcoming1.jpg" width="fill" height={180} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={20} padY={20} gap={12} name="CardContent">
            <Text fill="#F3F4F6" fontSize={18} fontWeight="bold">NOSFERATU</Text>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} name="Genres">
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre1">
                <Text fill="#F59E0B" fontSize={12}>Horror</Text>
              </Frame>
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre2">
                <Text fill="#F59E0B" fontSize={12}>Fantasy</Text>
              </Frame>
            </Frame>
            <Text fill="#9CA3AF" fontSize={14}>Releases Dec 25, 2024</Text>
          </Frame>
        </Frame>
        <Frame autoLayout flow="vertical" width={280} height={320} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="UpcomingCard2" dropShadow="0:4:12:#000000:0.25">
          <Image src="upcoming2.jpg" width="fill" height={180} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={20} padY={20} gap={12} name="CardContent">
            <Text fill="#F3F4F6" fontSize={18} fontWeight="bold">THE LORD OF THE</Text>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} name="Genres">
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre1">
                <Text fill="#F59E0B" fontSize={12}>Animation</Text>
              </Frame>
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre2">
                <Text fill="#F59E0B" fontSize={12}>Adventure</Text>
              </Frame>
            </Frame>
            <Text fill="#9CA3AF" fontSize={14}>Releases Jan 10, 2025</Text>
          </Frame>
        </Frame>
        <Frame autoLayout flow="vertical" width={280} height={320} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="UpcomingCard3" dropShadow="0:4:12:#000000:0.25">
          <Image src="upcoming3.jpg" width="fill" height={180} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={20} padY={20} gap={12} name="CardContent">
            <Text fill="#F3F4F6" fontSize={18} fontWeight="bold">MISSION: IMPOSSIBLE</Text>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} name="Genres">
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre1">
                <Text fill="#F59E0B" fontSize={12}>Action</Text>
              </Frame>
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre2">
                <Text fill="#F59E0B" fontSize={12}>Thriller</Text>
              </Frame>
            </Frame>
            <Text fill="#9CA3AF" fontSize={14}>Releases May 23, 2025</Text>
          </Frame>
        </Frame>
        <Frame autoLayout flow="vertical" width={280} height={320} fill="#1A1A1A" radius={12} stroke="#374151" strokeWidth={1} name="UpcomingCard4" dropShadow="0:4:12:#000000:0.25">
          <Image src="upcoming4.jpg" width="fill" height={180} radius="12 12 0 0" fill="#2D2D2D" name="Poster" />
          <Frame autoLayout flow="vertical" width="fill" height="fill" padX={20} padY={20} gap={12} name="CardContent">
            <Text fill="#F3F4F6" fontSize={18} fontWeight="bold">KARATE KID</Text>
            <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} name="Genres">
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre1">
                <Text fill="#F59E0B" fontSize={12}>Drama</Text>
              </Frame>
              <Frame width="hug" height={28} fill="none" stroke="#F59E0B" strokeWidth={1} radius={6} padX={12} padY={4} name="Genre2">
                <Text fill="#F59E0B" fontSize={12}>Sport</Text>
              </Frame>
            </Frame>
            <Text fill="#9CA3AF" fontSize={14}>Releases Jun 6, 2025</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>

    <Frame autoLayout flow="vertical" width="fill" height={280} fill="#0A0A0A" stroke="#1F1F1F" strokeWidth={1} name="Footer">
      <Frame autoLayout flow="horizontal" width="fill" height="fill" padX={80} padY={48} gap={64} name="FooterContent">
        <Frame autoLayout flow="vertical" width={300} height="hug" gap={16} name="InfoColumn">
          <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} alignY="center" name="FooterLogo">
            <Ellipse width={28} height={28} fill="#F59E0B" name="LogoIcon" />
            <Text fill="#F3F4F6" fontSize={18} fontWeight="bold">CINEMA</Text>
          </Frame>
          <Text fill="#9CA3AF" fontSize={14} lineHeight={24}>123 Film Boulevard<br />Hollywood, CA 90210<br />United States</Text>
          <Text fill="#F59E0B" fontSize={14}>info@cinema.com</Text>
          <Text fill="#9CA3AF" fontSize={14}>(555) 123-4567</Text>
        </Frame>
        <Frame autoLayout flow="vertical" width={200} height="hug" gap={16} name="QuickLinks">
          <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">QUICK LINKS</Text>
          <Text fill="#9CA3AF" fontSize={14}>Showtimes</Text>
          <Text fill="#9CA3AF" fontSize={14}>Gift Cards</Text>
          <Text fill="#9CA3AF" fontSize={14}>Membership</Text>
          <Text fill="#9CA3AF" fontSize={14}>FAQ</Text>
        </Frame>
        <Frame autoLayout flow="vertical" width={200} height="hug" gap={16} name="Legal">
          <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">LEGAL</Text>
          <Text fill="#9CA3AF" fontSize={14}>Terms of Use</Text>
          <Text fill="#9CA3AF" fontSize={14}>Privacy Policy</Text>
          <Text fill="#9CA3AF" fontSize={14}>Accessibility</Text>
        </Frame>
        <Frame autoLayout flow="vertical" width={200} height="hug" gap={16} name="Social">
          <Text fill="#F3F4F6" fontSize={16} fontWeight="bold">FOLLOW US</Text>
          <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={16} name="SocialIcons">
            <Frame width={32} height={32} fill="none" stroke="#F59E0B" strokeWidth={2} radius={8} name="Facebook" />
            <Frame width={32} height={32} fill="none" stroke="#F59E0B" strokeWidth={2} radius={8} name="Twitter" />
            <Frame width={32} height={32} fill="none" stroke="#F59E0B" strokeWidth={2} radius={8} name="Instagram" />
            <Frame width={32} height={32} fill="none" stroke="#F59E0B" strokeWidth={2} radius={8} name="YouTube" />
          </Frame>
        </Frame>
      </Frame>
      <Frame width="fill" height={48} fill="#000000" alignX="center" alignY="center" name="CopyrightBar">
        <Text fill="#6B7280" fontSize={12}>© 2024 CINEMA. All rights reserved.</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>