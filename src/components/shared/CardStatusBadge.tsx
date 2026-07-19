/**
 * CardStatusBadge
 *
 * Informational lifecycle-status chip for a card (active / inactive / expired /
 * archived). This is a lifecycle indicator, NOT a scan/action/validation
 * outcome, so it deliberately uses NEUTRAL chrome tokens (shadcn `secondary`
 * variant) and never the reserved `--state-*` colours (constraint #18). Every
 * status carries an icon + label, so it stays legible without colour.
 */

import { Archive, CircleCheck, CircleSlash, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LifecycleStatus } from "@/lib/dal";

const TEXT: Record<LifecycleStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  expired: "Expirado",
  archived: "Archivado",
};

const ICON: Record<LifecycleStatus, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  active: CircleCheck,
  inactive: CircleSlash,
  expired: Clock,
  archived: Archive,
};

interface CardStatusBadgeProps {
  status: LifecycleStatus;
  className?: string;
}

export default function CardStatusBadge({ status, className }: CardStatusBadgeProps) {
  const Icon = ICON[status];
  return (
    <Badge variant="secondary" className={cn("gap-1.5", className)}>
      <Icon aria-hidden className="size-3" strokeWidth={2} />
      {TEXT[status]}
    </Badge>
  );
}
