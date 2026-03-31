// DASHBOARD CARD: Reusable card for displaying summary metrics on the dashboard.
//
// Usage:
//   <DashboardCard
//     title="Pending Tasks"
//     value={42}
//     subtitle="out of 100 total"
//     href="/tasks?status=pending"
//     variant="warning"
//   />

'use client';

import Link from 'next/link';

interface DashboardCardProps {
  /** Card heading text */
  title: string;
  /** Primary metric value */
  value: number | string;
  /** Optional smaller text below the value */
  subtitle?: string;
  /** Optional link — makes the entire card clickable */
  href?: string;
  /** Color variant for the value: default (gray), success (green), warning (amber), info (blue) */
  variant?: 'default' | 'success' | 'warning' | 'info';
}

const VARIANT_CLASSES: Record<string, string> = {
  default: 'text-gray-700',
  success: 'text-green-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
};

export function DashboardCard({ title, value, subtitle, href, variant = 'default' }: DashboardCardProps) {
  const content = (
    <>
      <h3 className="text-sm font-medium text-gray-600">{title}</h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${VARIANT_CLASSES[variant]}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>
      {subtitle && (
        <div className="mt-1 text-sm text-gray-400">{subtitle}</div>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      {content}
    </div>
  );
}
