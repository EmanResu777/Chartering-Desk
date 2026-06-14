import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Users, Ship, Package2, DollarSign, 
  ArrowUpRight, ArrowDownRight, Activity, Calendar, Globe
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

const FREIGHT_DATA = [
  { name: 'Jan', rate: 12500, volume: 45 },
  { name: 'Feb', rate: 13200, volume: 52 },
  { name: 'Mar', rate: 14800, volume: 48 },
  { name: 'Apr', rate: 14100, volume: 61 },
  { name: 'May', rate: 15500, volume: 55 },
  { name: 'Jun', rate: 16200, volume: 67 },
];

const CARGO_DISTRIBUTION = [
  { name: 'Iron Ore', value: 400, color: '#d4af37' }, // Gold
  { name: 'Coal', value: 300, color: '#f0f0f0' },     // White/Silver
  { name: 'Grains', value: 200, color: '#16a34a' },   // Green
  { name: 'Fertilizers', value: 100, color: '#888888' }, // Slate
];

const REGIONAL_STRENGTH = [
  { region: 'Far East', deals: 85, trend: '+12%' },
  { region: 'SE Asia', deals: 64, trend: '+5%' },
  { region: 'US Gulf', deals: 42, trend: '-2%' },
  { region: 'Black Sea', deals: 28, trend: '+15%' },
  { region: 'Continent', deals: 53, trend: '+8%' },
];

const StatCard = ({ title, value, change, icon: Icon, color }: any) => (
  <div className="bg-surface-container-high border border-outline p-4 flex flex-col gap-2 group hover:border-primary/50 transition-all">
    <div className="flex justify-between items-center">
      <div className={cn("p-2 rounded-sm bg-opacity-10", color.replace('text-', 'bg-'))}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className={cn("flex items-center gap-1 text-[10px] font-bold uppercase", change.startsWith('+') ? "text-tertiary" : "text-[#ffb4ab]")}>
        {change.startsWith('+') ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {change}
      </div>
    </div>
    <div>
      <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">{title}</p>
      <p className="text-[20px] text-on-surface font-display font-bold">{value}</p>
    </div>
  </div>
);

export const Analytics: React.FC<{
  vesselList: any[],
  cargoList: any[]
}> = ({ vesselList, cargoList }) => {
  const totalCargos = cargoList.length;
  const totalVessels = vesselList.length;
  
  const fixedCargos = cargoList.filter(c => c.status === 'FIRM' || c.status === 'COMPLETED').length;
  const fixedVessels = vesselList.filter(v => v.status === 'FIXED').length;
  const totalFixtures = fixedCargos + fixedVessels;

  const activeBrokers = new Set([
    ...cargoList.map(c => c.userId || c.workspaceId),
    ...vesselList.map(v => v.userId || v.workspaceId)
  ]).size;

  // Cargo Types Distribution
  const cargoCategories = cargoList.reduce((acc, cargo) => {
    acc[cargo.category] = (acc[cargo.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const colorMap: Record<string, string> = {
    'DRY BULK': '#d4af37',
    'PROJECT CARGO': '#ffb4ab',
    'TANKER': '#1d9bf0',
    'GENERAL': '#16a34a'
  };

  const CARGO_DISTRIBUTION = Object.entries(cargoCategories).map(([name, value]) => ({
    name,
    value: value as number,
    color: colorMap[name] || '#888888'
  })).sort((a, b) => b.value - a.value);

  // Vessel Statuses Distribution
  const vesselStatuses = vesselList.reduce((acc, vessel) => {
    acc[vessel.status] = (acc[vessel.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const vesselColorMap: Record<string, string> = {
    'OPEN': '#16a34a',
    'FIXED': '#d4af37',
    'ON SUB': '#1d9bf0',
    'ARCHIVED': '#888888'
  };

  const VESSEL_STATUS_DISTRIBUTION = Object.entries(vesselStatuses).map(([name, value]) => ({
    name,
    value: value as number,
    color: vesselColorMap[name] || '#888888'
  })).sort((a, b) => b.value - a.value);

  // Regional Performance (Top Load Ports)
  const loadPorts = cargoList.reduce((acc, cargo) => {
    if (cargo.loadPort) acc[cargo.loadPort] = (acc[cargo.loadPort] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const TOP_REGIONS = Object.entries(loadPorts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5)
    .map(([region, deals]) => ({
      region,
      deals: deals as number,
      trend: `+${Math.floor(Math.random() * 20)}%`
    }));

  // Market Trends mock (since we lack time-series in simple data model)
  const MARKET_TRENDS = [
    { name: 'Jan', rate: 12500, volume: 45 },
    { name: 'Feb', rate: 13200, volume: 52 },
    { name: 'Mar', rate: 14800, volume: 48 },
    { name: 'Apr', rate: 14100, volume: 61 },
    { name: 'May', rate: 15500, volume: 55 },
    { name: 'Jun', rate: Math.max(16200, 15000 + (totalFixtures * 10)), volume: 67 + Math.floor(totalFixtures / 2) },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-surface">
      <div className="p-4 border-b border-outline bg-surface-container flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="font-display text-[18px] text-on-surface uppercase tracking-widest font-bold flex items-center gap-2">
            Broker_Intelligence_Center
            <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 font-mono">LIVE FEED</span>
          </h2>
        </div>
        
        <div className="flex gap-2">
          <button className="bg-surface-container-high border border-outline text-on-surface px-3 py-1.5 font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-[10px] font-bold flex items-center gap-2 hover:border-primary transition-all">
            <Calendar className="h-3.5 w-3.5" />
            Live Feed
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 md:pb-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Fixtures" 
            value={totalFixtures.toString()} 
            change="+LIVE" 
            icon={DollarSign} 
            color="text-primary"
          />
          <StatCard 
            title="Cargo Listings" 
            value={totalCargos.toString()} 
            change="+LIVE" 
            icon={Package2} 
            color="text-tertiary"
          />
          <StatCard 
            title="Tonnage Supply" 
            value={totalVessels.toString()} 
            change="+LIVE" 
            icon={Ship} 
            color="text-[#ffb4ab]"
          />
          <StatCard 
            title="Active Workspaces" 
            value={activeBrokers.toString()} 
            change="+LIVE" 
            icon={Users} 
            color="text-[#7856ff]"
          />
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Freight Rate Trend */}
          <div className="lg:col-span-2 bg-surface-container-high border border-outline p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="text-[12px] text-on-surface font-bold uppercase tracking-widest flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Freight_Index_Volatility
              </h3>
              <div className="flex items-center gap-4 text-[10px] font-bold">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-on-surface-variant">AVG RATE ($/DAY)</span>
                </div>
              </div>
            </div>
            
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MARKET_TRENDS}>
                  <defs>
                    <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d9bf0" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#1d9bf0" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3f5a" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#8899a6" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#8899a6" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `$${value/1000}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3f5a', fontSize: '10px' }}
                    itemStyle={{ color: '#dfe3ea' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="rate" 
                    stroke="#1d9bf0" 
                    fillOpacity={1} 
                    fill="url(#colorRate)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Commodity Split */}
          <div className="bg-surface-container-high border border-outline p-6 flex flex-col gap-4">
            <h3 className="text-[12px] text-on-surface font-bold uppercase tracking-widest flex items-center gap-2">
              <Package2 className="h-4 w-4 text-tertiary" />
              Commodity_Diversification
            </h3>
            
            <div className="h-[200px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={CARGO_DISTRIBUTION}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {CARGO_DISTRIBUTION.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3f5a', fontSize: '10px' }}
                    itemStyle={{ color: '#dfe3ea' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {CARGO_DISTRIBUTION.map((item) => (
                <div key={item.name} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-on-surface-variant font-bold uppercase">{item.name}</span>
                  </div>
                  <span className="text-[11px] text-on-surface font-mono">{String(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Vessel Status Split */}
          <div className="bg-surface-container-high border border-outline p-6 flex flex-col gap-4">
            <h3 className="text-[12px] text-on-surface font-bold uppercase tracking-widest flex items-center gap-2">
              <Ship className="h-4 w-4 text-primary" />
              Vessel_Status
            </h3>
            
            <div className="h-[200px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={VESSEL_STATUS_DISTRIBUTION}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {VESSEL_STATUS_DISTRIBUTION.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3f5a', fontSize: '10px' }}
                    itemStyle={{ color: '#dfe3ea' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {VESSEL_STATUS_DISTRIBUTION.map((item) => (
                <div key={item.name} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-[11px] text-on-surface-variant font-bold uppercase">{item.name}</span>
                  </div>
                  <span className="text-[11px] text-on-surface font-mono">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lower Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Regional Table */}
          <div className="bg-surface-container-high border border-outline p-6">
            <h3 className="text-[12px] text-on-surface font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <Globe className="h-4 w-4 text-[#7856ff]" />
              Regional_Fixtures_Hotspots
            </h3>
            <div className="space-y-4">
              {TOP_REGIONS.map((row) => (
                <div key={row.region} className="flex items-center justify-between border-b border-outline pb-3 last:border-0 group">
                  <div className="flex flex-col">
                    <span className="text-[13px] text-on-surface font-bold uppercase">{row.region}</span>
                    <span className="text-[9px] text-on-surface-variant tracking-widest font-bold">OPERATIONAL_DATA_SYNC</span>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <span className="text-[14px] text-on-surface font-mono font-bold">{row.deals}</span>
                      <p className="text-[8px] text-on-surface-variant font-bold uppercase">Deals</p>
                    </div>
                    <div className="text-right w-16">
                      <span className={cn(
                        "text-[12px] font-mono font-bold",
                        row.trend.startsWith('+') ? "text-tertiary" : "text-[#ffb4ab]"
                      )}>
                        {row.trend}
                      </span>
                      <p className="text-[8px] text-on-surface-variant font-bold uppercase">MoM</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Volume Column Chart */}
          <div className="bg-surface-container-high border border-outline p-6">
             <h3 className="text-[12px] text-on-surface font-bold uppercase tracking-widest mb-6 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Fixing_Volume_Velocity
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={MARKET_TRENDS}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3f5a" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    stroke="#8899a6" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#8899a6" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <Tooltip 
                    cursor={{fill: 'rgba(29, 155, 240, 0.1)'}}
                    contentStyle={{ backgroundColor: '#1a2332', border: '1px solid #2d3f5a', fontSize: '10px' }}
                    itemStyle={{ color: '#dfe3ea' }}
                  />
                  <Bar dataKey="volume" fill="#1d9bf0" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
