<Frame name="SawSalesLanding" width={1440} height={1890} fill="background" autoLayout flow="vertical">
  {/* Header */}
  <Frame name="Header" width="fill" height="hug" padX="xl" padY="md" alignY="center" autoLayout flow="horizontal" gap="xl" border="1 surface-soft">
    <Text name="Logo" variant="h2" fill="text" width="hug">SawSales</Text>
    
    <Frame name="NavLinks" autoLayout flow="horizontal" gap="lg" width="fill" alignY="center">
      <Text name="NavSaws" variant="body" fill="text-secondary">Saws</Text>
      <Text name="NavBlades" variant="body" fill="text-secondary">Blades</Text>
      <Text name="NavAccessories" variant="body" fill="text-secondary">Accessories</Text>
      <Text name="NavSupport" variant="body" fill="text-secondary">Support</Text>
    </Frame>
    
    <Frame name="Actions" autoLayout flow="horizontal" gap="md" alignY="center">
      <Frame name="SearchBar" autoLayout flow="horizontal" width={240} height={40} fill="surface" radius="md" border="border" padX="md" gap="sm" alignY="center">
        <Image src="https://api.iconify.design/lucide/search.svg?color=%23B0B0B0" width={18} height={18} />
        <Text name="SearchPlaceholder" variant="body-sm" fill="text-secondary" width="fill">Search 10,000+ saws...</Text>
      </Frame>
      <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={24} height={24} />
    </Frame>
  </Frame>

  {/* Hero Section */}
  <Frame name="Hero" width="fill" height={560} fill="surface" autoLayout flow="vertical" alignX="center" alignY="center" gap="lg">
    <Frame name="HeroContent" autoLayout flow="vertical" alignX="center" gap="md" width="fill" padX="xl">
      <Text name="HeroHeadline" variant="display" fill="text" alignX="center">Saws that cut straight.</Text>
      <Text name="HeroHeadline2" variant="display" fill="text" alignX="center">Prices that cut deeper.</Text>
      <Text name="HeroSubhead" variant="body-lg" fill="text-secondary" alignX="center">Free shipping over $199</Text>
      <Frame name="HeroCTA" as="button-primary" autoLayout flow="horizontal" padX="xl" padY="md" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
        <Text name="HeroButtonText" variant="button" fill="text">Shop bestsellers</Text>
      </Frame>
    </Frame>
  </Frame>

  {/* Catalog Grid */}
  <Frame name="Catalog" autoLayout flow="vertical" width="fill" padX="xl" padY="xl" gap="lg">
    <Frame name="SectionHeader" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
      <Text name="CatalogTitle" variant="h2" fill="text">Best selling saws</Text>
      <Text name="ViewAll" variant="body" fill="primary">View all →</Text>
    </Frame>
    
    <Frame name="ProductGrid" autoLayout flow="horizontal" width="fill" gap="lg" wrap>
      {/* Product Card 1 */}
      <Frame as="product-card" name="ProductCard" autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" border="border" padX="md" padY="md" gap="md">
        <Frame name="ImageContainer" width="fill" height={200} fill="surface-soft" radius="md" alignX="center" alignY="center">
          <Rect name="ProductSilhouette" width={120} height={120} fill="accent-metallic" radius="md" />
        </Frame>
        <Text name="ProductTitle" variant="h3" fill="text">10-inch Table Saw</Text>
        <Text name="ProductSpecs" variant="body-sm" fill="text-secondary">15-amp · 32" rip capacity · 3-1/8" depth</Text>
        <Frame name="RatingRow" autoLayout flow="horizontal" gap="xs" alignY="center">
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star-half.svg?color=%23E85D04" width={16} height={16} />
          <Text name="RatingCount" variant="caption" fill="text-secondary">(142)</Text>
        </Frame>
        <Frame name="PriceRow" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
          <Text name="Price" variant="h2" fill="primary">$299.99</Text>
          <Frame as="button-primary" name="AddToCartBtn" autoLayout flow="horizontal" padX="md" padY="sm" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
            <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={16} height={16} />
            <Text name="AddToCartText" variant="button" fill="text">Add to cart</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 2 */}
      <Frame as="product-card" name="ProductCard" autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" border="border" padX="md" padY="md" gap="md">
        <Frame name="ImageContainer" width="fill" height={200} fill="surface-soft" radius="md" alignX="center" alignY="center">
          <Rect name="ProductSilhouette" width={120} height={120} fill="accent-metallic" radius="md" />
        </Frame>
        <Text name="ProductTitle" variant="h3" fill="text">12-inch Miter Saw</Text>
        <Text name="ProductSpecs" variant="body-sm" fill="text-secondary">15-amp · 12" blade · 45° bevel</Text>
        <Frame name="RatingRow" autoLayout flow="horizontal" gap="xs" alignY="center">
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Text name="RatingCount" variant="caption" fill="text-secondary">(89)</Text>
        </Frame>
        <Frame name="PriceRow" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
          <Text name="Price" variant="h2" fill="primary">$399.99</Text>
          <Frame as="button-primary" name="AddToCartBtn" autoLayout flow="horizontal" padX="md" padY="sm" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
            <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={16} height={16} />
            <Text name="AddToCartText" variant="button" fill="text">Add to cart</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 3 */}
      <Frame as="product-card" name="ProductCard" autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" border="border" padX="md" padY="md" gap="md">
        <Frame name="ImageContainer" width="fill" height={200} fill="surface-soft" radius="md" alignX="center" alignY="center">
          <Rect name="ProductSilhouette" width={120} height={120} fill="accent-metallic" radius="md" />
        </Frame>
        <Text name="ProductTitle" variant="h3" fill="text">7-1/4" Circular Saw</Text>
        <Text name="ProductSpecs" variant="body-sm" fill="text-secondary">15-amp · 5,800 RPM · 2-1/2" depth</Text>
        <Frame name="RatingRow" autoLayout flow="horizontal" gap="xs" alignY="center">
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Text name="RatingCount" variant="caption" fill="text-secondary">(234)</Text>
        </Frame>
        <Frame name="PriceRow" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
          <Text name="Price" variant="h2" fill="primary">$149.99</Text>
          <Frame as="button-primary" name="AddToCartBtn" autoLayout flow="horizontal" padX="md" padY="sm" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
            <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={16} height={16} />
            <Text name="AddToCartText" variant="button" fill="text">Add to cart</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 4 */}
      <Frame as="product-card" name="ProductCard" autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" border="border" padX="md" padY="md" gap="md">
        <Frame name="ImageContainer" width="fill" height={200} fill="surface-soft" radius="md" alignX="center" alignY="center">
          <Rect name="ProductSilhouette" width={120} height={120} fill="accent-metallic" radius="md" />
        </Frame>
        <Text name="ProductTitle" variant="h3" fill="text">14-inch Band Saw</Text>
        <Text name="ProductSpecs" variant="body-sm" fill="text-secondary">1 HP · 13-1/2" resaw · 82" blade</Text>
        <Frame name="RatingRow" autoLayout flow="horizontal" gap="xs" alignY="center">
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star-half.svg?color=%23E85D04" width={16} height={16} />
          <Text name="RatingCount" variant="caption" fill="text-secondary">(67)</Text>
        </Frame>
        <Frame name="PriceRow" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
          <Text name="Price" variant="h2" fill="primary">$499.99</Text>
          <Frame as="button-primary" name="AddToCartBtn" autoLayout flow="horizontal" padX="md" padY="sm" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
            <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={16} height={16} />
            <Text name="AddToCartText" variant="button" fill="text">Add to cart</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 5 */}
      <Frame as="product-card" name="ProductCard" autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" border="border" padX="md" padY="md" gap="md">
        <Frame name="ImageContainer" width="fill" height={200} fill="surface-soft" radius="md" alignX="center" alignY="center">
          <Rect name="ProductSilhouette" width={120} height={120} fill="accent-metallic" radius="md" />
        </Frame>
        <Text name="ProductTitle" variant="h3" fill="text">10-inch Jobsite Saw</Text>
        <Text name="ProductSpecs" variant="body-sm" fill="text-secondary">15-amp · Portable stand · 24" rip</Text>
        <Frame name="RatingRow" autoLayout flow="horizontal" gap="xs" alignY="center">
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Text name="RatingCount" variant="caption" fill="text-secondary">(178)</Text>
        </Frame>
        <Frame name="PriceRow" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
          <Text name="Price" variant="h2" fill="primary">$349.99</Text>
          <Frame as="button-primary" name="AddToCartBtn" autoLayout flow="horizontal" padX="md" padY="sm" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
            <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={16} height={16} />
            <Text name="AddToCartText" variant="button" fill="text">Add to cart</Text>
          </Frame>
        </Frame>
      </Frame>

      {/* Product Card 6 */}
      <Frame as="product-card" name="ProductCard" autoLayout flow="vertical" width="fill" height="hug" fill="surface" radius="lg" border="border" padX="md" padY="md" gap="md">
        <Frame name="ImageContainer" width="fill" height={200} fill="surface-soft" radius="md" alignX="center" alignY="center">
          <Rect name="ProductSilhouette" width={120} height={120} fill="accent-metallic" radius="md" />
        </Frame>
        <Text name="ProductTitle" variant="h3" fill="text">Compact Recip Saw</Text>
        <Text name="ProductSpecs" variant="body-sm" fill="text-secondary">10-amp · Variable speed · Tool-less blade</Text>
        <Frame name="RatingRow" autoLayout flow="horizontal" gap="xs" alignY="center">
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Image src="https://api.iconify.design/lucide/star.svg?color=%23E85D04" width={16} height={16} />
          <Text name="RatingCount" variant="caption" fill="text-secondary">(203)</Text>
        </Frame>
        <Frame name="PriceRow" autoLayout flow="horizontal" width="fill" alignX="between" alignY="center">
          <Text name="Price" variant="h2" fill="primary">$99.99</Text>
          <Frame as="button-primary" name="AddToCartBtn" autoLayout flow="horizontal" padX="md" padY="sm" fill="primary" radius="md" gap="sm" alignX="center" alignY="center">
            <Image src="https://api.iconify.design/lucide/shopping-cart.svg?color=%23FFFFFF" width={16} height={16} />
            <Text name="AddToCartText" variant="button" fill="text">Add to cart</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
  </Frame>

  {/* Feature Bar */}
  <Frame name="FeatureBar" width="fill" height="hug" padX="xl" padY="lg" fill="surface" border="1 surface-soft" autoLayout flow="horizontal" gap="xl" alignX="center">
    <Frame name="FeatureItem" autoLayout flow="horizontal" gap="md" alignY="center">
      <Image src="https://api.iconify.design/lucide/package.svg?color=%23E85D04" width={32} height={32} />
      <Frame autoLayout flow="vertical" gap="xs">
        <Text name="FeatureTitle" variant="body" fill="text">10,000+ saws sold</Text>
        <Text name="FeatureSub" variant="caption" fill="text-secondary">Trusted by pros</Text>
      </Frame>
    </Frame>
    
    <Frame name="FeatureItem" autoLayout flow="horizontal" gap="md" alignY="center">
      <Image src="https://api.iconify.design/lucide/ruler.svg?color=%23E85D04" width={32} height={32} />
      <Frame autoLayout flow="vertical" gap="xs">
        <Text name="FeatureTitle" variant="body" fill="text">30-day test cuts</Text>
        <Text name="FeatureSub" variant="caption" fill="text-secondary">Satisfaction guaranteed</Text>
      </Frame>
    </Frame>
    
    <Frame name="FeatureItem" autoLayout flow="horizontal" gap="md" alignY="center">
      <Image src="https://api.iconify.design/lucide/settings.svg?color=%23E85D04" width={32} height={32} />
      <Frame autoLayout flow="vertical" gap="xs">
        <Text name="FeatureTitle" variant="body" fill="text">Lifetime blade service</Text>
        <Text name="FeatureSub" variant="caption" fill="text-secondary">Free sharpening</Text>
      </Frame>
    </Frame>
  </Frame>

  {/* Newsletter / Trust Section */}
  <Frame name="TrustSection" width="fill" height="hug" padX="xl" padY="xl" autoLayout flow="vertical" gap="xl" alignX="center">
    <Frame name="Testimonial" autoLayout flow="vertical" alignX="center" gap="md" width="fill" padX="2xl">
      <Text name="QuoteIcon" variant="display" fill="primary">"</Text>
      <Text name="TestimonialText" variant="body-lg" fill="text" alignX="center">We switched to SawSales for all our crew. Saved 18% on tools that actually last.</Text>
      <Text name="TestimonialAuthor" variant="body" fill="text-secondary" alignX="center">— Mike Thompson, General Contractor</Text>
    </Frame>
    
    <Frame name="Newsletter" autoLayout flow="vertical" alignX="center" gap="md" width="fill" padX="2xl">
      <Text name="NewsletterTitle" variant="h3" fill="text" alignX="center">Get new saw alerts + 10% off first order</Text>
      <Frame name="SignupForm" autoLayout flow="horizontal" gap="md" width="fill" alignX="center">
        <Frame name="EmailInput" width={320} height={48} fill="surface" radius="md" border="border" padX="md" alignY="center">
          <Text name="EmailPlaceholder" variant="body" fill="text-secondary">your@email.com</Text>
        </Frame>
        <Frame as="button-primary" name="SubscribeBtn" autoLayout flow="horizontal" padX="lg" padY="sm" fill="primary" radius="md" alignX="center" alignY="center">
          <Text name="SubscribeText" variant="button" fill="text">Subscribe</Text>
        </Frame>
      </Frame>
    </Frame>
  </Frame>

  {/* Footer */}
  <Frame name="Footer" width="fill" height="hug" padX="xl" padY="lg" fill="surface" border="1 surface-soft" autoLayout flow="horizontal" alignX="between" alignY="center">
    <Frame name="Copyright" autoLayout flow="vertical" gap="xs">
      <Text name="CopyrightText" variant="body-sm" fill="text-secondary">© 2024 SawSales — industrial-grade cutting tools</Text>
      <Frame name="FooterLinks" autoLayout flow="horizontal" gap="md">
        <Text name="LinkReturns" variant="caption" fill="text-secondary">Returns</Text>
        <Text name="LinkWarranty" variant="caption" fill="text-secondary">Warranty</Text>
        <Text name="LinkContact" variant="caption" fill="text-secondary">Contact</Text>
      </Frame>
    </Frame>
    
    <Frame name="SocialIcons" autoLayout flow="horizontal" gap="md">
      <Image src="https://api.iconify.design/lucide/youtube.svg?color=%23FFFFFF" width={24} height={24} />
      <Image src="https://api.iconify.design/lucide/instagram.svg?color=%23FFFFFF" width={24} height={24} />
      <Image src="https://api.iconify.design/lucide/twitter.svg?color=%23FFFFFF" width={24} height={24} />
    </Frame>
  </Frame>
</Frame>