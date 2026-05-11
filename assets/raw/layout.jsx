<Frame autoLayout flow="vertical" width={1440} height="hug" fill="background" name="LandingPage">

  {/* Header */}
  <Frame autoLayout flow="horizontal" width="fill" height="hug" fill="surface" padX="xl" padY="lg" alignX="between" alignY="center" name="Header">
    <Text variant="h3" fill="text" name="Logo">LingerieLoft</Text>
    <Frame autoLayout flow="horizontal" gap="lg" name="NavLinks">
      <Text variant="body" fill="text" name="NavShop">Shop</Text>
      <Text variant="body" fill="text" name="NavBraFinder">Bra Finder</Text>
      <Text variant="body" fill="text" name="NavBlog">Blog</Text>
    </Frame>
    <Frame autoLayout flow="horizontal" gap="md" name="Icons">
      <Image src="https://api.iconify.design/lucide/shopping-bag.svg" width={24} height={24} name="CartIcon" />
      <Image src="https://api.iconify.design/lucide/user.svg" width={24} height={24} name="AccountIcon" />
    </Frame>
  </Frame>

  {/* Hero */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" fill="surface-soft" padX="xl" padY="2xl" alignX="center" name="Hero" gap="lg">
    <Image src="https://picsum.photos/seed/lingerie-hero/1200/600" width={1200} height={600} radius="lg" name="HeroImage" />
    <Text variant="display" fill="text" alignX="center" name="HeroHeadline">Find your perfect fit</Text>
    <Text variant="body-lg" fill="text-secondary" alignX="center" name="HeroSubhead">Everyday luxury, made for you</Text>
    <Frame as="button-primary" padX="xl" padY="md" fill="primary" radius="full" name="ButtonShopNow">
      <Text variant="button" fill="surface" name="ShopNowText">Shop Now</Text>
    </Frame>
  </Frame>

  {/* Category Grid */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="2xl" gap="lg" name="CategoriesSection">
    <Text variant="h2" fill="text" name="CategoriesTitle">Shop by Category</Text>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap="md" name="CategoryGrid">
      {/* Bras */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" name="CategoryCardBras">
        <Image src="https://placehold.co/320x240/F9F0EB/6B5B60?text=Bras" width="fill" height={240} radius="lg" name="BrasImage" />
        <Frame autoLayout flow="horizontal" width="fill" padX="md" padY="md" alignX="between" name="BrasFooter">
          <Text variant="h3" fill="text" name="BrasTitle">Bras</Text>
          <Text variant="button" fill="primary" name="BrasLink">Explore →</Text>
        </Frame>
      </Frame>
      {/* Panties */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" name="CategoryCardPanties">
        <Image src="https://placehold.co/320x240/F9F0EB/6B5B60?text=Panties" width="fill" height={240} radius="lg" name="PantiesImage" />
        <Frame autoLayout flow="horizontal" width="fill" padX="md" padY="md" alignX="between" name="PantiesFooter">
          <Text variant="h3" fill="text" name="PantiesTitle">Panties</Text>
          <Text variant="button" fill="primary" name="PantiesLink">Explore →</Text>
        </Frame>
      </Frame>
      {/* Loungewear */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" name="CategoryCardLoungewear">
        <Image src="https://placehold.co/320x240/F9F0EB/6B5B60?text=Loungewear" width="fill" height={240} radius="lg" name="LoungewearImage" />
        <Frame autoLayout flow="horizontal" width="fill" padX="md" padY="md" alignX="between" name="LoungewearFooter">
          <Text variant="h3" fill="text" name="LoungewearTitle">Loungewear</Text>
          <Text variant="button" fill="primary" name="LoungewearLink">Explore →</Text>
        </Frame>
      </Frame>
      {/* Shapewear */}
      <Frame autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" name="CategoryCardShapewear">
        <Image src="https://placehold.co/320x240/F9F0EB/6B5B60?text=Shapewear" width="fill" height={240} radius="lg" name="ShapewearImage" />
        <Frame autoLayout flow="horizontal" width="fill" padX="md" padY="md" alignX="between" name="ShapewearFooter">
          <Text variant="h3" fill="text" name="ShapewearTitle">Shapewear</Text>
          <Text variant="button" fill="primary" name="ShapewearLink">Explore →</Text>
        </Frame>
      </Frame>
    </Frame>
  </Frame>

  {/* Bestsellers Carousel */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX="xl" padY="2xl" gap="lg" name="BestsellersSection">
    <Text variant="h2" fill="text" name="BestsellersTitle">Bestsellers</Text>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap="md" name="Carousel">
      
      {/* Product Card 1 */}
      <Frame as="card" width={280} height="hug" fill="surface" border="border" radius="md" name="ProductCard">
        <Image src="https://placehold.co/280/240/F9F0EB/6B5B60?text=Emery+Lace+Balconette" width="fill" height={240} radius="md" name="ProductImage" />
        <Frame autoLayout flow="vertical" width="fill" padX="md" padY="md" gap="sm" name="ProductInfo">
          <Text variant="h3" fill="text" name="ProductTitle">Emery Lace Balconette</Text>
          <Text variant="body" fill="text-secondary" name="ProductPrice">$48</Text>
          <Frame autoLayout flow="horizontal" gap="xs" name="RatingStars">
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star1" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star2" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star3" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star4" />
            <Rect width={16} height={16} fill="border" radius="full" name="Star5" />
          </Frame>
          <Frame as="button-primary" fill="primary" radius="full" padX="md" padY="sm" alignX="center" name="AddToBagBtn">
            <Text variant="button" fill="surface" name="AddToBagText">Add to Bag</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 2 */}
      <Frame as="card" width={280} height="hug" fill="surface" border="border" radius="md" name="ProductCard">
        <Image src="https://placehold.co/280/240/F9F0EB/6B5B60?text=Celeste+Silk+Cami" width="fill" height={240} radius="md" name="ProductImage" />
        <Frame autoLayout flow="vertical" width="fill" padX="md" padY="md" gap="sm" name="ProductInfo">
          <Text variant="h3" fill="text" name="ProductTitle">Celeste Silk Cami</Text>
          <Text variant="body" fill="text-secondary" name="ProductPrice">$89</Text>
          <Frame autoLayout flow="horizontal" gap="xs" name="RatingStars">
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star1" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star2" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star3" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star4" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star5" />
          </Frame>
          <Frame as="button-primary" fill="primary" radius="full" padX="md" padY="sm" alignX="center" name="AddToBagBtn">
            <Text variant="button" fill="surface" name="AddToBagText">Add to Bag</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 3 */}
      <Frame as="card" width={280} height="hug" fill="surface" border="border" radius="md" name="ProductCard">
        <Image src="https://placehold.co/280/240/F9F0EB/6B5B60?text=Ivy+Lace+Thong" width="fill" height={240} radius="md" name="ProductImage" />
        <Frame autoLayout flow="vertical" width="fill" padX="md" padY="md" gap="sm" name="ProductInfo">
          <Text variant="h3" fill="text" name="ProductTitle">Ivy Lace Thong</Text>
          <Text variant="body" fill="text-secondary" name="ProductPrice">$34</Text>
          <Frame autoLayout flow="horizontal" gap="xs" name="RatingStars">
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star1" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star2" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star3" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star4" />
            <Rect width={16} height={16} fill="border" radius="full" name="Star5" />
          </Frame>
          <Frame as="button-primary" fill="primary" radius="full" padX="md" padY="sm" alignX="center" name="AddToBagBtn">
            <Text variant="button" fill="surface" name="AddToBagText">Add to Bag</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 4 */}
      <Frame as="card" width={280} height="hug" fill="surface" border="border" radius="md" name="ProductCard">
        <Image src="https://placehold.co/280/240/F9F0EB/6B5B60?text=Willow+Bralette" width="fill" height={240} radius="md" name="ProductImage" />
        <Frame autoLayout flow="vertical" width="fill" padX="md" padY="md" gap="sm" name="ProductInfo">
          <Text variant="h3" fill="text" name="ProductTitle">Willow Bralette</Text>
          <Text variant="body" fill="text-secondary" name="ProductPrice">$42</Text>
          <Frame autoLayout flow="horizontal" gap="xs" name="RatingStars">
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star1" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star2" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star3" />
            <Rect width={16} height={16} fill="primary-soft" radius="full" name="Star4" />
            <Rect width={16} height={16} fill="border" radius="full" name="Star5" />
          </Frame>
          <Frame as="button-primary" fill="primary" radius="full" padX="md" padY="sm" alignX="center" name="AddToBagBtn">
            <Text variant="button" fill="surface" name="AddToBagText">Add to Bag</Text>
          </Frame>
        </Frame>
      </Frame>

    </Frame>
  </Frame>

  {/* Fit Promise Banner */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" fill="accent" padX="xl" padY="2xl" alignX="center" gap="md" name="FitPromiseBanner">
    <Text variant="h1" fill="surface" alignX="center" name="FitPromiseTitle">Designed for real bodies</Text>
    <Text variant="body-lg" fill="surface-soft" alignX="center" name="FitPromiseCopy">Soft lace that stays put — no tugging, no fuss. Free returns on every order, because finding your perfect fit should be easy.</Text>
    <Rect width={48} height={48} fill="primary-soft" radius="md" name="IllustrationPlaceholder" />
  </Frame>

  {/* Footer */}
  <Frame autoLayout flow="vertical" width="fill" height="hug" fill="surface" padX="xl" padY="2xl" gap="xl" name="Footer">
    <Frame autoLayout flow="horizontal" width="fill" alignX="between" name="FooterTop">
      <Frame autoLayout flow="vertical" gap="md" name="BrandColumn">
        <Text variant="h3" fill="text" name="FooterLogo">LingerieLoft</Text>
        <Frame autoLayout flow="horizontal" gap="sm" name="SocialIcons">
          <Image src="https://thesvg.org/icons/instagram/default.svg" width={24} height={24} name="InstagramIcon" />
          <Image src="https://thesvg.org/icons/pinterest/default.svg" width={24} height={24} name="PinterestIcon" />
        </Frame>
      </Frame>
      <Frame autoLayout flow="vertical" gap="sm" name="LinksColumn">
        <Text variant="body" fill="text" name="ContactLink">Contact</Text>
        <Text variant="body" fill="text" name="SizeGuideLink">Size Guide</Text>
        <Text variant="body" fill="text" name="FAQsLink">FAQs</Text>
        <Text variant="body" fill="text" name="ShippingLink">Shipping</Text>
      </Frame>
      <Frame autoLayout flow="vertical" gap="md" name="NewsletterColumn">
        <Text variant="body" fill="text" name="NewsletterTitle">Subscribe for 15% off</Text>
        <Frame autoLayout flow="horizontal" gap="sm" name="NewsletterForm">
          <Frame width={280} height={48} fill="surface-soft" radius="full" border="border" padX="md" alignY="center" name="EmailInput">
            <Text variant="body" fill="text-secondary" name="EmailPlaceholder">Your email address</Text>
          </Frame>
          <Frame as="button-primary" fill="primary" radius="full" padX="lg" padY="md" alignX="center" alignY="center" name="SubscribeBtn">
            <Text variant="button" fill="surface" name="SubscribeText">Subscribe</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
    <Line length="fill" stroke="border" strokeWidth={1} name="Divider" />
    <Text variant="caption" fill="text-secondary" alignX="center" name="Copyright">© 2025 LingerieLoft. All rights reserved.</Text>
  </Frame>

</Frame>