'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Users,
  Layers,
  ShieldCheck,
  MessageSquare,
  FileText,
  AlertCircle,
  Database,
  Zap,
  Terminal,
  Clock,
} from '@/components/icons';

const NAV: { section: string; items: { href: string; label: string; icon: any }[] }[] = [
  {
    section: 'Overview',
    items: [{ href: '/', label: 'Command Center', icon: Activity }],
  },
  {
    section: 'Work',
    items: [
      { href: '/work', label: 'Tasks', icon: Layers },
      { href: '/evidence', label: 'Evidence & Verification', icon: ShieldCheck },
    ],
  },
  {
    section: 'Team',
    items: [{ href: '/agents', label: 'Agents', icon: Users }],
  },
  {
    section: 'Communication',
    items: [
      { href: '/chat', label: 'Threads & Chat', icon: MessageSquare },
      { href: '/announcements', label: 'Announcements', icon: FileText },
      { href: '/standups', label: 'Standups', icon: Clock },
    ],
  },
  {
    section: 'Governance',
    items: [
      { href: '/proposals', label: 'Proposals', icon: FileText },
      { href: '/incidents', label: 'Incidents', icon: AlertCircle },
      { href: '/human', label: 'Human Attention', icon: AlertCircle },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/bridge', label: 'DeployFleet Bridge', icon: Database },
      { href: '/phase5', label: 'Governance Console', icon: Terminal },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-60 shrink-0 h-screen sticky top-0 overflow-y-auto bg-slate-950 border-r border-slate-800 py-5 px-3 hidden md:block">
      <div className="px-2 mb-6">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-sm tracking-wide">
          <Zap width={16} height={16} className="text-blue-400" />
          CREATIVESITES AI
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">MyaOS v3.0 · Meridian</div>
      </div>

      {NAV.map((group) => (
        <div key={group.section} className="mb-5">
          <div className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold px-2 mb-1.5">
            {group.section}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-500/10 text-blue-300'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <Icon width={14} height={14} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
