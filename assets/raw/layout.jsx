<Frame width={390} height={844} fill="#FFFFFF" autoLayout flow="vertical" name="FlightScreen">
  <Frame width="fill" height="hug" autoLayout flow="vertical" gap={16} padX={16} padY={16} name="CalendarSection">
    <Frame width="fill" height="hug" autoLayout flow="horizontal" alignX="between" alignY="center" gap={16} name="MonthNavigator">
      <Frame width={40} height={40} radius={100} fill="#F8FAFC" alignX="center" alignY="center" name="PrevArrow">
        <Text fill="#2563EB" fontSize={24} fontWeight="bold">‹</Text>
      </Frame>
      <Text fill="#1E293B" fontSize={20} fontWeight="bold" name="MonthTitle">Март 2026</Text>
      <Frame width={40} height={40} radius={100} fill="#F8FAFC" alignX="center" alignY="center" name="NextArrow">
        <Text fill="#2563EB" fontSize={24} fontWeight="bold">›</Text>
      </Frame>
    </Frame>
    <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Weekdays">
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Пн</Text>
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Вт</Text>
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Ср</Text>
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Чт</Text>
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Пт</Text>
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Сб</Text>
      <Text width="fill" fill="#64748B" fontSize={14} fontWeight="medium" alignX="center">Вс</Text>
    </Frame>
    <Frame width="fill" height={320} autoLayout flow="vertical" gap={4} name="DatesGrid">
      <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Row1">
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date1"><Text fill="#1E293B" fontSize={16}>24</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date2"><Text fill="#1E293B" fontSize={16}>25</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date3"><Text fill="#1E293B" fontSize={16}>26</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date4"><Text fill="#1E293B" fontSize={16}>27</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date5"><Text fill="#1E293B" fontSize={16}>28</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date6"><Text fill="#64748B" fontSize={16}>1</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date7"><Text fill="#64748B" fontSize={16}>2</Text></Frame>
      </Frame>
      <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Row2">
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date8"><Text fill="#64748B" fontSize={16}>3</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date9"><Text fill="#64748B" fontSize={16}>4</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date10"><Text fill="#64748B" fontSize={16}>5</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date11"><Text fill="#64748B" fontSize={16}>6</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date12"><Text fill="#64748B" fontSize={16}>7</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date13"><Text fill="#64748B" fontSize={16}>8</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date14"><Text fill="#1E293B" fontSize={16}>9</Text></Frame>
      </Frame>
      <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Row3">
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date15"><Text fill="#1E293B" fontSize={16}>10</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date16"><Text fill="#1E293B" fontSize={16}>11</Text></Frame>
        <Frame width={46} height={46} radius={100} fill="#2563EB" alignX="center" alignY="center" name="SelectedDate"><Text fill="#FFFFFF" fontSize={16} fontWeight="bold">12</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date18"><Text fill="#1E293B" fontSize={16}>13</Text></Frame>
        <Frame width={46} height="hug" autoLayout flow="vertical" alignX="center" alignY="center" gap={2} name="DateWithFlight">
          <Text fill="#1E293B" fontSize={16}>14</Text>
          <Frame width={36} height={18} radius={100} fill="#DBEAFE" alignX="center" alignY="center"><Text fill="#2563EB" fontSize={10} fontWeight="bold">3</Text></Frame>
        </Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date20"><Text fill="#1E293B" fontSize={16}>15</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date21"><Text fill="#1E293B" fontSize={16}>16</Text></Frame>
      </Frame>
      <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Row4">
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date22"><Text fill="#1E293B" fontSize={16}>17</Text></Frame>
        <Frame width={46} height="hug" autoLayout flow="vertical" alignX="center" alignY="center" gap={2} name="DateWithFlight2">
          <Text fill="#1E293B" fontSize={16}>18</Text>
          <Frame width={36} height={18} radius={100} fill="#DBEAFE" alignX="center" alignY="center"><Text fill="#2563EB" fontSize={10} fontWeight="bold">1</Text></Frame>
        </Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date24"><Text fill="#1E293B" fontSize={16}>19</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date25"><Text fill="#1E293B" fontSize={16}>20</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date26"><Text fill="#1E293B" fontSize={16}>21</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date27"><Text fill="#1E293B" fontSize={16}>22</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date28"><Text fill="#1E293B" fontSize={16}>23</Text></Frame>
      </Frame>
      <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Row5">
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date29"><Text fill="#1E293B" fontSize={16}>24</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date30"><Text fill="#1E293B" fontSize={16}>25</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date31"><Text fill="#1E293B" fontSize={16}>26</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date32"><Text fill="#1E293B" fontSize={16}>27</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date33"><Text fill="#1E293B" fontSize={16}>28</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date34"><Text fill="#1E293B" fontSize={16}>29</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date35"><Text fill="#1E293B" fontSize={16}>30</Text></Frame>
      </Frame>
      <Frame width="fill" height="hug" autoLayout flow="horizontal" gap={8} alignX="between" name="Row6">
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date36"><Text fill="#1E293B" fontSize={16}>31</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date37"><Text fill="#64748B" fontSize={16}>1</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date38"><Text fill="#64748B" fontSize={16}>2</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date39"><Text fill="#64748B" fontSize={16}>3</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date40"><Text fill="#64748B" fontSize={16}>4</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date41"><Text fill="#64748B" fontSize={16}>5</Text></Frame>
        <Frame width={46} height={46} radius={100} alignX="center" alignY="center" name="Date42"><Text fill="#64748B" fontSize={16}>6</Text></Frame>
      </Frame>
    </Frame>
  </Frame>
  <Frame width="fill" height="hug" autoLayout flow="vertical" gap={12} padX={16} padY={16} name="FlightsList">
    <Frame width="fill" height="hug" autoLayout flow="horizontal" alignX="between" alignY="center" name="ListHeader">
      <Text fill="#1E293B" fontSize={18} fontWeight="bold">Рейсы на 12 марта</Text>
      <Text fill="#2563EB" fontSize={14} fontWeight="medium">3 рейса</Text>
    </Frame>
    <Frame width="fill" height={96} radius={12} fill="#F8FAFC" stroke="#E2E8F0" strokeWidth={1} autoLayout flow="horizontal" gap={12} padX={12} padY={12} alignX="between" alignY="center" name="Flight1">
      <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={12} alignY="center">
        <Frame width={40} height={40} radius={8} fill="#DBEAFE" alignX="center" alignY="center"><Text fill="#2563EB" fontSize={10} fontWeight="bold">✈️</Text></Frame>
        <Frame width="hug" height="hug" autoLayout flow="vertical" gap={4}>
          <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={8} alignY="center">
            <Text fill="#1E293B" fontSize={16} fontWeight="bold">SVO</Text>
            <Text fill="#64748B" fontSize={14}>→</Text>
            <Text fill="#1E293B" fontSize={16} fontWeight="bold">JFK</Text>
          </Frame>
          <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={8}>
            <Text fill="#64748B" fontSize={12}>14:30</Text>
            <Text fill="#64748B" fontSize={12}>—</Text>
            <Text fill="#64748B" fontSize={12}>18:20</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame width={32} height={32} radius={16} fill="#E2F4EA" alignX="center" alignY="center"><Text fill="#10B981" fontSize={12} fontWeight="bold">✓</Text></Frame>
    </Frame>
    <Frame width="fill" height={96} radius={12} fill="#F8FAFC" stroke="#E2E8F0" strokeWidth={1} autoLayout flow="horizontal" gap={12} padX={12} padY={12} alignX="between" alignY="center" name="Flight2">
      <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={12} alignY="center">
        <Frame width={40} height={40} radius={8} fill="#DBEAFE" alignX="center" alignY="center"><Text fill="#2563EB" fontSize={10} fontWeight="bold">✈️</Text></Frame>
        <Frame width="hug" height="hug" autoLayout flow="vertical" gap={4}>
          <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={8} alignY="center">
            <Text fill="#1E293B" fontSize={16} fontWeight="bold">DME</Text>
            <Text fill="#64748B" fontSize={14}>→</Text>
            <Text fill="#1E293B" fontSize={16} fontWeight="bold">LHR</Text>
          </Frame>
          <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={8}>
            <Text fill="#64748B" fontSize={12}>08:15</Text>
            <Text fill="#64748B" fontSize={12}>—</Text>
            <Text fill="#64748B" fontSize={12}>11:45</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame width={32} height={32} radius={16} fill="#FEF3C7" alignX="center" alignY="center"><Text fill="#F59E0B" fontSize={12} fontWeight="bold">⏱</Text></Frame>
    </Frame>
    <Frame width="fill" height={96} radius={12} fill="#F8FAFC" stroke="#E2E8F0" strokeWidth={1} autoLayout flow="horizontal" gap={12} padX={12} padY={12} alignX="between" alignY="center" name="Flight3">
      <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={12} alignY="center">
        <Frame width={40} height={40} radius={8} fill="#DBEAFE" alignX="center" alignY="center"><Text fill="#2563EB" fontSize={10} fontWeight="bold">✈️</Text></Frame>
        <Frame width="hug" height="hug" autoLayout flow="vertical" gap={4}>
          <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={8} alignY="center">
            <Text fill="#1E293B" fontSize={16} fontWeight="bold">LED</Text>
            <Text fill="#64748B" fontSize={14}>→</Text>
            <Text fill="#1E293B" fontSize={16} fontWeight="bold">CDG</Text>
          </Frame>
          <Frame width="hug" height="hug" autoLayout flow="horizontal" gap={8}>
            <Text fill="#64748B" fontSize={12}>19:40</Text>
            <Text fill="#64748B" fontSize={12}>—</Text>
            <Text fill="#64748B" fontSize={12}>22:10</Text>
          </Frame>
        </Frame>
      </Frame>
      <Frame width={32} height={32} radius={16} fill="#FEE2E2" alignX="center" alignY="center"><Text fill="#EF4444" fontSize={12} fontWeight="bold">⚠</Text></Frame>
    </Frame>
  </Frame>
  <Frame ignoreAutoLayout x={326} y={764} width={56} height={56} radius={100} fill="#2563EB" shadow="button" alignX="center" alignY="center" name="FAB">
    <Text fill="#FFFFFF" fontSize={28} fontWeight="bold" alignX="center">+</Text>
  </Frame>
</Frame>