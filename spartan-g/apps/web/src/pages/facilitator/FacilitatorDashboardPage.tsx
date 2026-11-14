import { DashboardReadState } from "../../components/DashboardReadState";
import { StaffProfileBanner } from "../../components/StaffProfileBanner";
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useFacilitatorDashboard } from '../../hooks/useFacilitatorDashboard';
import { appointmentService } from '@spartan-g/shared-services';
import { notificationRoute, type UiNotification } from '../../lib/notificationRouting';
import '../../styles/facilitator-focus.css';

export function FacilitatorDashboardPage(){
 const {user}=useAuth();const navigate=useNavigate();const {data,sections,loading,error,reload}=useFacilitatorDashboard();
 useEffect(()=>{document.title='Facilitator Dashboard | SPARTAN-G'},[]);
 const risk=data?.riskSummary;const requests=data?.todayAppointments?.requests??0;
 const appointments=data?.upcomingAppointments??[];const messages=data?.recentConversations??[];
 const alerts=(risk?.high??0)+(risk?.medium??0)+(risk?.low??0);
 function openNotification(item:UiNotification){if(!item.isRead)void appointmentService.markNotificationRead(item.id).catch(()=>undefined);const route=notificationRoute(user?.role,item);if(route)navigate(route)}
 return <div className="facilitator-focus"><StaffProfileBanner role="Facilitator" description="Focus on the people who need you today." loading={loading} onRefresh={reload} />
 {error&&<p role="alert" className="ff-error">Some information is unavailable: {error} <button onClick={reload}>Retry</button></p>}
 {loading&&!data?null:<section className="ff-metrics" aria-label="Facilitator summary">
 <DashboardReadState section={sections.risk} label="risk alerts" retry={reload}><div className="ff-metric"><span className="ff-kicker">Open alerts</span><strong>{alerts}</strong><span>{alerts===0?'No open indicators':'Review assigned indicators'}</span></div></DashboardReadState>
 <DashboardReadState section={sections.appointments} label="today appointments" retry={reload}><div className="ff-metric"><span className="ff-kicker">Today</span><strong>{data?.todayAppointments?.total??0}</strong><span>{data?.todayAppointments?.completed??0} completed</span></div></DashboardReadState>
 <DashboardReadState section={sections.appointments} label="appointment requests" retry={reload}><div className="ff-metric"><span className="ff-kicker">Requests</span><strong>{requests}</strong><span>{requests===0?'Queue is clear':'Awaiting your response'}</span></div></DashboardReadState>
 <DashboardReadState section={sections.messages} label="unread messages" retry={reload}><div className="ff-metric"><span className="ff-kicker">Messages</span><strong>{data?.unreadTotal??0}</strong><span>{(data?.unreadTotal??0)===0?'All caught up':'Need your attention'}</span></div></DashboardReadState>
 </section>}
 {loading&&!data?<p role="status">Loading your workspace…</p>:<div className="ff-layout"><div className="ff-main">
 <section className="ff-panel" aria-labelledby="ff-attention"><div className="ff-heading"><h2 id="ff-attention">Needs your attention</h2><span className="ff-kicker">Start here</span></div>
 <DashboardReadState section={sections.risk} label="risk summary" retry={reload}>{risk===null||risk===undefined?<p className="ff-empty">Risk summary unavailable. <Link to="/facilitator/risk-alerts">Open risk alerts →</Link></p>:alerts>0?<div className={'ff-attention-row '+(risk.high>0?'ff-urgent':'')}><div><h3>{alerts} open risk {alerts===1?'alert':'alerts'}</h3><p><strong>{risk.high} high / critical</strong> · {risk.medium} medium · {risk.low} low</p><small>Screening indicators for review, not diagnoses.</small></div><Link className="ff-primary" to="/facilitator/risk-alerts">Review alerts →</Link></div>:<p className="ff-empty">No open risk alerts.</p>}</DashboardReadState>
 <DashboardReadState section={sections.appointments} label="appointment requests" retry={reload}><div className="ff-attention-row"><div><h3>{requests>0?requests+' appointment '+(requests===1?'request':'requests'):'Appointment requests'}</h3><p>{requests>0?'Waiting for your response.':'No pending requests in the loaded overview.'}</p></div><Link className="ff-secondary" to="/facilitator/appointments">Review requests →</Link></div></DashboardReadState></section>
 <section className="ff-panel" aria-labelledby="ff-schedule"><div className="ff-heading"><div><h2 id="ff-schedule">Today & next</h2><DashboardReadState section={sections.appointments} label="today appointments" retry={reload}><p>{data?.todayAppointments?.total??0} appointments today · {data?.todayAppointments?.completed??0} completed</p></DashboardReadState></div><Link className="ff-link" to="/facilitator/appointments">Full schedule →</Link></div>
 <DashboardReadState section={sections.appointments} label="upcoming appointments" retry={reload}>{appointments.length===0?<p className="ff-empty">No upcoming accepted appointments.</p>:<ol className="ff-schedule">{appointments.slice(0,3).map((apt,index)=><li key={apt.id} className={index===0?'ff-next':''}><div><span className="ff-kicker">{index===0?'Next appointment':'Upcoming'}</span><h3>{apt.studentName}</h3><time dateTime={apt.scheduledAt.toISOString()}>{apt.scheduledAt.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'})} · Philippine time</time></div><span className="ff-status">Accepted</span></li>)}</ol>}</DashboardReadState>
 </section></div><aside className="ff-side">
 <section className="ff-panel" aria-labelledby="ff-messages"><div className="ff-heading"><h2 id="ff-messages">Messages</h2>{(data?.unreadTotal??0)>0&&<span className="ff-badge">{data?.unreadTotal} unread</span>}</div>
 <DashboardReadState section={sections.messages} label="messages" retry={reload}>{messages.length===0?<p className="ff-empty">No recent conversations.</p>:<ul className="ff-messages">{messages.slice(0,3).map(c=><li key={c.id}><Link to={'/facilitator/messages?conversation='+encodeURIComponent(c.id)}><div><h3>{c.participantName}</h3><p>{c.lastMessage||'Open conversation'}</p></div><span className="ff-message-action">{c.unreadCount>0?<b>{c.unreadCount} unread</b>:null}<span className="ff-action-label">Open <span aria-hidden="true">→</span></span></span></Link></li>)}</ul>}</DashboardReadState>
 <Link className="ff-link" to="/facilitator/messages">All conversations →</Link></section>
 <section className="ff-panel ff-updates" aria-labelledby="ff-updates"><div className="ff-heading"><h2 id="ff-updates">Recent updates</h2><span>{sections.notifications.data ? `${data?.notifications?.unreadCount} unread` : ""}</span></div><DashboardReadState section={sections.notifications} label="notifications" retry={reload}>{!data?.notifications?.recent.length?<p className="ff-empty">You’re all caught up.</p>:<ul>{data.notifications!.recent.slice(0,3).map(n=><li key={n.id}><button disabled={n.isRead&&!notificationRoute(user?.role,n)} onClick={()=>openNotification(n)}><span>{!n.isRead&&<span className="ff-unread">Unread · </span>}{n.title}</span><span className="ff-action-label">{notificationRoute(user?.role,n)?"View →":n.isRead?"Read":"Mark read"}</span></button></li>)}</ul>}</DashboardReadState></section>
 </aside></div>}
 </div>;
}
