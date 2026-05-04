<Screen className="w-[1366px] h-[768px] bg-surface flex flex-col items-center">
  <VStack className="w-full max-w-[1200px] h-full flex flex-col gap-6">
    <NavBar className="w-full border-b border-default py-4">
      <HStack className="w-full items-center justify-between px-6">
        <HStack className="items-center gap-3">
          <Frame className="w-8 h-8 bg-brand"></Frame>
          <Text className="text-xl font-bold text-text">CINEMA</Text>
        </HStack>
        <HStack className="gap-8">
          <Text className="text-base text-text">Афиша</Text>
          <Text className="text-base text-text">Фильмы</Text>
          <Text className="text-base text-text">Скоро</Text>
          <Text className="text-base text-text">Контакты</Text>
        </HStack>
      </HStack>
    </NavBar>
    
    <VStack className="w-full flex-1 overflow-hidden px-6">
      <HStack className="w-full gap-6 overflow-x-auto pb-4">
        <Frame className="w-[320px] h-[420px] bg-card flex flex-col shrink-0">
          <Frame className="w-full h-[240px] bg-slate-700"></Frame>
          <VStack className="p-5 gap-4">
            <Text className="text-xl font-bold text-text">Дюна: Часть вторая</Text>
            <HStack className="gap-3 items-center">
              <Frame className="w-12 h-12 bg-brand flex items-center justify-center">
                <Text className="text-lg font-bold text-text">8.5</Text>
              </Frame>
              <Button label="Купить билет" className="bg-brand px-6 py-2 text-text font-medium" />
            </HStack>
          </VStack>
        </Frame>
        <Frame className="w-[320px] h-[420px] bg-card flex flex-col shrink-0">
          <Frame className="w-full h-[240px] bg-slate-700"></Frame>
          <VStack className="p-5 gap-4">
            <Text className="text-xl font-bold text-text">Гладиатор 2</Text>
            <HStack className="gap-3 items-center">
              <Frame className="w-12 h-12 bg-brand flex items-center justify-center">
                <Text className="text-lg font-bold text-text">8.2</Text>
              </Frame>
              <Button label="Купить билет" className="bg-brand px-6 py-2 text-text font-medium" />
            </HStack>
          </VStack>
        </Frame>
        <Frame className="w-[320px] h-[420px] bg-card flex flex-col shrink-0">
          <Frame className="w-full h-[240px] bg-slate-700"></Frame>
          <VStack className="p-5 gap-4">
            <Text className="text-xl font-bold text-text">Веном 3</Text>
            <HStack className="gap-3 items-center">
              <Frame className="w-12 h-12 bg-brand flex items-center justify-center">
                <Text className="text-lg font-bold text-text">7.8</Text>
              </Frame>
              <Button label="Купить билет" className="bg-brand px-6 py-2 text-text font-medium" />
            </HStack>
          </VStack>
        </Frame>
        <Frame className="w-[320px] h-[420px] bg-card flex flex-col shrink-0">
          <Frame className="w-full h-[240px] bg-slate-700"></Frame>
          <VStack className="p-5 gap-4">
            <Text className="text-xl font-bold text-text">Мастер и Маргарита</Text>
            <HStack className="gap-3 items-center">
              <Frame className="w-12 h-12 bg-brand flex items-center justify-center">
                <Text className="text-lg font-bold text-text">8.9</Text>
              </Frame>
              <Button label="Купить билет" className="bg-brand px-6 py-2 text-text font-medium" />
            </HStack>
          </VStack>
        </Frame>
      </HStack>
      
      <VStack className="w-full gap-5 mt-6">
        <Text className="text-2xl font-bold text-text">Все фильмы</Text>
        <VStack className="w-full gap-5">
          <HStack className="w-full gap-5">
            <Frame className="flex-1 h-[280px] bg-card flex flex-col">
              <Frame className="w-full h-[160px] bg-slate-700"></Frame>
              <VStack className="p-4 gap-2">
                <Text className="text-lg font-bold text-text">Оппенгеймер</Text>
                <HStack className="gap-2">
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">боевик</Text>
                  </Frame>
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">драма</Text>
                  </Frame>
                </HStack>
                <Button label="Купить билет" className="bg-brand px-4 py-1 text-text text-sm font-medium w-full mt-2" />
              </VStack>
            </Frame>
            <Frame className="flex-1 h-[280px] bg-card flex flex-col">
              <Frame className="w-full h-[160px] bg-slate-700"></Frame>
              <VStack className="p-4 gap-2">
                <Text className="text-lg font-bold text-text">Барби</Text>
                <HStack className="gap-2">
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">комедия</Text>
                  </Frame>
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">фэнтези</Text>
                  </Frame>
                </HStack>
                <Button label="Купить билет" className="bg-brand px-4 py-1 text-text text-sm font-medium w-full mt-2" />
              </VStack>
            </Frame>
            <Frame className="flex-1 h-[280px] bg-card flex flex-col">
              <Frame className="w-full h-[160px] bg-slate-700"></Frame>
              <VStack className="p-4 gap-2">
                <Text className="text-lg font-bold text-text">Фуриоса</Text>
                <HStack className="gap-2">
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">экшн</Text>
                  </Frame>
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">фантастика</Text>
                  </Frame>
                </HStack>
                <Button label="Купить билет" className="bg-brand px-4 py-1 text-text text-sm font-medium w-full mt-2" />
              </VStack>
            </Frame>
          </HStack>
          <HStack className="w-full gap-5">
            <Frame className="flex-1 h-[280px] bg-card flex flex-col">
              <Frame className="w-full h-[160px] bg-slate-700"></Frame>
              <VStack className="p-4 gap-2">
                <Text className="text-lg font-bold text-text">Субстанция</Text>
                <HStack className="gap-2">
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">хоррор</Text>
                  </Frame>
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">триллер</Text>
                  </Frame>
                </HStack>
                <Button label="Купить билет" className="bg-brand px-4 py-1 text-text text-sm font-medium w-full mt-2" />
              </VStack>
            </Frame>
            <Frame className="flex-1 h-[280px] bg-card flex flex-col">
              <Frame className="w-full h-[160px] bg-slate-700"></Frame>
              <VStack className="p-4 gap-2">
                <Text className="text-lg font-bold text-text">Дэдпул и Росомаха</Text>
                <HStack className="gap-2">
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">комедия</Text>
                  </Frame>
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">экшн</Text>
                  </Frame>
                </HStack>
                <Button label="Купить билет" className="bg-brand px-4 py-1 text-text text-sm font-medium w-full mt-2" />
              </VStack>
            </Frame>
            <Frame className="flex-1 h-[280px] bg-card flex flex-col">
              <Frame className="w-full h-[160px] bg-slate-700"></Frame>
              <VStack className="p-4 gap-2">
                <Text className="text-lg font-bold text-text">Головоломка 2</Text>
                <HStack className="gap-2">
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">мультфильм</Text>
                  </Frame>
                  <Frame className="px-2 py-1 border border-default">
                    <Text className="text-xs text-muted">приключения</Text>
                  </Frame>
                </HStack>
                <Button label="Купить билет" className="bg-brand px-4 py-1 text-text text-sm font-medium w-full mt-2" />
              </VStack>
            </Frame>
          </HStack>
        </VStack>
      </VStack>
    </VStack>
    
    <Frame className="w-full bg-card py-6 mt-6 border-t border-default">
      <HStack className="w-full max-w-[1200px] items-center justify-between px-6 mx-auto">
        <Text className="text-sm text-muted">© 2025 Кинопоиск. Все права защищены.</Text>
        <HStack className="gap-5">
          <Frame className="w-6 h-6 bg-slate-600"></Frame>
          <Frame className="w-6 h-6 bg-slate-600"></Frame>
          <Frame className="w-6 h-6 bg-slate-600"></Frame>
        </HStack>
      </HStack>
    </Frame>
  </VStack>
</Screen>