<Frame width={1920} height={1080} fill="#0A0A0F" name="CS2 HUD Overlay">

  {/* TOP-LEFT: Round Timer & Bomb Status */}
  <Frame ignoreAutoLayout x={24} y={24} width="fill" height="hug" autoLayout flow="horizontal" gap={16} name="TopLeftPanel">
    <Frame autoLayout flow="vertical" width="hug" height="hug" fill="#14141C" radius={8} padX={16} padY={12} gap={4} stroke="#2A2A35" strokeWidth={1}>
      <Text fill="#E8E8EE" fontSize={20} fontWeight="bold" letterSpacing={2}>01:24</Text>
      <Text fill="#00FF41" fontSize={14} fontWeight="medium">BOMB ACTIVE</Text>
    </Frame>
    <Frame autoLayout flow="horizontal" width="hug" height="hug" fill="#14141C" radius={8} padX={16} padY={12} gap={8}>
      <Ellipse width={12} height={12} fill="#FF4D4D" />
      <Text fill="#E8E8EE" fontSize={16} fontWeight="medium">Terrorists</Text>
      <Text fill="#00D93A" fontSize={16} fontWeight="bold">3</Text>
      <Text fill="#8A8A9A" fontSize={16}>:</Text>
      <Text fill="#E8E8EE" fontSize={16} fontWeight="bold">5</Text>
      <Ellipse width={12} height={12} fill="#00D93A" />
      <Text fill="#E8E8EE" fontSize={16} fontWeight="medium">CT</Text>
    </Frame>
  </Frame>

  {/* TOP-RIGHT: Kill Feed */}
  <Frame ignoreAutoLayout x={1392} y={24} width={504} height="hug" autoLayout flow="vertical" gap={8} name="KillFeed">
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="end" gap={12} padX={12} padY={8} fill="#14141C" radius={4} stroke="#2A2A35" strokeWidth={1}>
      <Text fill="#00FF41" fontSize={14} fontWeight="bold">PlayerOne</Text>
      <Text fill="#E8E8EE" fontSize={14}>🔫</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold">EnemyKiller</Text>
    </Frame>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="end" gap={12} padX={12} padY={8} fill="#14141C" radius={4} opacity={0.85}>
      <Text fill="#00FF41" fontSize={14} fontWeight="bold">SniperPro</Text>
      <Text fill="#E8E8EE" fontSize={14}>🔪</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold">Shadow</Text>
    </Frame>
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="end" gap={12} padX={12} padY={8} fill="#14141C" radius={4} opacity={0.7}>
      <Text fill="#00FF41" fontSize={14} fontWeight="bold">RushB</Text>
      <Text fill="#E8E8EE" fontSize={14}>💥</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold">AWPer</Text>
    </Frame>
  </Frame>

  {/* BOTTOM-LEFT: Radar Map (Circular) */}
  <Frame ignoreAutoLayout x={24} y={856} width={220} height={220} radius={110} fill="#14141C" stroke="#2A2A35" strokeWidth={2} shadow="modal" name="RadarMap">
    <Ellipse width={200} height={200} fill="#1A1A24" radius={100} />
    {/* Center point */}
    <Ellipse ignoreAutoLayout x={100} y={100} width={8} height={8} fill="#00FF41" />
    {/* Player dots */}
    <Ellipse ignoreAutoLayout x={60} y={80} width={10} height={10} fill="#00D93A" stroke="#0A0A0F" strokeWidth={2} />
    <Ellipse ignoreAutoLayout x={140} y={120} width={10} height={10} fill="#00D93A" stroke="#0A0A0F" strokeWidth={2} />
    <Ellipse ignoreAutoLayout x={85} y={150} width={10} height={10} fill="#FF4D4D" stroke="#0A0A0F" strokeWidth={2} />
    {/* Bomb plant zone */}
    <Frame ignoreAutoLayout x={70} y={70} width={60} height={60} stroke="#00FF41" strokeWidth={2} radius={4} opacity={0.6} />
    <Text ignoreAutoLayout x={90} y={95} fill="#00FF41" fontSize={10} fontWeight="bold">BOMB</Text>
  </Frame>

  {/* BOTTOM-CENTER: Health, Armor & Weapon Info */}
  <Frame ignoreAutoLayout x={560} y={1008} width={800} height="hug" autoLayout flow="vertical" gap={8} name="CombatHUD">
    
    {/* Health Bar */}
    <Frame autoLayout flow="vertical" width={800} height="hug" gap={4}>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between">
        <Text fill="#E8E8EE" fontSize={12} fontWeight="bold">HEALTH</Text>
        <Text fill="#00FF41" fontSize={12} fontWeight="bold">100</Text>
      </Frame>
      <Frame width={800} height={12} fill="#2A2A35" radius={100}>
        <Frame width={720} height={12} fill="#FF3B3B" radius={100} gradient="#FF3B3B:#FF0000:90" />
      </Frame>
    </Frame>

    {/* Armor Bar */}
    <Frame autoLayout flow="vertical" width={800} height="hug" gap={4}>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between">
        <Text fill="#E8E8EE" fontSize={12} fontWeight="bold">ARMOR</Text>
        <Text fill="#E8E8EE" fontSize={12}>85</Text>
      </Frame>
      <Frame width={800} height={8} fill="#2A2A35" radius={100}>
        <Frame width={680} height={8} fill="#F4B400" radius={100} />
      </Frame>
    </Frame>

    {/* Weapon & Ammo */}
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" alignY="center" gap={16}>
      <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={12} fill="#14141C" radius={8} padX={16} padY={12} stroke="#2A2A35" strokeWidth={1}>
        <Text fill="#E8E8EE" fontSize={24} fontWeight="bold">AK-47</Text>
        <Text fill="#00FF41" fontSize={32} fontWeight="bold">30</Text>
        <Text fill="#8A8A9A" fontSize={20}>/</Text>
        <Text fill="#E8E8EE" fontSize={24}>90</Text>
      </Frame>
      <Frame autoLayout flow="horizontal" width="hug" height="hug" gap={8} fill="#14141C" radius={8} padX={12} padY={8}>
        <Ellipse width={24} height={24} fill="#00D93A" />
        <Text fill="#E8E8EE" fontSize={14}>Fire Mode: Auto</Text>
      </Frame>
    </Frame>
  </Frame>

  {/* BOTTOM-RIGHT: Equipment (Grenades, Defuse Kit) */}
  <Frame ignoreAutoLayout x={1640} y={960} width={256} height="hug" autoLayout flow="vertical" gap={8} name="Equipment">
    
    <Frame autoLayout flow="horizontal" width="fill" height="hug" gap={12} alignX="end">
      <Frame width={56} height={56} fill="#14141C" radius={12} stroke="#2A2A35" strokeWidth={1} center>
        <Text fill="#E8E8EE" fontSize={28}>💣</Text>
      </Frame>
      <Frame width={56} height={56} fill="#14141C" radius={12} stroke="#2A2A35" strokeWidth={1} center>
        <Text fill="#E8E8EE" fontSize={28}>🔥</Text>
      </Frame>
      <Frame width={56} height={56} fill="#14141C" radius={12} stroke="#2A2A35" strokeWidth={1} center>
        <Text fill="#E8E8EE" fontSize={28}>💨</Text>
      </Frame>
      <Frame width={56} height={56} fill="#00D93A" radius={12} center opacity={0.9}>
        <Text fill="#0A0A0F" fontSize={24}>🛠️</Text>
      </Frame>
    </Frame>
    
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="end" gap={8}>
      <Text fill="#8A8A9A" fontSize={12}>DEFUSE KIT</Text>
      <Text fill="#00FF41" fontSize={12} fontWeight="bold">EQUIPPED</Text>
    </Frame>
  </Frame>

  {/* SCOREBOARD (Translucent Dark Panel) - triggered state, overlay style */}
  <Frame ignoreAutoLayout x={360} y={140} width={1200} height={600} fill="#14141C" opacity={0.92} radius={12} stroke="#2A2A35" strokeWidth={1} shadow="modal" name="Scoreboard">
    
    {/* Header Row */}
    <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between" padX={24} padY={16} stroke="#2A2A35" strokeWidth={1}>
      <Text fill="#00FF41" fontSize={14} fontWeight="bold" width={200}>PLAYER</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold" width={80} alignX="center">K</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold" width={80} alignX="center">D</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold" width={80} alignX="center">A</Text>
      <Text fill="#E8E8EE" fontSize={14} fontWeight="bold" width={120} alignX="center">SCORE</Text>
    </Frame>

    {/* Team Terrorist */}
    <Frame autoLayout flow="vertical" width="fill" height="hug" padX={24} gap={8}>
      <Text fill="#FF4D4D" fontSize={12} fontWeight="bold" padY={8}>TERRORISTS</Text>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between">
        <Text fill="#E8E8EE" fontSize={14} width={200}>PlayerOne</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">15</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">8</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">4</Text>
        <Text fill="#00FF41" fontSize={14} fontWeight="bold" width={120} alignX="center">2430</Text>
      </Frame>
      <Line length="fill" stroke="#2A2A35" strokeWidth={1} />
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between">
        <Text fill="#E8E8EE" fontSize={14} width={200}>SniperPro</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">12</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">10</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">3</Text>
        <Text fill="#E8E8EE" fontSize={14} width={120} alignX="center">1980</Text>
      </Frame>
    </Frame>

    {/* Team CT */}
    <Frame autoLayout flow="vertical" width="fill" height="hug" padX={24} padY={16} gap={8}>
      <Text fill="#00D93A" fontSize={12} fontWeight="bold">COUNTER-TERRORISTS</Text>
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between">
        <Text fill="#E8E8EE" fontSize={14} width={200}>EnemyKiller</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">18</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">6</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">5</Text>
        <Text fill="#00FF41" fontSize={14} fontWeight="bold" width={120} alignX="center">3210</Text>
      </Frame>
      <Line length="fill" stroke="#2A2A35" strokeWidth={1} />
      <Frame autoLayout flow="horizontal" width="fill" height="hug" alignX="between">
        <Text fill="#E8E8EE" fontSize={14} width={200}>AWPer</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">14</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">7</Text>
        <Text fill="#E8E8EE" fontSize={14} width={80} alignX="center">6</Text>
        <Text fill="#E8E8EE" fontSize={14} width={120} alignX="center">2750</Text>
      </Frame>
    </Frame>
  </Frame>

  {/* Neon accent lines on active elements (minimal) */}
  <Frame ignoreAutoLayout x={0} y={0} width={4} height={1080} fill="#00FF41" opacity={0.15} />
  <Frame ignoreAutoLayout x={1916} y={0} width={4} height={1080} fill="#00FF41" opacity={0.15} />

</Frame>