import type { AppointmentDocument } from '@spartan-g/shared-types';

/** Presentation only. Never changes appointment timestamps or scheduling policy. */
export function appointmentDateParts(value: AppointmentDocument['scheduledAt']) {
  const date=value?.toDate?.();
  if(!date||!Number.isFinite(date.getTime()))return null;
  return {month:date.toLocaleDateString(undefined,{month:'short'}),day:date.getDate(),year:date.getFullYear(),date};
}
export function appointmentTimeLabel(value: AppointmentDocument['scheduledAt'],duration:number) {
  const parts=appointmentDateParts(value);
  if(!parts)return 'Time unavailable';
  const time=(date:Date)=>date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  if(!Number.isFinite(duration)||duration<=0)return time(parts.date);
  return `${time(parts.date)} – ${time(new Date(parts.date.getTime()+duration*60000))} (${duration} minutes)`;
}
