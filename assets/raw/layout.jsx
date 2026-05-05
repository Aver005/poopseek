<Frame width={1440} height={1024} fill="#0A0A0A" name="Dashboard" autoLayout flow="vertical">
  <Frame width="fill" height="hug" autoLayout flow="horizontal" alignX="between" alignY="center" padX={32} padY={24} name="Header">
    <Text fill="#FFFFFF" fontSize={28} fontWeight="bold" name="Logo">STUDIOS CMS</Text>
    <Frame autoLayout flow="horizontal" gap={32} name="Nav">
      <Text fill="#00F3FF" fontSize={16} fontWeight="medium" name="NavActive">DASHBOARD</Text>
      <Text fill="#A0A0B0" fontSize={16} fontWeight="medium" name="NavEditor">EDITOR</Text>
      <Text fill="#A0A0B0" fontSize={16} fontWeight="medium" name="NavList">STUDIOS</Text>
    </Frame>
  </Frame>
  
  <Frame width="fill" height="hug" autoLayout flow="vertical" padX={32} gap={24} name="StatsSection">
    <Text fill="#FFFFFF" fontSize={20} fontWeight="semibold" name="StatsTitle">KEY METRICS</Text>
    <Frame autoLayout flow="horizontal" gap={24} name="StatsRow">
      <Frame width={280} height={160} fill="#121212" radius={16} stroke="#2A2A3A" strokeWidth={1} autoLayout flow="vertical" padX={24} padY={24} gap={12} name="StatCard1" shadow="modal" dropShadow="0:8:24:0:#00F3FF:0.15">
        <Text fill="#00F3FF" fontSize={14} fontWeight="medium" name="StatLabel">TOTAL STUDIOS</Text>
        <Text fill="#FFFFFF" fontSize={48} fontWeight="bold" name="StatValue">247</Text>
        <Text fill="#A0A0B0" fontSize={12} name="StatTrend">↑ 12% from last month</Text>
      </Frame>
      <Frame width={280} height={160} fill="#121212" radius={16} stroke="#2A2A3A" strokeWidth={1} autoLayout flow="vertical" padX={24} padY={24} gap={12} name="StatCard2" shadow="modal" dropShadow="0:8:24:0:#FF00E0:0.15">
        <Text fill="#FF00E0" fontSize={14} fontWeight="medium" name="StatLabel">ACTIVE EDITS</Text>
        <Text fill="#FFFFFF" fontSize={48} fontWeight="bold" name="StatValue">38</Text>
        <Text fill="#A0A0B0" fontSize={12} name="StatTrend">↑ 5 in progress</Text>
      </Frame>
      <Frame width={280} height={160} fill="#121212" radius={16} stroke="#2A2A3A" strokeWidth={1} autoLayout flow="vertical" padX={24} padY={24} gap={12} name="StatCard3" shadow="modal" dropShadow="0:8:24:0:#FFEE00:0.15">
        <Text fill="#FFEE00" fontSize={14} fontWeight="medium" name="StatLabel">PUBLISHED</Text>
        <Text fill="#FFFFFF" fontSize={48} fontWeight="bold" name="StatValue">189</Text>
        <Text fill="#A0A0B0" fontSize={12} name="StatTrend">↑ 8 this week</Text>
      </Frame>
      <Ellipse width={120} height={120} fill="#00F3FF" opacity={0.15} name="GlowOrb" ignoreAutoLayout x={1100} y={80} dropShadow="0:0:40:#00F3FF:0.4" />
    </Frame>
  </Frame>
  
  <Frame width="fill" height="hug" autoLayout flow="horizontal" padX={32} gap={24} name="MainContent" alignX="start">
    <Frame width={600} height="hug" autoLayout flow="vertical" gap={24} name="LeftColumn">
      <Frame width="fill" height="hug" autoLayout flow="vertical" fill="#121212" radius={24} stroke="#2A2A3A" strokeWidth={1} padX={28} padY={28} gap={20} name="Widget" dropShadow="0:4:20:0:#000000:0.3">
        <Text fill="#FFFFFF" fontSize={18} fontWeight="bold" name="WidgetTitle">RECENT ACTIVITY</Text>
        <Frame autoLayout flow="vertical" gap={16} width="fill" name="ActivityList">
          <Frame autoLayout flow="horizontal" gap={12} alignY="center" name="Activity1" width="fill">
            <Ellipse size={8} fill="#00F3FF" name="Dot" />
            <Text fill="#FFFFFF" fontSize={14} width="fill" name="ActivityText">Studio "Aurora" was published</Text>
            <Text fill="#A0A0B0" fontSize={12} name="ActivityTime">2h ago</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={12} alignY="center" name="Activity2" width="fill">
            <Ellipse size={8} fill="#FF00E0" name="Dot" />
            <Text fill="#FFFFFF" fontSize={14} width="fill" name="ActivityText">New editor joined "Nebula"</Text>
            <Text fill="#A0A0B0" fontSize={12} name="ActivityTime">5h ago</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={12} alignY="center" name="Activity3" width="fill">
            <Ellipse size={8} fill="#FFEE00" name="Dot" />
            <Text fill="#FFFFFF" fontSize={14} width="fill" name="ActivityText">Asset pack "Cyber" uploaded</Text>
            <Text fill="#A0A0B0" fontSize={12} name="ActivityTime">Yesterday</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={12} alignY="center" name="Activity4" width="fill">
            <Ellipse size={8} fill="#A0A0B0" name="Dot" />
            <Text fill="#FFFFFF" fontSize={14} width="fill" name="ActivityText">Template "Glitch" created</Text>
            <Text fill="#A0A0B0" fontSize={12} name="ActivityTime">Yesterday</Text>
          </Frame>
        </Frame>
      </Frame>
      
      <Frame width="fill" height={320} fill="#121212" radius={24} stroke="#2A2A3A" strokeWidth={1} autoLayout flow="vertical" padX={28} padY={28} gap={16} name="ChartWidget" dropShadow="0:4:20:0:#000000:0.3">
        <Text fill="#FFFFFF" fontSize={18} fontWeight="bold" name="ChartTitle">PERFORMANCE</Text>
        <Frame width="fill" height={180} name="ChartArea" autoLayout flow="horizontal" gap={32} alignX="center" alignY="center">
          <Frame width="fill" height="fill" name="BarGroup" autoLayout flow="horizontal" gap={16} alignX="center" alignY="end">
            <Frame width={40} height={120} fill="#00F3FF" radius={8} name="Bar1" />
            <Frame width={40} height={160} fill="#FF00E0" radius={8} name="Bar2" />
            <Frame width={40} height={90} fill="#FFEE00" radius={8} name="Bar3" />
            <Frame width={40} height={140} fill="#A0A0B0" radius={8} name="Bar4" />
            <Frame width={40} height={110} fill="#00F3FF" radius={8} name="Bar5" />
          </Frame>
        </Frame>
        <Frame autoLayout flow="horizontal" gap={24} width="fill" alignX="center" name="Legend">
          <Frame autoLayout flow="horizontal" gap={8} alignY="center" name="Legend1">
            <Ellipse size={10} fill="#00F3FF" name="LegendDot1" />
            <Text fill="#A0A0B0" fontSize={12} name="LegendText1">Views</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={8} alignY="center" name="Legend2">
            <Ellipse size={10} fill="#FF00E0" name="LegendDot2" />
            <Text fill="#A0A0B0" fontSize={12} name="LegendText2">Edits</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={8} alignY="center" name="Legend3">
            <Ellipse size={10} fill="#FFEE00" name="LegendDot3" />
            <Text fill="#A0A0B0" fontSize={12} name="LegendText3">Shares</Text>
          </Frame>
        </Frame>
      </Frame>
    </Frame>
    
    <Frame width={520} height="hug" autoLayout flow="vertical" gap={24} name="RightColumn">
      <Frame width="fill" height="hug" autoLayout flow="vertical" fill="#121212" radius={24} stroke="#2A2A3A" strokeWidth={1} padX={28} padY={28} gap={20} name="TopStudios" dropShadow="0:4:20:0:#000000:0.3">
        <Text fill="#FFFFFF" fontSize={18} fontWeight="bold" name="TopTitle">TOP STUDIOS</Text>
        <Frame autoLayout flow="vertical" gap={16} width="fill" name="StudioList">
          <Frame autoLayout flow="horizontal" gap={16} alignY="center" name="StudioItem1" width="fill">
            <Frame width={40} height={40} radius={12} fill="#00F3FF" name="StudioIcon1" center>
              <Text fill="#0A0A0A" fontSize={18} fontWeight="bold">A</Text>
            </Frame>
            <Text fill="#FFFFFF" fontSize={16} width="fill" name="StudioName1">Aurora Studio</Text>
            <Text fill="#00F3FF" fontSize={14} fontWeight="medium" name="StudioScore1">98</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={16} alignY="center" name="StudioItem2" width="fill">
            <Frame width={40} height={40} radius={12} fill="#FF00E0" name="StudioIcon2" center>
              <Text fill="#FFFFFF" fontSize={18} fontWeight="bold">N</Text>
            </Frame>
            <Text fill="#FFFFFF" fontSize={16} width="fill" name="StudioName2">Nebula Collective</Text>
            <Text fill="#FF00E0" fontSize={14} fontWeight="medium" name="StudioScore2">94</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={16} alignY="center" name="StudioItem3" width="fill">
            <Frame width={40} height={40} radius={12} fill="#FFEE00" name="StudioIcon3" center>
              <Text fill="#0A0A0A" fontSize={18} fontWeight="bold">V</Text>
            </Frame>
            <Text fill="#FFFFFF" fontSize={16} width="fill" name="StudioName3">Void Labs</Text>
            <Text fill="#FFEE00" fontSize={14} fontWeight="medium" name="StudioScore3">89</Text>
          </Frame>
          <Frame autoLayout flow="horizontal" gap={16} alignY="center" name="StudioItem4" width="fill">
            <Frame width={40} height={40} radius={12} fill="#A0A0B0" name="StudioIcon4" center>
              <Text fill="#0A0A0A" fontSize={18} fontWeight="bold">C</Text>
            </Frame>
            <Text fill="#FFFFFF" fontSize={16} width="fill" name="StudioName4">Cyberpulse</Text>
            <Text fill="#A0A0B0" fontSize={14} fontWeight="medium" name="StudioScore4">85</Text>
          </Frame>
        </Frame>
      </Frame>
      
      <Frame width="fill" height="hug" autoLayout flow="vertical" fill="#121212" radius={24} stroke="#2A2A3A" strokeWidth={1} padX={28} padY={28} gap={16} name="AlertWidget" dropShadow="0:4:20:0:#000000:0.3">
        <Text fill="#FF00E0" fontSize={16} fontWeight="bold" name="AlertTitle">SYSTEM ALERT</Text>
        <Frame autoLayout flow="horizontal" gap={16} name="AlertContent" alignY="center">
          <Frame width={4} height={40} fill="#FF00E0" radius={2} name="AlertBar" />
          <Text fill="#FFFFFF" fontSize={14} name="AlertText">Server maintenance scheduled for 02:00 UTC</Text>
        </Frame>
        <Frame width="fill" height={2} fill="#2A2A3A" name="Divider" />
        <Text fill="#00F3FF" fontSize={14} fontWeight="medium" name="AlertLink">VIEW DETAILS →</Text>
      </Frame>
    </Frame>
  </Frame>
  
  <Ellipse width={300} height={300} fill="#FF00E0" opacity={0.08} name="BgBlob1" ignoreAutoLayout x={-50} y={700} dropShadow="0:0:80:#FF00E0:0.3" />
  <Ellipse width={200} height={200} fill="#00F3FF" opacity={0.08} name="BgBlob2" ignoreAutoLayout x={1200} y={600} dropShadow="0:0:80:#00F3FF:0.3" />
</Frame>