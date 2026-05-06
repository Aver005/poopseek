<Frame autoLayout flow="horizontal" width={1440} height={900} fill="#FFFFFF" name="SignUp_Desktop">
  <Frame autoLayout flow="vertical" width="fill" height="fill" fill="#F9FAFB" alignX="center" alignY="center" gap={16} name="IllustrationSection">
    <Frame autoLayout flow="vertical" width={480} height="hug" gap={32} alignX="center" name="HeroContent">
      <Frame width={120} height={120} fill="url(#gradient)" radius={60} name="LogoCircle" gradient="#6C5CE7:#007AFF:135" />
      <Text fill="#111827" fontSize={36} fontWeight="bold" alignX="center">Создайте аккаунт</Text>
      <Text fill="#6B7280" fontSize={18} alignX="center">Присоединяйтесь к нашему сообществу</Text>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={16} alignX="center" name="SocialButtons">
        <Frame autoLayout flow="horizontal" width={56} height={56} fill="#FFFFFF" radius={28} alignX="center" alignY="center" shadow="button" name="GoogleBtn">
          <Image src="https://thesvg.org/icons/google/default.svg" width={24} height={24} />
        </Frame>
        <Frame autoLayout flow="horizontal" width={56} height={56} fill="#FFFFFF" radius={28} alignX="center" alignY="center" shadow="button" name="AppleBtn">
          <Image src="https://thesvg.org/icons/apple/dark.svg" width={24} height={24} />
        </Frame>
        <Frame autoLayout flow="horizontal" width={56} height={56} fill="#FFFFFF" radius={28} alignX="center" alignY="center" shadow="button" name="GithubBtn">
          <Image src="https://thesvg.org/icons/github/dark.svg" width={24} height={24} />
        </Frame>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={16} alignX="center" name="Divider">
        <Line length="fill" stroke="#E5E7EB" strokeWidth={1} />
        <Text fill="#6B7280" fontSize={14}>или</Text>
        <Line length="fill" stroke="#E5E7EB" strokeWidth={1} />
      </Frame>
    </Frame>
  </Frame>
  <Frame autoLayout flow="vertical" width={560} height="fill" fill="#FFFFFF" padX={48} padY={48} gap={32} name="FormSection">
    <Text fill="#111827" fontSize={28} fontWeight="bold">Регистрация</Text>
    <Frame autoLayout flow="vertical" width="fill" height="hug" gap={20} name="Form">
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={8} name="NameField">
        <Text fill="#111827" fontSize={14} fontWeight="medium">Имя</Text>
        <Frame width="fill" height={56} fill="#F9FAFB" stroke="#E5E7EB" strokeWidth={1} radius={12} padX={16} alignY="center" name="NameInput">
          <Text fill="#6B7280" fontSize={16}>Иван Иванов</Text>
        </Frame>
      </Frame>
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={8} name="EmailField">
        <Text fill="#111827" fontSize={14} fontWeight="medium">Email</Text>
        <Frame width="fill" height={56} fill="#F9FAFB" stroke="#E5E7EB" strokeWidth={1} radius={12} padX={16} alignY="center" name="EmailInput">
          <Text fill="#6B7280" fontSize={16}>ivan@example.com</Text>
        </Frame>
      </Frame>
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={8} name="PasswordField">
        <Text fill="#111827" fontSize={14} fontWeight="medium">Пароль</Text>
        <Frame width="fill" height={56} fill="#F9FAFB" stroke="#E5E7EB" strokeWidth={1} radius={12} padX={16} alignY="center" name="PasswordInput">
          <Text fill="#6B7280" fontSize={16}>••••••••</Text>
        </Frame>
      </Frame>
      <Frame width="fill" height={56} fill="#6C5CE7" radius={12} alignX="center" alignY="center" shadow="button" name="SignupBtn">
        <Text fill="#FFFFFF" fontSize={16} fontWeight="bold">Зарегистрироваться</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={8} alignX="center" name="LoginLink">
        <Text fill="#6B7280" fontSize={14}>Уже есть аккаунт?</Text>
        <Text fill="#007AFF" fontSize={14} fontWeight="medium">Войти</Text>
      </Frame>
    </Frame>
  </Frame>
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#6C5CE7" />
      <stop offset="100%" stopColor="#007AFF" />
    </linearGradient>
  </defs>
</Frame>
<Frame autoLayout flow="vertical" width={768} height={1024} fill="#F9FAFB" name="SignUp_Tablet">
  <Frame autoLayout flow="vertical" width="fill" height="hug" padX={40} padY={60} gap={48} alignX="center" name="Container">
    <Frame autoLayout flow="vertical" width="fill" height="hug" gap={24} alignX="center" name="Header">
      <Frame width={80} height={80} fill="#6C5CE7" radius={20} alignX="center" alignY="center" shadow="card">
        <Text fill="#FFFFFF" fontSize={32} fontWeight="bold">✨</Text>
      </Frame>
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={12} alignX="center" name="TitleBlock">
        <Text fill="#111827" fontSize={32} fontWeight="bold" alignX="center">Добро пожаловать!</Text>
        <Text fill="#6B7280" fontSize={18} alignX="center">Заполните данные для регистрации</Text>
      </Frame>
    </Frame>
    <Frame autoLayout flow="vertical" width="fill" height="hug" gap={28} name="Form">
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={12} name="NameField">
        <Text fill="#111827" fontSize={16} fontWeight="medium">Полное имя</Text>
        <Frame width="fill" height={64} fill="#FFFFFF" radius={16} padX={20} alignY="center" shadow="card" name="NameInput">
          <Text fill="#111827" fontSize={18}>Анна Смирнова</Text>
        </Frame>
      </Frame>
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={12} name="EmailField">
        <Text fill="#111827" fontSize={16} fontWeight="medium">Электронная почта</Text>
        <Frame width="fill" height={64} fill="#FFFFFF" radius={16} padX={20} alignY="center" shadow="card" name="EmailInput">
          <Text fill="#111827" fontSize={18}>anna@example.com</Text>
        </Frame>
      </Frame>
      <Frame autoLayout flow="vertical" width="fill" height="hug" gap={12} name="PasswordField">
        <Text fill="#111827" fontSize={16} fontWeight="medium">Пароль</Text>
        <Frame width="fill" height={64} fill="#FFFFFF" radius={16} padX={20} alignY="center" shadow="card" name="PasswordInput">
          <Text fill="#111827" fontSize={18}>••••••••</Text>
        </Frame>
      </Frame>
      <Frame width="fill" height={64} fill="#007AFF" radius={16} alignX="center" alignY="center" shadow="button" name="SignupBtn">
        <Text fill="#FFFFFF" fontSize={18} fontWeight="bold">Создать аккаунт</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={12} alignX="center" name="LoginLink">
        <Text fill="#6B7280" fontSize={16}>Уже зарегистрированы?</Text>
        <Text fill="#007AFF" fontSize={16} fontWeight="bold">Войти</Text>
      </Frame>
    </Frame>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={24} alignX="center" name="SocialAuth">
      <Frame width="fill" height={56} fill="#FFFFFF" radius={14} alignX="center" alignY="center" gap={12} shadow="card">
        <Image src="https://thesvg.org/icons/google/default.svg" width={24} height={24} />
        <Text fill="#111827" fontSize={15} fontWeight="medium">Google</Text>
      </Frame>
      <Frame width="fill" height={56} fill="#FFFFFF" radius={14} alignX="center" alignY="center" gap={12} shadow="card">
        <Image src="https://thesvg.org/icons/apple/dark.svg" width={24} height={24} />
        <Text fill="#111827" fontSize={15} fontWeight="medium">Apple</Text>
      </Frame>
    </Frame>
  </Frame>
</Frame>
<Frame autoLayout flow="vertical" width={375} height={812} fill="url(#glassGradient)" name="SignUp_Mobile">
  <Frame autoLayout flow="vertical" width="fill" height="fill" padX={20} padY={80} gap={32} alignX="center" name="GlassContainer">
    <Frame autoLayout flow="vertical" width="fill" height="hug" gap={16} alignX="center" name="Header">
      <Frame width={64} height={64} fill="#6C5CE7" radius={32} alignX="center" alignY="center" shadow="modal">
        <Text fill="#FFFFFF" fontSize={28}>📱</Text>
      </Frame>
      <Text fill="#FFFFFF" fontSize={28} fontWeight="bold" alignX="center">Регистрация</Text>
      <Text fill="rgba(255,255,255,0.8)" fontSize={14} alignX="center">Присоединяйтесь сейчас</Text>
    </Frame>
    <Frame autoLayout flow="vertical" width="fill" height="hug" gap={20} name="Form">
      <Frame width="fill" height={56} fill="rgba(255,255,255,0.95)" radius={14} padX={16} alignY="center" name="NameInput">
        <Text fill="#6B7280" fontSize={15}>Имя</Text>
      </Frame>
      <Frame width="fill" height={56} fill="rgba(255,255,255,0.95)" radius={14} padX={16} alignY="center" name="EmailInput">
        <Text fill="#6B7280" fontSize={15}>Email</Text>
      </Frame>
      <Frame width="fill" height={56} fill="rgba(255,255,255,0.95)" radius={14} padX={16} alignY="center" name="PasswordInput">
        <Text fill="#6B7280" fontSize={15}>Пароль</Text>
      </Frame>
      <Frame width="fill" height={52} fill="#007AFF" radius={14} alignX="center" alignY="center" shadow="button" name="SignupBtn">
        <Text fill="#FFFFFF" fontSize={16} fontWeight="bold">Зарегистрироваться</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={12} alignX="center" name="Divider">
        <Line length="fill" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
        <Text fill="rgba(255,255,255,0.7)" fontSize={13}>или</Text>
        <Line length="fill" stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={16} alignX="center" name="SocialIcons">
        <Frame width={48} height={48} fill="rgba(255,255,255,0.9)" radius={24} alignX="center" alignY="center">
          <Image src="https://thesvg.org/icons/google/default.svg" width={24} height={24} />
        </Frame>
        <Frame width={48} height={48} fill="rgba(255,255,255,0.9)" radius={24} alignX="center" alignY="center">
          <Image src="https://thesvg.org/icons/apple/dark.svg" width={24} height={24} />
        </Frame>
        <Frame width={48} height={48} fill="rgba(255,255,255,0.9)" radius={24} alignX="center" alignY="center">
          <Image src="https://thesvg.org/icons/github/dark.svg" width={24} height={24} />
        </Frame>
      </Frame>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={8} alignX="center" name="LoginLink">
        <Text fill="rgba(255,255,255,0.7)" fontSize={14}>Уже есть аккаунт?</Text>
        <Text fill="#FFFFFF" fontSize={14} fontWeight="bold">Войти</Text>
      </Frame>
    </Frame>
  </Frame>
  <defs>
    <linearGradient id="glassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#1A1A2E" />
      <stop offset="100%" stopColor="#16213E" />
    </linearGradient>
  </defs>
</Frame>