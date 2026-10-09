import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Scale, Dumbbell, Moon, Apple, Pill, Calendar,
  Settings, Users, ChefHat, Ellipsis, Smile,
} from 'lucide-react'

export interface NavItem {
  to: string
  icon: LucideIcon
  label: string
}

// Vollständige Navigation (Desktop-Seitenleiste)
export const clientNav: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/weight', icon: Scale, label: 'Gewicht' },
  { to: '/training', icon: Dumbbell, label: 'Training' },
  { to: '/sleep', icon: Moon, label: 'Schlaf' },
  { to: '/nutrition', icon: Apple, label: 'Ernährung' },
  { to: '/rezepte', icon: ChefHat, label: 'Rezepte' },
  { to: '/supplements', icon: Pill, label: 'Supplements' },
  { to: '/calendar', icon: Calendar, label: 'Kalender' },
  { to: '/charakter', icon: Smile, label: 'Deine Figur' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
]

export const coachNav: NavItem[] = [
  { to: '/coach', icon: Users, label: 'Meine Klienten' },
  { to: '/calendar', icon: Calendar, label: 'Kalender' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
]

// Mobile Tab-Bar: je zwei Tabs links und rechts vom Schnellzugriff-Button
export const MORE_TAB: NavItem = { to: '/more', icon: Ellipsis, label: 'Mehr' }

export const clientTabs: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { to: '/training', icon: Dumbbell, label: 'Training' },
  ],
  right: [
    { to: '/nutrition', icon: Apple, label: 'Ernährung' },
    MORE_TAB,
  ],
}

export const coachTabs: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { to: '/coach', icon: Users, label: 'Klienten' },
    { to: '/calendar', icon: Calendar, label: 'Kalender' },
  ],
  right: [MORE_TAB],
}

// Seiten, die nicht in der Tab-Bar stehen, landen auf „Mehr“
export function moreItems(nav: NavItem[], tabs: { left: NavItem[]; right: NavItem[] }): NavItem[] {
  const inTabs = new Set([...tabs.left, ...tabs.right].map(t => t.to))
  return nav.filter(n => !inTabs.has(n.to))
}

// Schnellzugriff (FAB): nur Links auf bestehende Seiten
export const quickActions: (NavItem & { hint: string })[] = [
  { to: '/weight', icon: Scale, label: 'Gewicht', hint: 'Wiegen & Fotos' },
  { to: '/sleep', icon: Moon, label: 'Schlaf', hint: 'Nacht eintragen' },
  { to: '/nutrition', icon: Apple, label: 'Mahlzeit', hint: 'Essen erfassen' },
  { to: '/training', icon: Dumbbell, label: 'Training', hint: 'Einheit starten' },
]
