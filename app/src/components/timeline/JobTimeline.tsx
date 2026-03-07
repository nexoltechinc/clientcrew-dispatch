import { useState } from 'react';
import { ChevronDown, ChevronRight, User, Bot, Wrench, FileText, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuditEvent, AuditEventType } from '@/types';

interface JobTimelineProps {
  events: AuditEvent[];
}

const eventTypeConfig: Record<AuditEventType, { label: string; icon: React.ElementType; color: string }> = {
  MESSAGE_RECEIVED: { label: 'Message Received', icon: FileText, color: 'text-gray-500' },
  PARSED: { label: 'Parsed', icon: Bot, color: 'text-sky-500' },
  PENDING_REVIEW: { label: 'Pending Review', icon: AlertCircle, color: 'text-amber-500' },
  TECH_ACCEPTED: { label: 'Tech Accepted', icon: CheckCircle, color: 'text-emerald-500' },
  STATUS_CHANGED: { label: 'Status Changed', icon: Clock, color: 'text-sky-500' },
  INVOICE_APPROVAL_REQUESTED: { label: 'Approval Requested', icon: FileText, color: 'text-amber-500' },
  INVOICE_APPROVED: { label: 'Invoice Approved', icon: CheckCircle, color: 'text-emerald-500' },
  TASK_CREATED: { label: 'Task Created', icon: Wrench, color: 'text-sky-500' },
  TASK_RESULT: { label: 'Task Result', icon: CheckCircle, color: 'text-emerald-500' },
  INVOICE_CREATED: { label: 'Invoice Created', icon: FileText, color: 'text-emerald-500' },
  VERIFICATION_RUN: { label: 'Verification Run', icon: CheckCircle, color: 'text-emerald-500' },
  TECH_ASSIGNED: { label: 'Tech Assigned', icon: User, color: 'text-sky-500' },
  TECH_REASSIGNED: { label: 'Tech Reassigned', icon: User, color: 'text-amber-500' },
  JOB_CANCELLED: { label: 'Job Cancelled', icon: AlertCircle, color: 'text-rose-500' },
  JOB_UPDATED: { label: 'Job Updated', icon: Clock, color: 'text-sky-500' },
  INVOICE_CREATION_FAILED: { label: 'Invoice Failed', icon: AlertCircle, color: 'text-rose-500' },
  MANUAL_VERIFICATION_REQUIRED: { label: 'Manual Verification', icon: AlertCircle, color: 'text-rose-500' },
};

const actorTypeLabels: Record<string, string> = {
  SYSTEM: 'System',
  ADMIN: 'Admin',
  TECHNICIAN: 'Technician',
  MAKE_WORKER: 'Make Worker',
};

function TimelineItem({ event, isLast }: { event: AuditEvent; isLast: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = eventTypeConfig[event.eventType];
  const Icon = config.icon;
  
  const formattedDate = new Date(event.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('relative pl-8', !isLast && 'pb-8')}>
n      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-gray-200" />
      )}
      
      {/* Timeline dot */}
      <div className={cn(
        'absolute left-0 top-1 w-6 h-6 rounded-full bg-white border-2 flex items-center justify-center',
        event.eventType.includes('FAILED') || event.eventType.includes('CANCELLED')
          ? 'border-rose-400'
          : event.eventType.includes('APPROVED') || event.eventType.includes('CREATED') || event.eventType.includes('VERIFIED')
          ? 'border-emerald-400'
          : 'border-sky-400'
      )}>
        <Icon className={cn('w-3 h-3', config.color)} />
      </div>
      
      {/* Content */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-gray-900">{config.label}</p>
            <p className="text-sm text-gray-500">
              {event.actorName && (
                <span className="font-medium text-gray-700">{event.actorName}</span>
              )}
              {event.actorName && ' • '}
              <span>{actorTypeLabels[event.actorType]}</span>
            </p>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">{formattedDate}</span>
        </div>
        
        <p className="text-sm text-gray-600">{event.summary}</p>
        
        {event.payload && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-[#2F8E92] hover:text-[#236B6E] transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {isExpanded ? 'Hide details' : 'View details'}
          </button>
        )}
        
        {isExpanded && event.payload && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg">
            <pre className="text-xs text-gray-600 overflow-x-auto">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function JobTimeline({ events }: JobTimelineProps) {
  // Sort events by createdAt (oldest first)
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-0">
      {sortedEvents.map((event, index) => (
        <TimelineItem
          key={event.id}
          event={event}
          isLast={index === sortedEvents.length - 1}
        />
      ))}
    </div>
  );
}
